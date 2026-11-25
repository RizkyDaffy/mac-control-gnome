import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {DEFAULT_LAYOUT, validateLayout} from './layoutConfig.js';
import {planLayout} from './layoutPlan.js';
import {MusicCard} from './musicCard.js';
import {move, restoreAll} from './reparent.js';
import {SubmenuHost} from './submenus.js';

export class ControlCenter {
    constructor(quickSettings, registry, disposables, settings = null, mediaOpts = {}) {
        this._qs = quickSettings;
        this._registry = registry;
        this._disposables = disposables;
        this._settings = settings;
        this._mediaOpts = mediaOpts;

        this._root = null;
        this._rootDestroyId = 0;
        this._gridDestroyId = 0;
        this._gridDestroyed = false;
        this._submenuHost = null;
        this._musicCard = null;
        this._lastMusicState = null;
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

    _getLayoutConfig(itemsMap) {
        let config = DEFAULT_LAYOUT;
        if (this._settings) {
            const raw = this._settings.get_string('layout-json');
            const {layout, warnings} = validateLayout(raw);
            for (const w of warnings)
                console.warn('[TahoeCC] layout-json:', w);
            config = layout;
        }

        const musicEnabled = this._settings ? this._settings.get_boolean('music-card-enabled') : true;
        const hasIntactSystem = itemsMap.has('system-item');

        return {
            version: config.version,
            blocks: config.blocks.map(b => {
                if (b.type === 'split' && !musicEnabled)
                    return {type: 'tiles', id: b.id, items: b.stack ?? []};
                if (b.type === 'circles' && hasIntactSystem)
                    return {...b, items: ['system-item']};
                return b;
            }),
        };
    }

    enable() {
        if (this._enabled) return;
        this._enabled = true;

        const {rowSpacing} = this._readGridSpacing();
        this._gridDestroyed = false;
        this._root = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'mac-cc mac-cc-root',
            x_expand: true,
        });
        this._root.layout_manager.spacing = rowSpacing;
        this._rootDestroyId = this._root.connect('destroy', () => {
            this._rootDestroyId = 0;
            this._root = null;
        });

        const box = this._qs.menu.box;
        const grid = this._qs.menu._grid;
        this._gridDestroyId = grid.connect('destroy', () => {
            this._gridDestroyId = 0;
            this._gridDestroyed = true;
            this._enabled = false;
        });
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

