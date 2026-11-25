import {move} from './reparent.js';

// Strategy S-A: SubmenuHost reparents item.menu.actor out of qsMenu._overlay into
// an in-flow SubmenuSlot container, disables Clutter.BindConstraint while hosted,
// and restores everything to _overlay on detachAll()/destroy().
export class SubmenuHost {
    constructor(qsMenu, disposables) {
        this._qsMenu = qsMenu;
        this._disposables = disposables;
        this._entries = [];
        this._dimGuardId = 0;
    }

    _hasOpenMenu() {
        return this._entries.some(e => e.menu.isOpen);
    }

    _ensureDimGuard() {
        const eff = this._qsMenu?._dimEffect;
        if (!eff || this._dimGuardId) return;
        this._dimGuardId = eff.connect('notify::enabled', () => {
            if (eff.enabled && this._hasOpenMenu())
                eff.enabled = false;
        });
    }

    attach(item, slotContainer) {
        const menu = item?.menu;
        const actor = menu?.actor;
        if (!actor || !slotContainer) return;

        // Avoid double-attaching the same menu
        if (this._entries.some(e => e.menu === menu))
            return;

        const origParent = actor.get_parent?.() ?? this._qsMenu._overlay ?? null;
        const origIndex = origParent ? origParent.get_children().indexOf(actor) : -1;
        const constraints = (actor.get_constraints?.() ?? []).map(c => ({
            c,
            enabled: c.enabled,
        }));

        for (const entry of constraints)
            entry.c.enabled = false;

        const origXExpand = actor.x_expand;
        const origYExpand = actor.y_expand;

        move(actor, slotContainer, {xExpand: true, yExpand: false});
        slotContainer.visible = actor.visible;

        this._ensureDimGuard();

        const visId = actor.connect('notify::visible', () => {
            slotContainer.visible = actor.visible;
        });

        const openId = menu.connect('open-state-changed', (_m, isOpen) => {
            if (isOpen) {
                for (const other of this._entries) {
                    if (other.menu !== menu && other.menu.isOpen)
                        other.menu.close({animate: false});
                }
                if (this._qsMenu._dimEffect)
                    this._qsMenu._dimEffect.enabled = false;
            }
        });

        const destroyId = actor.connect('destroy', () => {
            const rec = this._entries.find(e => e.actor === actor);
            if (rec) rec.destroyed = true;
        });

        this._entries.push({
            menu,
            actor,
            slotContainer,
            origParent,
            origIndex,
            origXExpand,
            origYExpand,
            constraints,
            visId,
            openId,
            destroyId,
            destroyed: false,
        });
    }

    detachAll() {
        if (this._dimGuardId && this._qsMenu?._dimEffect) {
            try { this._qsMenu._dimEffect.disconnect(this._dimGuardId); } catch (e) {}
            this._dimGuardId = 0;
        }

        // Close any open menus first without animation
        for (const rec of this._entries) {
            if (!rec.destroyed && rec.menu.isOpen) {
                try { rec.menu.close({animate: false}); } catch (e) {}
            }
        }

        // Disconnect signals and restore to original overlay parent in ascending index order
        const sorted = [...this._entries].sort((a, b) => a.origIndex - b.origIndex);
        for (const rec of sorted) {
            if (!rec.destroyed) {
                try { rec.actor.disconnect(rec.visId); } catch (e) {}
                try { rec.actor.disconnect(rec.destroyId); } catch (e) {}
            }
            try { rec.menu.disconnect(rec.openId); } catch (e) {}

            if (!rec.destroyed && rec.origParent) {
                const curParent = rec.actor.get_parent?.();
                if (curParent && curParent !== rec.origParent)
                    curParent.remove_child(rec.actor);
                if (curParent !== rec.origParent) {
                    const n = rec.origParent.get_n_children?.() ?? 0;
                    const idx = rec.origIndex >= 0 ? Math.max(0, Math.min(rec.origIndex, n)) : n;
                    rec.origParent.insert_child_at_index(rec.actor, idx);
                }

                rec.actor.x_expand = rec.origXExpand;
                rec.actor.y_expand = rec.origYExpand;

                for (const entry of rec.constraints)
                    entry.c.enabled = entry.enabled;
            }
        }

        if (this._qsMenu?._dimEffect)
            this._qsMenu._dimEffect.enabled = false;

        this._entries = [];
    }

    destroy() {
        this.detachAll();
    }
}
