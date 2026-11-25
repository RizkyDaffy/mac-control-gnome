# Phase 0 report

## Done
- Extracted installed GNOME Shell 51.0 JS source from `/usr/lib/gnome-shell/libshell-51.so` via `gresource` (`quickSettings.js`, `panel.js`, `panelMenu.js`, `mpris.js`, and `status/{system,network,bluetooth,volume,brightness,nightLight,darkMode,powerProfiles,rfkill,doNotDisturb}.js`).
- Inspected MacTahoe theme CSS in `/home/daproot/.themes/MacTahoe-Dark-blue/gnome-shell/gnome-shell.css` (lines 4110–4450) and checked enabled extensions via `gnome-extensions list --enabled`.
- Wrote [`docs/reference/recon.md`](../reference/recon.md) answering Q-a through Q-j with exact `file:line` references, machine item inventory with conditional flags, MacTahoe CSS selector findings, and sub-menu strategy recommendation (**S-A: Submenu host**).
- Wrote [`docs/reference/tree-stock.txt`](../reference/tree-stock.txt) documenting the stock Quick Settings widget hierarchy derived from GNOME Shell 51.0 source.
- Updated [`02-ARCHITECTURE.md`](../../02-ARCHITECTURE.md) replacing `VERIFY` items with `[VERIFIED GS 51]` facts (`_grid`, `_overlay`, `SystemItem` internals, `DoNotDisturbToggle` stock source, `QuickToggleMenu` constraints & `_dimEffect`, `child_get_property`/`child_set_property`, MacTahoe `.quick-settings-system-item .icon-button`).

## Verified how
- `gresource list /usr/lib/gnome-shell/libshell-51.so` and `gresource extract` into `/tmp/gnome-shell-src/` (GNOME Shell `51.0-2ubuntu3`, GJS `1.90.0`).
- Direct source line inspection of `quickSettings.js`, `panel.js`, `mpris.js`, and `status/*.js`.
- `gnome-extensions list --enabled` confirming 14 enabled extensions and no external DND tile extension.
- Direct inspection of `/home/daproot/.themes/MacTahoe-Dark-blue/gnome-shell/gnome-shell.css:4110-4450` confirming selector scoping, pill radius (`9999px`), tile min/max bounds (`100px`–`172px`), and `.quick-settings-system-item .icon-button` dependency.

## Deviations from docs (and why)
- `docs/reference/tree-stock.txt` is **source-derived** pending the first live nested shell (`gnome-shell --devkit`) capture; live runtime dump and verification of `debug.js` `dumpActorTree()` will be captured in Phase 2 without touching the live user session.
- No separate `tahoe-cc-recon@local` extension was installed because direct gresource source extraction + MacTahoe CSS inspection answered Q-a through Q-j without risking live-session state.
- `02-ARCHITECTURE.md` originally suggested reusing `.quick-toggle` on the music card and choosing between S-A/S-B/S-C; MacTahoe CSS inspection showed `.quick-toggle` enforces `border-radius: 9999px` and `max-width: 172px`, so the card must style independently (or override explicitly), and strategy **S-A** (two variants: direct slot reparenting vs overlay + re-targeted `BindConstraint` + spacer) is recommended instead of keeping tiles in `_grid`.

## Open issues / risks discovered
- **Sub-menu `_dimEffect` & constraint handling (Q-e):** `QuickSettingsMenu` attaches `_dimEffect` (`Clutter.BrightnessContrastEffect`) to `_boxPointer` (`quickSettings.js:756-759, 860-875`), which dims everything inside `menu.box` when a sub-menu opens. Reparenting `menu.actor` inside `_root` (`S-A1`) puts the open sub-menu under `_boxPointer` (and requires removing/restoring the Y `Clutter.BindConstraint`), whereas keeping `menu.actor` in `_overlay` with a re-targeted constraint + height-bound spacer (`S-A2`) keeps it outside `_boxPointer`. Both must be tested in Phase 2 nested shell.
- **No height clamping in stock Shell (Q-i):** `QuickSettingsMenu` has no `St.ScrollView`; Tahoe must wrap `_root` (or handle overflow) if content + open sub-menu exceeds monitor height.
- **System buttons MacTahoe styling (Q-g):** `.quick-settings-system-item .icon-button` (`gnome-shell.css:4420`) styles the 4 round buttons. Reparenting `ScreenshotItem`, `SettingsItem`, `LockItem`, `ShutdownItem` out of `SystemItem` requires putting `quick-settings-system-item` on our `circles` row.
- **DND is stock (Q-c):** `status/doNotDisturb.js` provides `DoNotDisturbToggle` out of the box in GNOME 51 (`_doNotDisturb`), so `dndFallback.js` is only a fallback for systems missing it.
- **MPRIS album art (Q-j):** `ui/mpris.js` in GS 51 is a data model only; art rendering in `musicCard.js` will use St CSS `background-image: url(...)` / `background-size: cover`.

## Questions for the human
- Confirm preference to proceed with **S-A** (`SubmenuSlot`) as the sub-menu strategy, with Phase 2 nested shell testing both S-A1 (direct reparenting into `SubmenuSlot`) and S-A2 (re-targeted `BindConstraint` in `_overlay` + height spacer) before committing to one.

## Next phase readiness
- Ready for Phase 2 (`registry.js`, `reparent.js`, minimal `controlCenter.js`, live `tree-stock.txt` capture in `gnome-shell --devkit`).
