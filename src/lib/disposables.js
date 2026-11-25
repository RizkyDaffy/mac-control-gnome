// Disposables: tracks signal connections, timeouts, idle sources, cancellables
// for clean teardown in disable(). Every connect/timeout/idle/cancellable MUST
// be registered here so disable() leaves zero leaks.
//
// NOTE: GLib and Gio must be in scope (via imports.gi or Shell environment)
// when timeout(), idle(), and cancellable() are called at runtime.
// These methods are NOT called by the pure test suite, so the module is safely
// importable in a plain gjs -m context.

export class Disposables {
    constructor() { this._items = []; }

    connect(obj, sig, cb) {
        const id = obj.connect(sig, cb);
        this._items.push(() => { try { obj.disconnect(id); } catch(e) {} });
        return id;
    }

    timeout(ms, cb) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, cb);
        let fired = false;
        const rm = () => { if (!fired) { fired = true; GLib.Source.remove(id); } };
        this._items.push(rm);
        return id;
    }

    idle(cb) {
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, cb);
        let fired = false;
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
