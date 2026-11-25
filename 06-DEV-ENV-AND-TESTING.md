# 06: Dev Environment, Debugging & Testing

## 1. Facts the human must collect first

Run these in a terminal on the user's machine and paste output into
`docs/reference/environment.md`:

```bash
gnome-shell --version
lsb_release -a
echo "$XDG_SESSION_TYPE"            # expect: wayland
gnome-extensions list --enabled
gsettings get org.gnome.shell.extensions.user-theme name
gsettings get org.gnome.desktop.interface gtk-theme
gsettings get org.gnome.desktop.interface color-scheme
gsettings get org.gnome.desktop.interface text-scaling-factor
dpkg -l | grep -E '^ii\s+(gnome-shell|mutter|libmutter|gjs|libsoup)'
playerctl --list-all 2>/dev/null     # which MPRIS players are running (if playerctl is installed)
```

Also useful: a screenshot of the *current* panel and a note of which of Spotify, Firefox,
Chromium, VLC, etc. the user actually uses.

## 2. Tools to install (ask the human before using sudo, the agent must not run sudo)

- `gnome-extensions` CLI (ships with `gnome-shell`), `glib-compile-schemas`
  (`libglib2.0-dev-bin` on Ubuntu), `gjs`, `dbus-run-session` (`dbus-daemon`/`dbus-x11`),
  `gresource` (`libglib2.0-bin`), `dconf-cli`, `busctl`/`gdbus`, `playerctl` (testing).
- For GNOME 49+: the **mutter devkit** package providing `gnome-shell --devkit`
  (Ubuntu package name unconfirmed: search with `apt search devkit`, **VERIFY**).
  For GNOME <= 48: `gnome-shell --nested --wayland` (needs `mutter` dev tools / works out of the box).
- Optional: `eslint` with a GJS/GNOME config; not required, keep the project dependency-free.

## 3. Safe iteration loop (nested shell + isolated dconf)

**Why:** on Wayland you cannot reload the shell in the live session (restarting loses the
session), and JS modules are cached, so each code change needs a fresh shell. A nested shell
gives that without touching the user's desktop.

**Hazard:** a nested session shares the user's dconf database by default. Running
`gnome-extensions enable ...` inside it would enable the experimental extension in the live
session too. Avoid this with a separate dconf profile.

`scripts/dev-shell.sh` must (agent to implement, then test):

1. Create `~/.cache/tahoe-cc-dev/` with a dconf profile file containing a single line
   `user-db:tahoe-cc-dev` and use `DCONF_PROFILE=<absolute path to that file>` (**VERIFY** that
   dconf accepts an absolute path on this system; otherwise place a named profile in
   `~/.config/dconf/profile/`... or `XDG_CONFIG_HOME` trick).
2. Seed the dev db from the user's current settings so the theme/wallpaper match:
   `dconf dump / | DCONF_PROFILE=... dconf load /`.
3. In the dev db set `org.gnome.shell enabled-extensions` to
   `['user-theme@gnome-shell-extensions.gcampax.github.com', '<our uuid>']` (plus Blur My Shell
   only if the human wants blur in tests) and `disable-user-extensions` to false.
4. Launch:
   - GNOME <= 48: `DCONF_PROFILE=... dbus-run-session -- gnome-shell --nested --wayland`
   - GNOME >= 49: `DCONF_PROFILE=... dbus-run-session -- gnome-shell --devkit` (**VERIFY** flags
     for the installed version: `gnome-shell --help`).
5. Print how to open Looking Glass in the nested shell (`Alt+F2`, `lg`).

The script must refuse to run if it detects it would write to the host's default dconf
(check `DCONF_PROFILE` is set before launching).

Install the extension for the loop by **symlinking** `src/` to
`~/.local/share/gnome-shell/extensions/<uuid>` (`make install`). Symlinked dirs are fine for
dev; note this makes the extension *available* to the live session but **not enabled** there.

Iteration: edit code, close the nested window, run `make nested` again (about 5 s).

## 4. Logging and debugging

- Logs: `journalctl -f -o cat /usr/bin/gnome-shell` (host) shows the **host** shell's logs.
  For the nested shell, its stdout/stderr go to the terminal that launched it. Filter with
  `| grep TahoeCC`.
- `console.debug()` only prints with `G_MESSAGES_DEBUG=all` or the extension's debug flag; use
  the project's logger that honours `debug`/`TAHOE_CC_DEBUG`.
- **Looking Glass** (nested shell): `Alt+F2` → `lg`. Evaluator tab examples:
  ```js
  const qs = Main.panel.statusArea.quickSettings;
  qs.menu.box.get_children().map(c => c.constructor.name)
  qs.menu._grid.get_children().map(c => [c.constructor.name, c.style_class, c.visible])
  ```
  The Inspector (pick icon) shows the actor under the pointer with its style class, which
  is the fastest way to confirm what an item is.
- `lib/debug.js: dumpActorTree(actor, maxDepth)` prints type, `style_class`, `visible`,
  allocation box, parent, child index. Used for the stock-vs-restored diff.
