import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {normalizeMetadata} from './mprisMetadata.js';
import {pickActivePlayer} from './playerSelection.js';

const MPRIS_PLAYER_XML = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanControl" type="b" access="read"/>
  </interface>
</node>`;

const MprisPlayerProxy = Gio.DBusProxy.makeProxyWrapper(MPRIS_PLAYER_XML);
const DEBOUNCE_MS = 100;

function unpackMetadata(rawMeta) {
    if (!rawMeta || typeof rawMeta !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(rawMeta))
        out[k] = v?.deep_unpack ? v.deep_unpack() : v;
    return out;
}

export class MprisWatcher {
    constructor() {
        this._players = new Map(); // busName -> { busName, proxy, state, propSigId, cancellable }
        this._listeners = new Set();
        this._activeBusName = null;
        this._debounceId = 0;
        this._cancellable = new Gio.Cancellable();
        this._destroyed = false;

        this._nameOwnerSubId = Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus',
            'org.freedesktop.DBus',
            'NameOwnerChanged',
            '/org/freedesktop/DBus',
            null,
            Gio.DBusSignalFlags.NONE,
            (_conn, _sender, _path, _iface, _signal, params) => {
                if (this._destroyed) return;
                const [name, _oldOwner, newOwner] = params.deep_unpack();
                if (!this._isMprisName(name)) return;
                if (newOwner)
                    this._addPlayer(name);
                else
                    this._removePlayer(name);
            }
        );

        Gio.DBus.session.call(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            GLib.VariantType.new('(as)'),
            Gio.DBusCallFlags.NONE,
            -1,
            this._cancellable,
            (_conn, res) => {
                if (this._destroyed) return;
                try {
                    const variant = Gio.DBus.session.call_finish(res);
                    const [names] = variant.deep_unpack();
                    for (const name of names) {
                        if (this._isMprisName(name))
                            this._addPlayer(name);
                    }
                } catch (e) {
                    if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.debug('[TahoeCC] MPRIS ListNames error:', e.message);
                }
            }
        );
    }

    _isMprisName(name) {
        return typeof name === 'string' &&
            name.startsWith('org.mpris.MediaPlayer2.') &&
            !name.includes('playerctld');
    }

    _addPlayer(busName) {
        if (this._destroyed || this._players.has(busName)) return;

        const playerCancel = new Gio.Cancellable();
        const rec = {
            busName,
            proxy: null,
            state: null,
            propSigId: 0,
            cancellable: playerCancel,
        };
        this._players.set(busName, rec);

        MprisPlayerProxy(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2',
            (proxy, error) => {
                if (this._destroyed || playerCancel.is_cancelled() || !this._players.has(busName))
                    return;
                if (error || !proxy) {
                    this._players.delete(busName);
                    return;
                }

                rec.proxy = proxy;
                this._syncPlayerState(rec, true);
                rec.propSigId = proxy.connect('g-properties-changed', () => {
                    if (!this._destroyed)
                        this._syncPlayerState(rec, false);
                });
                this._scheduleEmit();
            },
            playerCancel
        );
    }

    _removePlayer(busName) {
        const rec = this._players.get(busName);
        if (!rec) return;
        rec.cancellable.cancel();
        if (rec.proxy && rec.propSigId) {
            try { rec.proxy.disconnect(rec.propSigId); } catch (e) {}
        }
        rec.proxy = null;
        this._players.delete(busName);
        this._scheduleEmit();
    }

    _syncPlayerState(rec, isInitial) {
        const p = rec.proxy;
        if (!p) return;

        const status = typeof p.PlaybackStatus === 'string' ? p.PlaybackStatus : 'Stopped';
        const meta = normalizeMetadata(unpackMetadata(p.Metadata));
        const prevStatus = rec.state?.status;
        const prevTitle = rec.state?.title;

        let lastActive = rec.state?.lastActive ?? 0;
        if (status === 'Playing' && (isInitial || prevStatus !== 'Playing' || meta.title !== prevTitle))
            lastActive = Date.now();
        else if (isInitial && lastActive === 0)
            lastActive = Date.now() - 1;

        rec.state = {
            busName: rec.busName,
            status,
            lastActive,
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            artUrl: meta.artUrl,
            canControl: Boolean(p.CanControl),
            canPlay: Boolean(p.CanPlay),
            canPause: Boolean(p.CanPause),
            canGoNext: Boolean(p.CanGoNext),
            canGoPrevious: Boolean(p.CanGoPrevious),
        };

        this._scheduleEmit();
    }

    _scheduleEmit() {
        if (this._destroyed || this._debounceId) return;
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._debounceId = 0;
            if (!this._destroyed)
                this._emitActive();
            return GLib.SOURCE_REMOVE;
        });
    }

    _emitActive() {
        const stateMap = new Map();
        for (const [busName, rec] of this._players) {
            if (rec.state)
                stateMap.set(busName, rec.state);
        }
        this._activeBusName = pickActivePlayer(stateMap, this._activeBusName);
        const activeState = this._activeBusName ? (stateMap.get(this._activeBusName) ?? null) : null;
        for (const cb of [...this._listeners]) {
            try { cb(activeState); } catch (e) { console.error('[TahoeCC] MPRIS listener error', e); }
        }
    }

    _callMethod(busName, method) {
        const target = busName ?? this._activeBusName;
        const rec = target ? this._players.get(target) : null;
        if (!rec?.proxy) return;
        rec.proxy.call(method, null, Gio.DBusCallFlags.NONE, -1, this._cancellable, null);
    }

    playPause(busName = null) { this._callMethod(busName, 'PlayPause'); }
    next(busName = null) { this._callMethod(busName, 'Next'); }
    previous(busName = null) { this._callMethod(busName, 'Previous'); }

    get playerCount() {
        return this._players.size;
    }

    onChanged(cb) {
        this._listeners.add(cb);
        return () => this._listeners.delete(cb);
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;

        if (this._debounceId) {
            try { GLib.Source.remove(this._debounceId); } catch (e) {}
            this._debounceId = 0;
        }

        if (this._nameOwnerSubId) {
            try { Gio.DBus.session.signal_unsubscribe(this._nameOwnerSubId); } catch (e) {}
            this._nameOwnerSubId = 0;
        }

        this._cancellable.cancel();

        for (const rec of this._players.values()) {
            rec.cancellable.cancel();
            if (rec.proxy && rec.propSigId) {
                try { rec.proxy.disconnect(rec.propSigId); } catch (e) {}
            }
            rec.proxy = null;
        }
        this._players.clear();
        this._listeners.clear();
        this._activeBusName = null;
    }
}
