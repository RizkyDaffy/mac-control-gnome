import St from 'gi://St';
import {snapshot} from './reparent.js';

const CLASS_TO_ID = {
    NMWirelessToggle: 'wifi',
    BluetoothToggle: 'bluetooth',
    DarkModeToggle: 'dark-style',
    DoNotDisturbToggle: 'dnd',
    OutputStreamSlider: 'volume-output',
    InputStreamSlider: 'volume-input',
    BrightnessItem: 'brightness',
    PowerProfilesToggle: 'power-mode',
    NightLightToggle: 'night-light',
    RfkillToggle: 'airplane-mode',
    SystemItem: 'system-item',
};

const INDICATOR_TO_ID = [
    ['_bluetooth', 'bluetooth'],
    ['_darkMode', 'dark-style'],
    ['_doNotDisturb', 'dnd'],
    ['_volumeOutput', 'volume-output'],
    ['_volumeInput', 'volume-input'],
    ['_brightness', 'brightness'],
    ['_powerProfiles', 'power-mode'],
    ['_nightLight', 'night-light'],
    ['_rfkill', 'airplane-mode'],
    ['_system', 'system-item'],
];

export class Registry {
    constructor(quickSettings, disposables) {
        this._qs = quickSettings;
        this._disposables = disposables;
        this._grid = quickSettings.menu._grid;

        this._items = new Map();       // id -> itemEntry
        this._snapshots = new Map();   // actor -> snap
        this._actorToId = new Map();   // actor -> id
        this._stockOrder = [];         // itemEntry[] in initial grid order
        this._listeners = new Set();
        this._unclaimedSeq = 0;
        this._moving = false;
        this._itemConns = new Map();   // actor -> [signalId, ...]

        this._disposables.connect(this._grid, 'child-added', (_container, child) => {
            if (this._moving || this._snapshots.has(child) || this._isPlaceholder(child))
                return;
            this.refresh();
            this._emitChanged();
        });

        this._disposables.connect(this._grid, 'child-removed', (_container, child) => {
            if (this._moving || this._isPlaceholder(child))
                return;
            // If removed by Shell while not being moved by us, drop tracking
            if (this._actorToId.has(child)) {
                this._dropActor(child);
                this._emitChanged();
            }
        });

        this.refresh();
    }

    _isPlaceholder(actor) {
        if (!actor) return true;
        const overlay = this._grid?.layout_manager?._overlay;
        if (overlay && actor === overlay) return true;
        return !(actor instanceof St.Widget);
    }

    _identifyActor(actor) {
        if (this._actorToId.has(actor))
            return this._actorToId.get(actor);

        let id = null;

        // 1. Check known QuickSettings indicator references first
        if (this._qs._network?.quickSettingsItems?.includes(actor)) {
            if (actor.constructor?.name === 'NMWirelessToggle')
                id = 'wifi';
        }

        if (!id) {
            for (const [prop, logicalId] of INDICATOR_TO_ID) {
                if (this._qs[prop]?.quickSettingsItems?.includes(actor)) {
                    id = logicalId;
                    break;
                }
            }
        }

        // 2. Fallback by constructor name
        if (!id) {
            const cname = actor.constructor?.name ?? '';
            if (CLASS_TO_ID[cname])
                id = CLASS_TO_ID[cname];
        }

        // 3. Ensure uniqueness; unclaimed items get stable unique id
        if (!id || this._items.has(id)) {
            const cname = actor.constructor?.name || 'item';
            this._unclaimedSeq += 1;
            id = `unclaimed-${cname}-${this._unclaimedSeq}`;
        }

        return id;
    }

    _classifyKind(id, actor, colSpan) {
        if (id === 'system-item') return 'system';
        if (id === 'volume-output' || id === 'volume-input' || id === 'brightness')
            return 'slider';
        if (actor.style_class?.includes('quick-slider') || colSpan === 2)
            return 'slider';
        return 'toggle';
    }

    refresh() {
        const children = this._grid.get_children();
        for (const child of children) {
            if (this._isPlaceholder(child)) continue;
            if (this._snapshots.has(child)) {
                // Already tracked; sync visible state
                const id = this._actorToId.get(child);
                const entry = this._items.get(id);
                if (entry) entry.visible = child.visible;
                continue;
            }

            const snap = snapshot(child, this._grid);
            const id = this._identifyActor(child);
            const entry = {
                id,
                actor: child,
                kind: this._classifyKind(id, child, snap.colSpan),
                visible: child.visible,
                colSpan: snap.colSpan,
                menu: child.menu ?? null,
            };

            this._snapshots.set(child, snap);
            this._actorToId.set(child, id);
            this._items.set(id, entry);
            this._stockOrder.push(entry);

            const visId = child.connect('notify::visible', () => {
                entry.visible = child.visible;
                this._emitChanged();
            });
            const destroyId = child.connect('destroy', () => {
                snap.destroyed = true;
                this._itemConns.delete(child);
                this._dropActor(child, false);
                this._emitChanged();
            });
            this._itemConns.set(child, [visId, destroyId]);
        }

        // Keep stockOrder sorted by original snapshot index
        this._stockOrder.sort((a, b) => {
            const sa = this._snapshots.get(a.actor);
            const sb = this._snapshots.get(b.actor);
            return (sa?.index ?? 0) - (sb?.index ?? 0);
        });
    }

    _dropActor(actor, disconnect = true) {
        if (disconnect) {
            const ids = this._itemConns.get(actor);
            if (ids) {
                for (const sid of ids) {
                    try { actor.disconnect(sid); } catch (e) {}
                }
                this._itemConns.delete(actor);
            }
        }
        const id = this._actorToId.get(actor);
        this._actorToId.delete(actor);
        this._snapshots.delete(actor);
        if (id) {
            this._items.delete(id);
            this._stockOrder = this._stockOrder.filter(e => e.id !== id);
        }
    }

    withMoving(fn) {
        const prev = this._moving;
        this._moving = true;
        try {
            return fn();
        } finally {
            this._moving = prev;
        }
    }

    getItems() {
        return this._items;
    }

    getSnapshots() {
        return this._snapshots;
    }

    getStockOrder() {
        return this._stockOrder.filter(entry => {
            const snap = this._snapshots.get(entry.actor);
            return snap && !snap.destroyed;
        });
    }

    onChanged(cb) {
        this._listeners.add(cb);
        return () => this._listeners.delete(cb);
    }

    _emitChanged() {
        for (const cb of [...this._listeners]) {
            try { cb(); } catch (e) { console.error('[TahoeCC] Registry listener error', e); }
        }
    }

    destroy() {
        this._listeners.clear();
        for (const [actor, ids] of this._itemConns) {
            const snap = this._snapshots.get(actor);
            if (snap?.destroyed) continue;
            for (const sid of ids) {
                try { actor.disconnect(sid); } catch (e) {}
            }
        }
        this._itemConns.clear();
        this._items.clear();
        this._snapshots.clear();
        this._actorToId.clear();
        this._stockOrder = [];
    }
}