- `gnome-extensions info <uuid>` shows state/errors. Errors during load appear in Looking Glass →
  Extensions tab.
- D-Bus: `busctl --user list | grep mpris`; `gdbus introspect --session --dest
  org.mpris.MediaPlayer2.<name> --object-path /org/mpris/MediaPlayer2`; to watch property
  changes `dbus-monitor "type='signal',interface='org.freedesktop.DBus.Properties'"`.

## 5. Automated checks

### 5.1 Pure-logic unit tests (`make test`)

Run with `gjs -m tests/run.js`. Cover `layoutConfig`, `layoutPlan`, `playerSelection`,
`mprisMetadata`, `disposables` (with fake objects). Keep the runner tiny (a `test(name, fn)`
and `assertEquals` helper, no npm deps). Exit non-zero on failure.

### 5.2 Leak loop (`scripts/leak-loop.js`)

Executed in the nested shell via Looking Glass or a `gnome-extensions`-driven script:

```
before = snapshot()                  # counts below
repeat 20: disable(); enable()
after = snapshot()
assert after == before (within tolerance 0)
```
`snapshot()` records: number of children of `quickSettings.menu.box`, `menu._grid` and total
descendants of the quick settings actor; count of our `mac-cc-*` actors (should be 0 when
disabled); count of our GLib source ids still registered (Disposables exposes `size`); open
D-Bus proxy count (Mpris watcher exposes `playerCount`); and signal handler counts if
available (`GObject.signal_handler_find` on the key actors, or track via Disposables).

### 5.3 Stock-restore diff

Dump the tree (a) before enable, (b) after disable, strip addresses/ids, `diff`. Must be empty.

## 6. Manual QA checklist

Mark each in `docs/progress/qa-results.md` with date, GNOME version, result.

**Controls**
- [ ] Wi-Fi: toggle on/off; open the arrow menu; connect to a network; subtitle updates.
- [ ] Bluetooth: toggle; open device list; connect/disconnect a device.
- [ ] Dark Style: toggles the system colour scheme; tile state follows external change
      (change via Settings app / `gsettings`).
- [ ] Do Not Disturb: toggles; state follows external change (`gsettings set
      org.gnome.desktop.notifications show-banners ...`).
- [ ] Volume: drag, click, scroll, mute icon; follows external change.
- [ ] Brightness: drag; follows external change (if a backlight exists).
- [ ] Microphone slider appears when an app records, disappears after; no gap left.
- [ ] Screenshot, Settings, Lock, Power buttons act correctly; power menu usable.
- [ ] Power Mode: open menu, switch profile; subtitle updates.
- [ ] Night Light toggle; Airplane Mode toggle (both directions, Wi-Fi/Bluetooth tiles react).
- [ ] Overflow: dummy extension tile appears, works, and disappears when that extension is disabled.

**Layout and states**
- [ ] Structure matches the mockup; equal gaps; card height equals stacked tiles.
- [ ] Hide Bluetooth (rfkill block / no adapter): stack = Wi-Fi only; card still looks right.
- [ ] Hide Wi-Fi, hide both: card full width.
- [ ] Card disabled in prefs: connectivity block becomes a normal 2-col flow instantly.
- [ ] Sub-menu open pushes content down, no overlap; one at a time; popup closes them.
- [ ] Popup stays on screen with the Wi-Fi list open on a short display (e.g. 768 px high).

**Environment**
- [ ] MacTahoe light and dark variants; default Adwaita (acceptable).
- [ ] Scale 100 / 150 / 200 %; text scaling 1.5; RTL language.
- [ ] Two monitors, move panel between them; hot-unplug.
- [ ] Lock then unlock; suspend then resume; log out then in (human does it).
- [ ] Enable/disable from Extension Manager 10 times by hand.
- [ ] With Blur My Shell, Dash to Dock, and the user's actual extension set enabled.

**Music**
- [ ] No player, Spotify, Firefox YouTube, VLC (or what the user uses); pause/resume from the
      player itself updates the card.
- [ ] Two players; newest playing wins; closing one falls back.
- [ ] Long title, non-Latin title, no art, https art, `file://` art.
- [ ] Prev/Next disabled appearance when unsupported.

## 7. Recovery if the live session breaks

If the user's panel breaks after enabling (and the shell still runs):
`gnome-extensions disable tahoe-control-center@local`.
If the shell won't start: switch to a TTY (`Ctrl+Alt+F3`), log in, run
`gnome-extensions disable tahoe-control-center@local` (or `gsettings set
org.gnome.shell disable-user-extensions true`), then return (`Ctrl+Alt+F1`/`F2`) and
log in again. Include these instructions in the repo README.

## 8. Packaging

`make pack` → `gnome-extensions pack src/ --out-dir dist/ --force` (include
`--extra-source=lib` if needed; schemas are compiled automatically by `pack`, **VERIFY**).
Install on the user's machine with `gnome-extensions install --force dist/<uuid>.shell-extension.zip`
then log out/in once.
