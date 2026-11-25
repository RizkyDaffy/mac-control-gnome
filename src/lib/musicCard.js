import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {setArtOnWidget} from './artCache.js';

export class MusicCard {
    constructor({onPrev, onPlayPause, onNext, artCache, halfWidth = false} = {}) {
        this._onPrev = onPrev;
        this._onPlayPause = onPlayPause;
        this._onNext = onNext;
        this._artCache = artCache;
        this._halfWidth = halfWidth;

        this._busName = null;
        this._lastArtUrl = null;
        this._artCancellable = null;
        this._destroyed = false;

        this._fallbackStyle = null;
        this._hasBgFallback = false;

        const cardClasses = halfWidth
            ? 'quick-slider mac-cc-music-card mac-cc-music-card-half mac-cc-split-right'
            : 'quick-slider mac-cc-music-card mac-cc-split-right';

        this.actor = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: cardClasses,
            x_expand: true,
            y_expand: true,
        });
        this.actor.connect('style-changed', () => this._syncThemeFallback());
        this.actor.connect('destroy', () => {
            this._destroyed = true;
            this._cancelArt();
            this.actor = null;
        });

        this._art = new St.Widget({
            style_class: 'mac-cc-music-art',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
        });
        this.actor.add_child(this._art);

        const infoBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'mac-cc-music-info',
            x_expand: true,
            y_align: Clutter.ActorAlign.START,
        });
        this.actor.add_child(infoBox);

        this._titleLabel = new St.Label({
            style_class: 'mac-cc-music-title',
            text: 'Not Playing',
            x_expand: true,
        });
        this._titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._titleLabel.clutter_text.single_line_mode = true;
        infoBox.add_child(this._titleLabel);

        this._artistLabel = new St.Label({
            style_class: 'mac-cc-music-artist',
            text: '',
            x_expand: true,
            visible: false,
        });
        this._artistLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._artistLabel.clutter_text.single_line_mode = true;
        infoBox.add_child(this._artistLabel);

        const controls = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'mac-cc-music-controls',
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.END,
        });
        controls.layout_manager.homogeneous = true;
        this.actor.add_child(controls);

        this._prevBtn = this._makeButton('media-skip-backward-symbolic', 'Previous', () => {
            this._onPrev?.(this._busName);
        });
        this._playPauseBtn = this._makeButton('media-playback-start-symbolic', 'Play/Pause', () => {
            this._onPlayPause?.(this._busName);
        }, 'mac-cc-music-btn-play');
        this._nextBtn = this._makeButton('media-skip-forward-symbolic', 'Next', () => {
            this._onNext?.(this._busName);
        });

        controls.add_child(this._prevBtn);
        controls.add_child(this._playPauseBtn);
        controls.add_child(this._nextBtn);

        this.update(null);
    }

    _syncThemeFallback() {
        if (this._destroyed || !this.actor) return;
        try {
            const searchRoot = this.actor.get_parent()?.get_parent() ?? this.actor.get_parent();
            const sliderSibling = this._findSiblingByClass(searchRoot, ['quick-slider']);
            const themeBgAlpha = sliderSibling
                ? sliderSibling.get_theme_node().get_background_color().alpha
                : (this._hasBgFallback ? 0 : this.actor.get_theme_node().get_background_color().alpha);

            const tileSibling = this._findSiblingByClass(searchRoot, ['quick-toggle', 'quick-toggle-has-menu']);
            const parts = [];
            let hasBgFallback = false;

            // On themes where .quick-slider is transparent (e.g. stock Yaru/Adwaita),
            // copy background and text color from a sibling .quick-toggle tile.
            if (themeBgAlpha === 0) {
                hasBgFallback = true;
                if (tileSibling) {
                    const sNode = tileSibling.get_theme_node();
                    const sBg = sNode.get_background_color();
                    const sFg = sNode.get_foreground_color();
                    if (sBg.alpha > 0) {
                        parts.push(
                            `background-color: rgba(${sBg.red}, ${sBg.green}, ${sBg.blue}, ${(sBg.alpha / 255).toFixed(3)})`,
                            `color: rgba(${sFg.red}, ${sFg.green}, ${sFg.blue}, ${(sFg.alpha / 255).toFixed(3)})`
                        );
                    } else {
                        parts.push('background-color: rgba(127, 127, 127, 0.18)');
                    }
                } else {
                    parts.push('background-color: rgba(127, 127, 127, 0.18)');
                }
            }

            if (this._halfWidth && tileSibling) {
                const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
                const sNode = tileSibling.get_theme_node();
                const [foundMax, maxW] = sNode.lookup_length('max-width', false);
                if (foundMax && maxW > 0) {
                    const sPad = sNode.get_padding(St.Side.LEFT) + sNode.get_padding(St.Side.RIGHT) +
                        sNode.get_border_width(St.Side.LEFT) + sNode.get_border_width(St.Side.RIGHT);
                    const cNode = this.actor.get_theme_node();
                    const cPad = cNode.get_padding(St.Side.LEFT) + cNode.get_padding(St.Side.RIGHT) +
                        cNode.get_border_width(St.Side.LEFT) + cNode.get_border_width(St.Side.RIGHT);
                    const logicalMax = Math.max(80, Math.round((maxW + sPad - cPad) / scale));
                    if (logicalMax !== 148)
                        parts.push(`max-width: ${logicalMax}px`);
                }
            }

            this._hasBgFallback = hasBgFallback;
            const style = parts.length > 0 ? `${parts.join('; ')};` : null;
            if (this._fallbackStyle !== style) {
                this._fallbackStyle = style;
                this.actor.set_style(style);
            }
        } catch (e) { /* actor unmapped or mid-destroy */ }
    }

    _findSiblingByClass(parent, classNames) {
        if (!parent) return null;
        for (const child of parent.get_children()) {
            if (child === this.actor) continue;
            const tokens = child.style_class?.split(/\s+/) ?? [];
            if (classNames.some(c => tokens.includes(c)))
                return child;
            if (child.get_children) {
                const nested = this._findSiblingByClass(child, classNames);
                if (nested) return nested;
            }
        }
        return null;
    }

    _makeButton(iconName, accessibleName, onClick, extraClass = '') {
        const icon = new St.Icon({icon_name: iconName});
        const btn = new St.Button({
            style_class: extraClass ? `icon-button mac-cc-music-btn ${extraClass}` : 'icon-button mac-cc-music-btn',
            child: icon,
            accessible_name: accessibleName,
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        btn.connect('clicked', onClick);
        return btn;
    }

    _setBtnEnabled(btn, enabled) {
        btn.reactive = enabled;
        btn.can_focus = enabled;
        if (enabled)
            btn.remove_style_class_name('mac-cc-music-btn-disabled');
        else
            btn.add_style_class_name('mac-cc-music-btn-disabled');
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
