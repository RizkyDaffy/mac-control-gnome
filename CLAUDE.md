# CLAUDE.md: Tahoe Control Center (GNOME Shell extension)

You are building a **GNOME Shell extension** that re-lays-out the Quick Settings menu into a
macOS-Tahoe-style Control Center and adds a Now Playing card. Read `docs/01-PRD.md` first,
then `docs/02-ARCHITECTURE.md`. Everything else is reference.

## Project in one paragraph

The stock Quick Settings menu (`Main.panel.statusArea.quickSettings`) is a two-column grid of
items. We **move the existing item actors** into our own container with a different structure
(stacked tiles beside a music card, tile rows, full-width sliders, a row of round buttons),
and we **put everything back on `disable()`**. We do not recreate Wi-Fi/Bluetooth/etc. Visual
theming (glass, colours, radii) comes from the user's MacTahoe shell theme. We only add
structural CSS.

## HARD SAFETY RULES (never violate)

1. **Never kill, restart, or `killall` the user's live `gnome-shell`.** On Wayland that
   destroys the user's whole session and loses their work. Iterate only in a **nested shell /
   devkit** (see `docs/06-DEV-ENV-AND-TESTING.md`). Ask the human to log out/in only at the
   final gates.
2. **Never use `sudo`, and never edit anything under `/usr`, `/etc`, or the MacTahoe theme
   files** (`~/.themes`, `~/.local/share/themes`, `/usr/share/themes`). Read them for
   reference only.
3. **Do not enable the in-development extension in the live session's dconf until the human
   says so.** A nested shell shares dconf with the host by default, so enabling there can
   enable it live. Use the isolated `DCONF_PROFILE` workflow from the dev doc.
4. **`disable()` must fully restore the stock layout** and leave zero leaked actors, signal
   connections, timeouts, D-Bus proxies, or file handles.
5. If something is unknown, **say so and verify it** (read the installed Shell's JS, use Looking
   Glass). Do not invent GNOME Shell APIs. Items marked **VERIFY** in the docs are unconfirmed.
6. Do not add network access other than fetching album art over http(s) (see
   `docs/04-MUSIC-CARD-MPRIS.md`). No telemetry, no analytics.

## Technical rules

- **GNOME Shell 45+ ES modules only.** `import ... from 'resource:///org/gnome/shell/...'`.
  No legacy `imports.*`. Entry class `export default class X extends Extension`.
- Target the version in `docs/reference/environment.md`. Use **feature detection**
  (`if (typeof x?.y === 'function')`), not version string checks, to support adjacent versions.
- **Move, don't recreate.** Reparent existing actors. Preserve their `style_class`, signals,
  and bindings. Never `destroy()` an actor we do not own.
- **Prefer signals over monkey-patching.** If patching is unavoidable use `InjectionManager`
  (from `resource:///org/gnome/shell/extensions/extension.js`) and remove in `disable()`.
- **Pure logic goes in `src/lib/*.js` with no Shell/Clutter imports** (layout planning,
  player selection, metadata normalising) so it can be unit-tested with plain `gjs`.
- No synchronous I/O or blocking calls in the shell process. Use async APIs with
  `Gio.Cancellable`, and cancel in `disable()`.
- Track every `GLib.timeout_add/idle_add` source id and every `connect()` id; remove all in
  `disable()`. Use a small `Disposables` helper (see architecture doc).
- Do not import `Gtk`/`Gdk`/`Adw` in `extension.js` or anything it loads (shell process). They
  are allowed only in `prefs.js`.
- Never call `run_dispose()`. Do not leave `try/catch` around calls that cannot throw. Do
  catch at **boundaries** (item resolution, MPRIS parsing, art fetching) so one failure never
  takes down the shell or the whole panel.
- **St CSS is not web CSS.** No `var()`, `calc()`, flex/grid, `gap`, `backdrop-filter`. See
  `docs/03-UI-SPEC.md` section 6. Use `spacing`, `border-radius`, `background-color`,
  `min-height`, `padding`, `-st-*` props.
- Never hardcode colours that the theme already provides. Reuse theme style classes
  (`quick-toggle`, `icon-button`, `quick-slider`, ...) so the MacTahoe glass look applies.
- Style: 4-space indent, single quotes, semicolons, `camelCase`, `PascalCase` classes,
  `_private` members. Log with `console.debug/console.error`, prefixed `[TahoeCC]`. Debug
  logging only when `debug` setting or `TAHOE_CC_DEBUG=1` is on.

## Workflow

- Work **phase by phase** per `docs/05-IMPLEMENTATION-PLAN.md`. Do not jump ahead.
- At the end of each phase write `docs/progress/phase-N-report.md`: what was done, what was
  verified and how, deviations from the docs, open issues. Stop at **human gates**.
- Keep a living `docs/reference/recon.md` (Phase 0) and update it when you learn something
  new about the Shell internals. Correct the docs if they turn out wrong, and flag the change.
- Commit small and often with clear messages (if git is initialised). Never commit build
  artefacts (`*.zip`, compiled schemas).
- Before declaring a phase done: run `make test` (pure-logic tests), run the enable/disable
  leak loop (`docs/06-DEV-ENV-AND-TESTING.md` section 5), and walk the relevant QA checklist.

## Commands (create these in the Makefile; see dev doc)

```
make install      # symlink src/ into ~/.local/share/gnome-shell/extensions/<uuid>
make schemas      # glib-compile-schemas src/schemas
make nested       # run isolated nested/devkit shell with the extension enabled
make logs         # journalctl -f -o cat /usr/bin/gnome-shell (filtered to [TahoeCC])
make test         # gjs -m tests/run.js
make pack         # gnome-extensions pack src/ -> dist/<uuid>.shell-extension.zip
make uninstall
```

## Definition of done (project)

See PRD section 9. In short: the panel matches `docs/reference/target-mockup.png`
structure; every moved control works; sub-menus open correctly; the music card shows/controls
the active MPRIS player; hidden/added items are handled; enable/disable x20 leaks nothing;
the stock layout is restored exactly on disable.
