import GLib from 'gi://GLib';
import St from 'gi://St';
import {move, restoreAll} from './reparent.js';
import {SubmenuHost} from './submenus.js';

export class ControlCenter {
    constructor(quickSettings, registry, disposables) {
        this._qs = quickSettings;
        this._registry = registry;
        this._disposables = disposables;

        this._root = null;
        this._submenuHost = null;
        this._relayoutIdleId = 0;
        this._unsubRegistry = null;
        this._enabled = false;
    }

    _readGridSpacing() {
        let rowSpacing = 12;
        let colSpacing = 12;
        try {
            const node = this._qs.menu._grid.get_theme_node();
            const [fRow, rLen] = node.lookup_length('spacing-rows', false);
            const [fCol, cLen] = node.lookup_length('spacing-columns', false);
            if (fRow && rLen > 0) rowSpacing = rLen;
            if (fCol && cLen > 0) colSpacing = cLen;
        } catch (e) { /* use default 12 */ }
        return {rowSpacing, colSpacing};
    }

    enable() {
        if (this._enabled) return;
        this._enabled = true;

        const {rowSpacing} = this._readGridSpacing();
        this._root = new St.BoxLayout({
            vertical: true,
            style_class: 'mac-cc',
            x_expand: true,
        });
        this._root.layout_manager.spacing = rowSpacing;

        const box = this._qs.menu.box;
        const grid = this._qs.menu._grid;
        const gridIdx = box.get_children().indexOf(grid);
        if (gridIdx >= 0)
            box.insert_child_at_index(this._root, gridIdx + 1);
        else
            box.add_child(this._root);

        this._submenuHost = new SubmenuHost(this._qs.menu, this._disposables);

        this._relayout();
        grid.hide();

        this._unsubRegistry = this._registry.onChanged(() => this.queueRelayout());
    }

    queueRelayout() {
        if (!this._enabled || this._relayoutIdleId) return;
        this._relayoutIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._relayoutIdleId = 0;
            if (this._enabled)
                this._safeRelayout();
            return GLib.SOURCE_REMOVE;
        });
    }

    _safeRelayout() {
        try {
            this._relayout();
        } catch (e) {
            console.error('[TahoeCC] FATAL relayout', e);
            this.disable();
        }
    }

    _relayout() {
        if (!this._root) return;

        // 1. Detach hosted submenus before tearing down row containers
        this._submenuHost?.detachAll();

        // 2. Detach tracked item actors from old containers under _root so destroying rows never destroys items
        this._registry.withMoving(() => {
            for (const snap of this._registry.getSnapshots().values()) {
                if (snap.destroyed) continue;
                let p = snap.actor.get_parent?.() ?? null;
                while (p) {
                    if (p === this._root) {
                        snap.actor.get_parent().remove_child(snap.actor);
                        break;
                    }
                    p = p.get_parent?.() ?? null;
                }
            }
        });

        for (const child of this._root.get_children())
            child.destroy();

        const {rowSpacing, colSpacing} = this._readGridSpacing();
        this._root.layout_manager.spacing = rowSpacing;

        // 3. Group visible items in stock order into 2-column rows matching colSpan
        const visibleItems = this._registry.getStockOrder().filter(it => it.visible);
        const rows = [];
        let lineIndex = 0;
        let curRow = null;

        for (const item of visibleItems) {
            const span = Math.max(1, Math.min(item.colSpan ?? 1, 2));
            if (lineIndex === 0 || lineIndex + span > 2) {
                curRow = {items: [], isHalfWidth: span === 1};
                rows.push(curRow);
                lineIndex = 0;
            }
            curRow.items.push(item);
            if (span === 2) curRow.isHalfWidth = false;
            lineIndex = (lineIndex + span) % 2;
        }

        // 4. Build rows + SubmenuSlots
        this._registry.withMoving(() => {
            for (const row of rows) {
                const rowBox = new St.BoxLayout({
                    vertical: false,
                    x_expand: true,
                    style_class: 'mac-cc-row',
                });
                rowBox.layout_manager.spacing = colSpacing;

                if (row.isHalfWidth)
                    rowBox.layout_manager.homogeneous = true;

                for (const item of row.items)
                    move(item.actor, rowBox, {xExpand: true});

                // Lone colSpan=1 tile gets an empty half-width spacer to match stock 2-col width
                if (row.isHalfWidth && row.items.length === 1)
                    rowBox.add_child(new St.Widget({x_expand: true, reactive: false}));

                this._root.add_child(rowBox);

                const menuItems = row.items.filter(it => it.menu?.actor);
                if (menuItems.length > 0) {
                    const slot = new St.BoxLayout({
                        vertical: true,
                        x_expand: true,
                        visible: false,
                        style_class: 'mac-cc-submenu-slot',
                    });
                    this._root.add_child(slot);
                    for (const it of menuItems)
                        this._submenuHost.attach(it, slot);
                }
            }
        });
    }

    disable() {
        this._enabled = false;

        if (this._relayoutIdleId) {
            try { GLib.Source.remove(this._relayoutIdleId); } catch (e) {}
            this._relayoutIdleId = 0;
        }

        if (this._unsubRegistry) {
            try { this._unsubRegistry(); } catch (e) {}
            this._unsubRegistry = null;
        }

        try {
            this._submenuHost?.destroy();
        } catch (e) {
            console.error('[TahoeCC] SubmenuHost destroy error', e);
        }
        this._submenuHost = null;

        try {
            this._registry.withMoving(() => {
                restoreAll(this._registry.getSnapshots().values());
            });
        } catch (e) {
            console.error('[TahoeCC] restoreAll error', e);
        }

        try {
            this._qs.menu._grid?.show();
        } catch (e) {}

        if (this._root) {
            try {
                this._root.get_parent()?.remove_child(this._root);
                this._root.destroy();
            } catch (e) {
                console.error('[TahoeCC] root destroy error', e);
            }
            this._root = null;
        }
    }
}
