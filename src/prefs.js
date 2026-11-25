// prefs.js — Extension preferences UI.
// GNOME Shell 45+ libadwaita style.
// NEVER import this file from extension.js or any module it loads.
// This module is loaded only by the prefs window (separate process).

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// ── Default layout JSON for the Reset button ─────────────────────────────
const DEFAULT_LAYOUT_JSON = '';

export default class TahoePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_title('Tahoe Control Center');
        window.set_default_size(640, 580);

        const page = new Adw.PreferencesPage({
            title: 'Settings',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // ── Now Playing ───────────────────────────────────────────────────
        const nowPlayingGroup = new Adw.PreferencesGroup({
            title: 'Now Playing Card',
            description: 'Controls the music card shown in Quick Settings.',
        });
        page.add(nowPlayingGroup);

        const musicCardRow = new Adw.SwitchRow({
            title: 'Show Now Playing card',
            subtitle: 'Displays album art, title, artist, and playback controls.',
        });
        settings.bind('music-card-enabled', musicCardRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        nowPlayingGroup.add(musicCardRow);

        const remoteArtRow = new Adw.SwitchRow({
            title: 'Fetch remote album art',
            subtitle: 'Allow downloading album art over HTTPS.',
        });
        settings.bind('fetch-remote-art', remoteArtRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        nowPlayingGroup.add(remoteArtRow);

        // Disable remote art row when card is disabled
        settings.bind('music-card-enabled', remoteArtRow, 'sensitive', Gio.SettingsBindFlags.GET);

        // ── Layout ────────────────────────────────────────────────────────
        const layoutGroup = new Adw.PreferencesGroup({
            title: 'Layout',
            description: 'Customise the Quick Settings block order. Leave blank for the default Tahoe layout.',
        });
        page.add(layoutGroup);

        const layoutRow = new Adw.ExpanderRow({
            title: 'Custom layout JSON',
            subtitle: 'Advanced: provide a JSON object to override block order.',
        });
        layoutGroup.add(layoutRow);

        const textFrame = new Gtk.Frame({margin_start: 12, margin_end: 12, margin_top: 6, margin_bottom: 6});
        const scrollWin = new Gtk.ScrolledWindow({
            min_content_height: 160,
            max_content_height: 320,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });
        textFrame.set_child(scrollWin);

        const textView = new Gtk.TextView({
            monospace: true,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            top_margin: 8,
            bottom_margin: 8,
            left_margin: 8,
            right_margin: 8,
            editable: true,
        });
        scrollWin.set_child(textView);
        layoutRow.add_row(textFrame);

        // Load current value
        const currentJson = settings.get_string('layout-json');
        textView.buffer.text = currentJson;

        // Status label
        const statusLabel = new Gtk.Label({
            label: '',
            xalign: 0,
            margin_start: 12,
            margin_bottom: 6,
            wrap: true,
        });
        layoutRow.add_row(statusLabel);

        // Apply button
        const btnBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.END,
            spacing: 8,
            margin_start: 12,
            margin_end: 12,
            margin_bottom: 8,
        });

        const resetBtn = new Gtk.Button({label: 'Reset to default'});
        resetBtn.add_css_class('destructive-action');
        const applyBtn = new Gtk.Button({label: 'Apply'});
        applyBtn.add_css_class('suggested-action');

        btnBox.append(resetBtn);
        btnBox.append(applyBtn);
        layoutRow.add_row(btnBox);

        applyBtn.connect('clicked', () => {
            const raw = textView.buffer.text.trim();
            if (raw === '') {
                settings.set_string('layout-json', '');
                statusLabel.label = '✓ Reset to default layout.';
                return;
            }
            try {
                const parsed = JSON.parse(raw);
                if (typeof parsed !== 'object' || !Array.isArray(parsed.blocks)) {
                    statusLabel.label = '✗ Must be a JSON object with a "blocks" array.';
                    return;
                }
                settings.set_string('layout-json', raw);
                statusLabel.label = '✓ Applied.';
            } catch (e) {
                statusLabel.label = `✗ Invalid JSON: ${e.message}`;
            }
        });

        resetBtn.connect('clicked', () => {
            settings.set_string('layout-json', DEFAULT_LAYOUT_JSON);
            textView.buffer.text = DEFAULT_LAYOUT_JSON;
            statusLabel.label = '✓ Reset to default layout.';
        });

        // ── Developer ─────────────────────────────────────────────────────
        const devGroup = new Adw.PreferencesGroup({
            title: 'Developer',
        });
        page.add(devGroup);

        const debugRow = new Adw.SwitchRow({
            title: 'Debug logging',
            subtitle: 'Verbose logs + actor tree dump on enable(). Disable in normal use.',
        });
        settings.bind('debug', debugRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        devGroup.add(debugRow);

        // ── Recovery notice ───────────────────────────────────────────────
        const recoveryGroup = new Adw.PreferencesGroup({
            title: 'Recovery',
        });
        page.add(recoveryGroup);

        const recoveryRow = new Adw.ActionRow({
            title: 'Emergency disable',
            subtitle: 'If the shell freezes, switch to a TTY (Ctrl+Alt+F3), run:\n' +
                'gnome-extensions disable tahoe-control-center@local\nthen log back in.',
        });
        recoveryRow.add_prefix(new Gtk.Image({icon_name: 'dialog-warning-symbolic'}));
        recoveryGroup.add(recoveryRow);
    }
}
