// GNOME Shell 45+ ES module style extension entry point.
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Controller} from './lib/controller.js';

export default class TahoeControlCenter extends Extension {
    enable() {
        try {
            this._controller = new Controller(this);
            this._controller.enable();
        } catch (e) {
            console.error('[TahoeCC] FATAL', e);
            this._controller = null;
        }
    }

    disable() {
        if (this._controller) {
            this._controller.disable();
            this._controller = null;
        }
    }
}
