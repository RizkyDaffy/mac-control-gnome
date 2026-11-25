import {Disposables} from './disposables.js';

export class Controller {
    constructor(extension) {
        this._extension = extension;
        this._disposables = null;
    }

    enable() {
        console.log('[TahoeCC] enable');
        this._disposables = new Disposables();
    }

    disable() {
        console.log('[TahoeCC] disable');
        if (this._disposables) {
            this._disposables.dispose();
            this._disposables = null;
        }
    }
}
