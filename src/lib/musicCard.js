import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {setArtOnWidget} from './artCache.js';

export class MusicCard {
    constructor({onPrev, onPlayPause, onNext, artCache} = {}) {
        this._onPrev = onPrev;
        this._onPlayPause = onPlayPause;
        this._onNext = onNext;
        this._artCache = artCache;

        this._busName = null;
        this._lastArtUrl = null;
        this._artCancellable = null;
        this._destroyed = false;

        this.actor = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'mac-cc-music-card mac-cc-split-right',
            x_expand: true,
            y_expand: true,
        });
        this.actor.connect('destroy', () => {
            this._destroyed = true;
            this._cancelArt();
            this.actor = null;
        });

        this._art = new St.Widget({
            style_class: 'mac-cc-music-art',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._art);

        const infoBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'mac-cc-music-info',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(infoBox);

        this._titleLabel = new St.Label({
            style_class: 'mac-cc-music-title',
            text: 'Not Playing',
            x_expand: true,
        });
        this._titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        infoBox.add_child(this._titleLabel);

        this._artistLabel = new St.Label({
            style_class: 'mac-cc-music-artist',
            text: '',
            x_expand: true,
            visible: false,
        });
        this._artistLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        infoBox.add_child(this._artistLabel);

        const controls = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'mac-cc-music-controls',
        });
        infoBox.add_child(controls);

        this._prevBtn = this._makeButton('media-skip-backward-symbolic', 'Previous', () => {
            this._onPrev?.(this._busName);
        });
        this._playPauseBtn = this._makeButton('media-playback-start-symbolic', 'Play/Pause', () => {
            this._onPlayPause?.(this._busName);
        });
        this._nextBtn = this._makeButton('media-skip-forward-symbolic', 'Next', () => {
            this._onNext?.(this._busName);
        });

        controls.add_child(this._prevBtn);
        controls.add_child(this._playPauseBtn);
        controls.add_child(this._nextBtn);

        this.update(null);
    }

    _makeButton(iconName, accessibleName, onClick) {
        const icon = new St.Icon({icon_name: iconName});
        const btn = new St.Button({
            style_class: 'icon-button mac-cc-music-btn',
            child: icon,
            accessible_name: accessibleName,
            can_focus: true,
        });
        btn.connect('clicked', onClick);
        return btn;
    }

    _setBtnEnabled(btn, enabled) {
        btn.reactive = enabled;
        btn.can_focus = enabled;
        if (enabled)
            btn.remove_style_pseudo_class('insensitive');
        else
            btn.add_style_pseudo_class('insensitive');
    }

    update(state) {
        if (this._destroyed) return;

        if (!state) {
            this._busName = null;
            this._titleLabel.text = 'Not Playing';
            this._artistLabel.text = '';
            this._artistLabel.hide();
            this._playPauseBtn.child.icon_name = 'media-playback-start-symbolic';

            this._setBtnEnabled(this._prevBtn, false);
            this._setBtnEnabled(this._playPauseBtn, false);
            this._setBtnEnabled(this._nextBtn, false);

            this._cancelArt();
            this._lastArtUrl = null;
            setArtOnWidget(this._art, null);
            return;
        }

        this._busName = state.busName;
        this._titleLabel.text = state.title || 'Not Playing';

        const sub = state.artist || state.album || '';
        this._artistLabel.text = sub;
        this._artistLabel.visible = Boolean(sub);

        const isPlaying = state.status === 'Playing';
        this._playPauseBtn.child.icon_name = isPlaying
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';

        const canControl = Boolean(state.canControl);
        this._setBtnEnabled(this._prevBtn, canControl && Boolean(state.canGoPrevious));
        this._setBtnEnabled(this._playPauseBtn, canControl && (isPlaying ? Boolean(state.canPause || state.canPlay) : Boolean(state.canPlay || state.canPause)));
        this._setBtnEnabled(this._nextBtn, canControl && Boolean(state.canGoNext));

        const artUrl = state.artUrl ?? null;
        if (artUrl !== this._lastArtUrl) {
            this._lastArtUrl = artUrl;
            this._cancelArt();
            if (!artUrl || !this._artCache) {
                setArtOnWidget(this._art, null);
            } else {
                const cancellable = new Gio.Cancellable();
                this._artCancellable = cancellable;
                this._artCache.resolveArt(artUrl, cancellable).then(localPath => {
                    if (this._destroyed || cancellable.is_cancelled()) return;
                    setArtOnWidget(this._art, localPath);
                }).catch(() => {});
            }
        }
    }

    _cancelArt() {
        if (this._artCancellable) {
            this._artCancellable.cancel();
            this._artCancellable = null;
        }
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._cancelArt();
        if (this.actor) {
            try { this.actor.destroy(); } catch (e) {}
            this.actor = null;
        }
    }
}
