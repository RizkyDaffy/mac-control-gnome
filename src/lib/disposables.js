// Disposables: tracks signal connections, timeouts, idle sources, cancellables
// for clean teardown in disable(). Every connect/timeout/idle/cancellable MUST
// be registered here so disable() leaves zero leaks.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export class Disposables {
    constructor() { this._items = []; }

    connect(obj, sig, cb) {
        const id = obj.connect(sig, cb);
        this._items.push(() => { try { obj.disconnect(id); } catch (e) {} });
        return id;
    }

    timeout(ms, cb) {
        let fired = false;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            let res = GLib.SOURCE_REMOVE;
            try {
                res = cb();
            } finally {
                if (!res) fired = true;
            }
            return res;
        });
        const rm = () => { if (!fired) { fired = true; GLib.Source.remove(id); } };
        this._items.push(rm);
        return id;
    }

    idle(cb) {
        let fired = false;
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            let res = GLib.SOURCE_REMOVE;
            try {
                res = cb();
            } finally {
                if (!res) fired = true;
            }
            return res;
        });
        const rm = () => { if (!fired) { fired = true; GLib.Source.remove(id); } };
        this._items.push(rm);
        return id;
    }

    cancellable() {
        const c = new Gio.Cancellable();
        this._items.push(() => c.cancel());
        return c;
    }

    add(fn) { this._items.push(fn); }

    dispose() {
        while (this._items.length) {
            try { this._items.pop()(); } catch (e) { console.error('[TahoeCC]', e); }
        }
    }

    get size() { return this._items.length; }
}
