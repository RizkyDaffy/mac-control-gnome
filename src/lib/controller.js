import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Disposables} from './disposables.js';
import {Registry} from './registry.js';
import {ControlCenter} from './controlCenter.js';
import {dumpMarkedTree} from './debug.js';

export class Controller {
    constructor(extension) {
        this._extension = extension;
        this._settings = null;
        this._disposables = null;
        this._registry = null;
        this._cc = null;
    }

    _isDebug() {
        return (this._settings?.get_boolean('debug') ?? false) ||
            GLib.getenv('TAHOE_CC_DEBUG') === '1';
    }

    enable() {
        console.log('[TahoeCC] enable');
        try {
            this._settings = this._extension.getSettings();
            const qs = Main.panel.statusArea.quickSettings;
            const debug = this._isDebug();

            if (debug)
                dumpMarkedTree('TREE_STOCK', qs.menu.box);

            this._disposables = new Disposables();
            this._registry = new Registry(qs, this._disposables);
            this._cc = new ControlCenter(qs, this._registry, this._disposables);
            this._cc.enable();

            if (debug)
                dumpMarkedTree('TREE_MOVED', qs.menu.box);
        } catch (e) {
            console.error('[TahoeCC] FATAL', e);
            this.disable();
        }
    }

    disable() {
        console.log('[TahoeCC] disable');
        const debug = this._isDebug();
        let qsBox = null;
        try { qsBox = Main.panel.statusArea.quickSettings?.menu?.box ?? null; } catch (e) {}

        try {
            this._cc?.disable();
        } catch (e) {
            console.error('[TahoeCC] disable ControlCenter error', e);
        }
        this._cc = null;

        try {
            this._registry?.destroy();
        } catch (e) {
            console.error('[TahoeCC] disable Registry error', e);
        }
        this._registry = null;

        try {
            this._disposables?.dispose();
        } catch (e) {
            console.error('[TahoeCC] disable Disposables error', e);
        }
        this._disposables = null;

        if (debug && qsBox)
            dumpMarkedTree('TREE_RESTORED', qsBox);

        this._settings = null;
    }
}
