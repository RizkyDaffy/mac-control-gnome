# Phase 3 report

## Done
- Replaced Phase 2 identity relayout in `src/lib/controlCenter.js` with declarative Tahoe block rendering driven by `validateLayout()` + `planLayout()`:
  - `split`: left vertical stack (`mac-cc-split-left`) for `wifi`/`bluetooth`, right `MusicCard` (`mac-cc-split-right`) when `music-card-enabled` is true; degrades to a `tiles` block when `music-card-enabled` is false.
  - `tiles`: 2-column homogeneous `mac-cc-tile-row` rows with an empty `x_expand: true` spacer for a lone trailing tile.
  - `sliders`: full-width `mac-cc-slider-row` rows.
  - `circles`: `mac-cc-circles` row hosting intact `SystemItem` (individual button extraction deferred as noted).
  - `overflow`: collects unclaimed visible items; full-width items (`slider` / `colSpan === 2`) get dedicated rows, half-width items pair into 2-column rows.
- Per-row `SubmenuSlot` (`mac-cc-submenu-slot`) attached via `SubmenuHost` (Strategy S-A) after each row/block containing `item.menu?.actor`.
- Added `src/lib/dndFallback.js` (no-op stub; DND is stock `DoNotDisturbToggle` on GNOME 51) and `src/lib/conflicts.js` (`checkConflicts()` one-time warning for known layout-conflicting extensions).
- Wired `changed::layout-json` and `changed::music-card-enabled` in `src/lib/controller.js`.

## Verified how (commands, screenshots, test output)
- `make test`: `Results: 99 passed, 0 failed` (`ALL TESTS PASSED`).
- `make schemas`: `Schema compiled: src/schemas/gschemas.compiled` (exit 0).
- `make install`: symlink refreshed (`~/.local/share/gnome-shell/extensions/tahoe-control-center@local`).
- `node --check`: passed on all 17 `.js` files in `src/` and `src/lib/` plus `scripts/leak-loop.js`.

## Deviations from docs (and why)
- `SystemItem` is reparented intact into the `circles` row instead of extracting `ScreenshotItem`/`SettingsItem`/`LockItem`/`ShutdownItem` out of `SystemItem.child` (deferred to avoid child-layout restoration risk in Phase 3; `controlCenter.js` maps `circles` to `['system-item']` when `system-item` is intact so it is not pushed into `overflow`).
- `SubmenuHost` Strategy S-A from Phase 2 already covers Phase 4 per-row slot attachment, idempotent `attach()`, single-open enforcement, and `_dimEffect` suppression.

## Open issues / risks discovered
- Live nested shell (`make nested`) visual verification, submenu animation/focus checks, and `scripts/leak-loop.js` execution remain to be run interactively in `gnome-shell --devkit`.

## Questions for the human
- None blocking; ready for Phase 6 styling pass and nested shell visual review.

## Next phase readiness
- Ready for Phase 6 (styling pass) and Phase 7 (`prefs.js`, hardening, packaging).
