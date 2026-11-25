import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ArtCache} from './artCache.js';
import {checkConflicts} from './conflicts.js';
import {ControlCenter} from './controlCenter.js';
import {dumpMarkedTree} from './debug.js';
import {Disposables} from './disposables.js';
import {MprisWatcher} from './mpris.js';
import {Registry} from './registry.js';

export class Controller {
    constructor(extension) {
        this._extension = extension;
        this._settings = null;
        this._disposables = null;
        this._registry = null;
        this._cc = null;
        this._artCache = null;
        this._mpris = null;
        this._unsubMpris = null;
    }

    _isDebug() {
        return (this._settings?.get_boolean('debug') ?? false) ||
            GLib.getenv('TAHOE_CC_DEBUG') === '1';
    }

    _startMpris() {
        if (this._mpris) return;
        this._mpris = new MprisWatcher();
        this._unsubMpris = this._mpris.onChanged(state => {
            this._cc?.updateMusicState(state);
        });
    }

    _stopMpris() {
        if (this._unsubMpris) {
            try { this._unsubMpris(); } catch (e) {}
            this._unsubMpris = null;
        }
        if (this._mpris) {
            try { this._mpris.destroy(); } catch (e) {}
            this._mpris = null;
        }
        this._cc?.updateMusicState(null);
    }

    enable() {
        console.log('[TahoeCC] enable');
        try {
            this._settings = this._extension.getSettings();
            checkConflicts();

            const qs = Main.panel.statusArea.quickSettings;
            const debug = this._isDebug();

            if (debug)
                dumpMarkedTree('TREE_STOCK', qs.menu.box);

            this._disposables = new Disposables();
            this._artCache = new ArtCache({
                fetchRemoteArt: this._settings.get_boolean('fetch-remote-art'),
            });
            this._disposables.add(() => {
                this._artCache?.destroy();
                this._artCache = null;
            });

            this._registry = new Registry(qs, this._disposables);
            this._cc = new ControlCenter(qs, this._registry, this._disposables, this._settings, {
                artCache: this._artCache,
                onPrev: bus => this._mpris?.previous(bus),
                onPlayPause: bus => this._mpris?.playPause(bus),
                onNext: bus => this._mpris?.next(bus),
            });
            this._cc.enable();

            if (this._settings.get_boolean('music-card-enabled'))
                this._startMpris();

            this._disposables.add(() => this._stopMpris());

            this._disposables.connect(this._settings, 'changed::layout-json', () => {
                this._cc?.queueRelayout();
            });
            this._disposables.connect(this._settings, 'changed::music-card-enabled', () => {
                if (this._settings.get_boolean('music-card-enabled'))
                    this._startMpris();
                else
                    this._stopMpris();
                this._cc?.queueRelayout();
            });
            this._disposables.connect(this._settings, 'changed::fetch-remote-art', () => {
                this._artCache?.setFetchRemoteArt(this._settings.get_boolean('fetch-remote-art'));
            });

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
            this._stopMpris();
        } catch (e) {
            console.error('[TahoeCC] disable MPRIS error', e);
        }

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
