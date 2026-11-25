# Phase 1 report

## Done
- Created Phase 1 extension skeleton (`tahoe-control-center@local`) in `src/`:
  - `src/metadata.json` (`shell-version: ["51"]`, `settings-schema: "org.gnome.shell.extensions.tahoe-control-center"`).
  - `src/extension.js` (GNOME Shell 45+ ESM `Extension` subclass wrapping `Controller.enable()` in `try/catch`).
  - `src/lib/controller.js` (`enable()` / `disable()` with `[TahoeCC]` logs and `Disposables` lifecycle).
  - `src/lib/disposables.js` (explicit `GLib` and `Gio` ESM imports; `timeout()` and `idle()` track `fired = true` when callbacks return falsy/`GLib.SOURCE_REMOVE` so `dispose()` does not remove already-expired sources; `connect()`, `cancellable()`, `add()`, `dispose()`, `size`).
  - `src/lib/debug.js` (`dumpActorTree()`).
  - `src/lib/layoutConfig.js`, `src/lib/layoutPlan.js`, `src/lib/mprisMetadata.js`, `src/lib/playerSelection.js` (pure modules, no Shell/Clutter/St imports).
  - `src/schemas/org.gnome.shell.extensions.tahoe-control-center.gschema.xml` (5 keys: `music-card-enabled`, `show-battery-pill`, `fetch-remote-art`, `layout-json`, `debug`).
  - `src/stylesheet.css` (structural `.mac-cc-*` skeleton).
- Created build, dev, and test tooling:
  - `Makefile` (`install` with `ln -sfn`, `schemas`, `nested`, `logs`, `test`, `pack`, `uninstall`, `clean`).
  - `scripts/dev-shell.sh` (isolated dconf profile at `~/.cache/tahoe-cc-dev/dconf-profile` using `user-db:tahoe_cc_dev`, enables `user-theme@gnome-shell-extensions.gcampax.github.com` + `tahoe-control-center@local` in dev db only, launches `gnome-shell --devkit`).
  - `tests/run.js` + `tests/fixtures/mpris/{spotify,firefox-youtube,vlc,empty,malformed}.json`.
  - `.gitignore` and `docs/progress/.gitkeep`.

## Verified how (commands, screenshots, test output)
- `make schemas`: `glib-compile-schemas src/schemas/` exited 0 and generated `src/schemas/gschemas.compiled`.
- `make test`: `gjs -m tests/run.js` exited 0 with `Results: 77 passed, 0 failed` / `ALL TESTS PASSED` (covering `Disposables` including `gi://GLib`/`gi://Gio` `cancellable()`, `timeout()`, `idle()`, `layoutConfig`, `layoutPlan`, `mprisMetadata`, and `playerSelection`).
- `make install` (run twice consecutively): `ln -sfn` cleanly replaced `~/.local/share/gnome-shell/extensions/tahoe-control-center@local -> .../src` without nesting `src/src`.
- `bash -n scripts/dev-shell.sh`: syntax check passed.
- Isolated dconf verification (without launching `gnome-shell --devkit`):
  - `DCONF_PROFILE="$HOME/.cache/tahoe-cc-dev/dconf-profile" dconf read /org/gnome/shell/enabled-extensions` returned `['user-theme@gnome-shell-extensions.gcampax.github.com', 'tahoe-control-center@local']`.
  - Live `gsettings get org.gnome.shell enabled-extensions` remained unchanged before and after (does not contain `tahoe-control-center@local`).

## Deviations from docs (and why)
- `src/lib/mprisMetadata.js`: GJS 1.90.0 does not define a global `URL` constructor (`typeof URL === 'undefined'`), so `new URL(rawUrl)` failed silently. Replaced with pure regex `isValidArtUrl()` allowing `http://`, `https://`, and `file://` URLs with no whitespace.
- `scripts/dev-shell.sh`: `06-DEV-ENV-AND-TESTING.md` suggested `user-db:tahoe-cc-dev` and `dbus-run-session -- gnome-shell --devkit`. On this system:
  1. `dconf` rejects hyphens in `user-db` names (`g_dbus_connection_call_sync_internal: assertion 'object_path != NULL && g_variant_is_object_path (object_path)' failed`), because dconf constructs `/ca/desrt/dconf/Writer/<name>`. Changed to `user-db:tahoe_cc_dev`.
  2. `dbus-run-session` is not installed (`which dbus-run-session` returned nothing), so `dev-shell.sh` executes `gnome-shell --devkit` directly.

## Open issues / risks discovered
- `make nested` (`gnome-shell --devkit`) has not been launched interactively yet (AT-1 live devkit launch remains for human / Phase 2 verification).
- `dbus-run-session` is not installed on this machine; if a separate session D-Bus is desired later for nested testing, `dbus-daemon` / `dbus-x11` would need to be installed by the user.

## Questions for the human
- None blocking Phase 2; human can test `make nested` to confirm `gnome-shell --devkit` launches cleanly with the MacTahoe theme and `[TahoeCC] enable` log output.

## Next phase readiness
- Ready for Phase 2 (identity relayout): extension structure, compiled GSettings schema, `Disposables`, symlink install, isolated dconf profile, and pure unit test runner are all in place and passing.