    updateMusicState(state) {
        this._lastMusicState = state;
        this._musicCard?.update(state);
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

    _buildTilesRows(rows, itemsMap, colSpacing) {
        const out = [];
        for (const rowIds of rows) {
            const entries = rowIds.map(id => itemsMap.get(id)).filter(Boolean);
            if (entries.length === 0) continue;

            const isFullWidth = entries.some(e => e.kind === 'slider' || (e.colSpan ?? 1) === 2);
            const rowBox = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                x_expand: true,
                style_class: 'mac-cc-tile-row',
            });
            rowBox.layout_manager.spacing = colSpacing;
            if (!isFullWidth)
                rowBox.layout_manager.homogeneous = true;

            for (const entry of entries)
                move(entry.actor, rowBox, {xExpand: true});

            if (!isFullWidth && entries.length === 1)
                rowBox.add_child(new St.Widget({x_expand: true, reactive: false}));

            let slotActor = null;
            const menuEntries = entries.filter(e => e.menu?.actor);
            if (menuEntries.length > 0) {
                slotActor = new St.BoxLayout({
                    orientation: Clutter.Orientation.VERTICAL,
                    x_expand: true,
                    visible: false,
                    style_class: 'mac-cc-submenu-slot',
                });
                for (const entry of menuEntries)
                    this._submenuHost.attach(entry, slotActor);
            }

            out.push({blockActor: rowBox, slotActor});
        }
        return out;
    }

    _buildOverflowRows(itemIds, itemsMap, colSpacing) {
        const rows = [];
        let pendingHalf = [];
        for (const id of itemIds) {
            const entry = itemsMap.get(id);
            if (!entry) continue;
            if (entry.kind === 'slider' || (entry.colSpan ?? 1) === 2) {
                if (pendingHalf.length > 0) {
                    rows.push(pendingHalf);
                    pendingHalf = [];
                }
                rows.push([id]);
            } else {
                pendingHalf.push(id);
                if (pendingHalf.length === 2) {
                    rows.push(pendingHalf);
                    pendingHalf = [];
                }
            }
        }
        if (pendingHalf.length > 0)
            rows.push(pendingHalf);

        return this._buildTilesRows(rows, itemsMap, colSpacing);
    }

    _buildLayout(plan, itemsMap, {rowSpacing, colSpacing}) {
        const sections = [];

        for (const block of plan) {
            if (block.type === 'split') {
                const splitBox = new St.BoxLayout({
                    orientation: Clutter.Orientation.HORIZONTAL,
                    x_expand: true,
                    style_class: 'mac-cc-split',
                });
                splitBox.layout_manager.spacing = colSpacing;

                const stackEntries = (block.stack ?? []).map(id => itemsMap.get(id)).filter(Boolean);
                if (stackEntries.length > 0) {
                    const leftCol = new St.BoxLayout({
                        orientation: Clutter.Orientation.VERTICAL,
                        x_expand: false,
                        style_class: 'mac-cc-split-left',
                    });
                    leftCol.layout_manager.spacing = rowSpacing;
                    for (const entry of stackEntries)
                        move(entry.actor, leftCol, {xExpand: true});
                    splitBox.add_child(leftCol);
                }

                if (block.card) {
                    this._musicCard = new MusicCard(this._mediaOpts);
                    this._musicCard.update(this._lastMusicState);
                    splitBox.add_child(this._musicCard.actor);
                }

                let slotActor = null;
                const menuEntries = stackEntries.filter(e => e.menu?.actor);
                if (menuEntries.length > 0) {
                    slotActor = new St.BoxLayout({
                        orientation: Clutter.Orientation.VERTICAL,
                        x_expand: true,
                        visible: false,
                        style_class: 'mac-cc-submenu-slot',
                    });
                    for (const entry of menuEntries)
                        this._submenuHost.attach(entry, slotActor);
                }

                sections.push({blockActor: splitBox, slotActor});
            } else if (block.type === 'tiles') {
                sections.push(...this._buildTilesRows(block.rows ?? [], itemsMap, colSpacing));
            } else if (block.type === 'sliders') {
                for (const [id] of (block.rows ?? [])) {
                    const entry = itemsMap.get(id);
                    if (!entry) continue;
                    const rowBox = new St.BoxLayout({
                        orientation: Clutter.Orientation.HORIZONTAL,
                        x_expand: true,
                        style_class: 'mac-cc-slider-row',
                    });
                    move(entry.actor, rowBox, {xExpand: true});

                    let slotActor = null;
                    if (entry.menu?.actor) {
                        slotActor = new St.BoxLayout({
                            orientation: Clutter.Orientation.VERTICAL,
                            x_expand: true,
                            visible: false,
                            style_class: 'mac-cc-submenu-slot',
                        });
                        this._submenuHost.attach(entry, slotActor);
                    }
                    sections.push({blockActor: rowBox, slotActor});
                }
            } else if (block.type === 'circles') {
                const entries = (block.items ?? []).map(id => itemsMap.get(id)).filter(Boolean);
                if (entries.length === 0) continue;
                const rowBox = new St.BoxLayout({
                    orientation: Clutter.Orientation.HORIZONTAL,
                    x_expand: true,
                    style_class: 'mac-cc-circles',
                });
                rowBox.layout_manager.spacing = colSpacing;
                for (const entry of entries)
                    move(entry.actor, rowBox, {xExpand: true});

                let slotActor = null;
                const menuEntries = entries.filter(e => e.menu?.actor);
                if (menuEntries.length > 0) {
                    slotActor = new St.BoxLayout({
                        orientation: Clutter.Orientation.VERTICAL,
                        x_expand: true,
                        visible: false,
                        style_class: 'mac-cc-submenu-slot',
                    });
                    for (const entry of menuEntries)
                        this._submenuHost.attach(entry, slotActor);
                }
                sections.push({blockActor: rowBox, slotActor});
            } else if (block.type === 'overflow') {
                sections.push(...this._buildOverflowRows(block.items ?? [], itemsMap, colSpacing));
            }
        }

        return sections;
    }

    _relayout() {
        if (!this._root || !this._enabled || this._gridDestroyed) return;

        // 1. Detach hosted submenus before tearing down containers
        this._submenuHost?.detachAll();

        // 2. Detach tracked item actors from old containers under _root
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

        if (this._musicCard) {
            this._musicCard.destroy();
            this._musicCard = null;
        }

        // 3. Destroy old block/slot containers
        for (const child of this._root.get_children())
            child.destroy();

        const spacing = this._readGridSpacing();
        this._root.layout_manager.spacing = spacing.rowSpacing;

        // 4. Plan + build Tahoe layout
        const itemsMap = this._registry.getItems();
        const config = this._getLayoutConfig(itemsMap);
        const plan = planLayout(config, itemsMap);

        this._registry.withMoving(() => {
            const sections = this._buildLayout(plan, itemsMap, spacing);
            for (const {blockActor, slotActor} of sections) {
                this._root.add_child(blockActor);
                if (slotActor)
                    this._root.add_child(slotActor);
            }
        });

        this._root.show();
        this._qs.menu._grid.hide();
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
            this._musicCard?.destroy();
        } catch (e) {
            console.error('[TahoeCC] MusicCard destroy error', e);
        }
        this._musicCard = null;

        try {
            this._registry.withMoving(() => {
                restoreAll(this._registry.getSnapshots().values());
            });
        } catch (e) {
            console.error('[TahoeCC] restoreAll error', e);
        }

        try {
            if (!this._gridDestroyed)
                this._qs.menu._grid?.show();
        } catch (e) {}

        if (this._gridDestroyId && !this._gridDestroyed) {
            try { this._qs.menu._grid?.disconnect(this._gridDestroyId); } catch (e) {}
            this._gridDestroyId = 0;
        }

        if (this._root) {
            if (this._rootDestroyId) {
                try { this._root.disconnect(this._rootDestroyId); } catch (e) {}
                this._rootDestroyId = 0;
            }
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
