# 05: Implementation Plan

Work strictly in order. Each phase has **tasks**, **deliverables**, and **acceptance tests**.
Phases marked **GATE** end with a stop: write `docs/progress/phase-N-report.md`, summarise to
the human, and wait for approval before continuing.

Legend: `[ ]` task, **AT** = acceptance test, **FR/NFR** refer to the PRD.

---

## Phase 0: Recon spike (GATE)

Goal: replace every **VERIFY** with a verified fact. Build nothing user-visible.

Tasks
- [ ] Read `docs/reference/environment.md` (GNOME/Ubuntu versions, session type, enabled
      extensions, theme). If missing, ask the human to run the commands in
      `06-DEV-ENV-AND-TESTING.md` section 1.
- [ ] Extract the installed Shell's JS (`02-ARCHITECTURE.md` section 9) and read the files listed there.
- [ ] Create a throw-away extension (`tahoe-cc-recon@local`) whose `enable()` logs, via
      `debug.js`, a full actor tree of `Main.panel.statusArea.quickSettings.menu` including: class
      name, `style_class`, `visible`, allocation, parent, child index, column-span, and for
      each item its owning indicator property name.
- [ ] Run it in the nested shell (isolated dconf). Capture the tree to `docs/reference/tree-stock.txt`.
- [ ] Answer, with file/line evidence, in `docs/reference/recon.md`:
  - Q-a. Exact names for the grid, box, and indicator members. How do I list every item?
  - Q-b. For each logical id in `02-ARCHITECTURE.md` section 4.1: which actor, how to identify it robustly.
  - Q-c. Where does the **Do Not Disturb** tile come from (GNOME, an extension, or neither)?
  - Q-d. System item internals: battery label + 4 buttons: names, types, how to reparent them,
         how the power button's menu is created/anchored.
  - Q-e. Sub-menu mechanics: where `menu.actor` lives, who positions it, how open/close and
         "only one open" are implemented, effect of removing a toggle from the grid.
  - Q-f. What the layout manager does on child removal/addition, and what happens if the grid is hidden.
  - Q-g. Exact CSS classes used by tiles, sliders, icon buttons; where the MacTahoe theme styles them.
  - Q-h. Whether `St.BoxLayout` supports `homogeneous` (or what to use for equal columns).
  - Q-i. How the stock popup limits height / scrolls on small screens.
  - Q-j. Which `background-image`/size properties St supports (needed for album art).
- [ ] List which items exist in this machine's grid *and which are conditional*.
- [ ] Update `docs/02-ARCHITECTURE.md` where reality differs (mark the change).

Deliverables: `recon.md`, `tree-stock.txt`, the recon extension, corrected docs.

**AT-0:** every VERIFY in docs 02/03/04 is either confirmed or corrected in `recon.md`; the
human has reviewed the answers to Q-c and Q-e and chosen a sub-menu strategy (S-A/S-B/S-C).

---

## Phase 1: Skeleton + dev loop

Tasks
- [ ] Repo structure: `src/`, `tests/`, `scripts/`, `docs/`, `Makefile`.
- [ ] `src/metadata.json` (uuid `tahoe-control-center@local`; `shell-version` = detected), empty
      `stylesheet.css`, GSettings schema (`02-ARCHITECTURE.md` section 8) compiled.
- [ ] `extension.js` with `Controller` that does nothing but log `[TahoeCC] enable/disable`.
- [ ] `lib/disposables.js` and a tiny unit test for it (with fakes).
- [ ] Scripts: `scripts/dev-shell.sh` (isolated nested shell, see dev doc section 3), `make
      install/schemas/nested/logs/test/pack`.
- [ ] `tests/run.js` that executes pure-logic tests with `gjs -m`.

**AT-1:** `make nested` opens a nested shell with the MacTahoe theme visible and the extension
enabled; logs show enable; disabling prints disable; the host session is **untouched**
(`gsettings get org.gnome.shell enabled-extensions` on the host is unchanged).

---

## Phase 2: Identity relayout: prove reparenting (GATE)

Goal: de-risk everything. Move the real items into **our own container in the same
stock order/appearance**, then restore perfectly. No new layout yet.

Tasks
- [ ] `registry.js`: resolve logical ids per `recon.md`; produce `unclaimed()` for the rest;
      emit `changed` on grid child add/remove and visibility changes.
- [ ] `reparent.js`: snapshot / move / restore (idempotent), handling destroyed actors.
- [ ] `controlCenter.js` minimal: create `_root`, hide stock grid, move **all** items into a
      2-column container that mimics the stock grid (can be a `St.Widget` with a
      `Clutter.GridLayout` or simple rows), handle full-width items (sliders, system item).
- [ ] Verify sub-menus still open for Wi-Fi/Bluetooth/Power Mode in this container (apply the
      chosen strategy from Phase 0, may be minimal here).
- [ ] `disable()` restore; tree dump after disable must equal `tree-stock.txt` (ignoring ids/addresses).
- [ ] Leak loop script (`scripts/leak-loop.js`, dev doc section 5) enable/disable x20.

**AT-2:** panel looks essentially stock; all controls work; sub-menus open; after disable the
tree dump matches the stock dump; leak loop passes. If sub-menus cannot be made to work with
S-A or S-B, report and let the human decide (S-C or change approach).

---

## Phase 3: Layout engine (declarative)

Tasks
- [ ] `layoutConfig.js` (default config + `validateLayout(json)` returning a safe config
      and a list of warnings) with unit tests (bad input → default).
- [ ] `layoutPlan.js` implementing block semantics from `02-ARCHITECTURE.md` section 4.2 with
      unit tests: all items visible; each item hidden in turn; empty blocks; duplicate ids;
      unknown ids; unclaimed → overflow; lone tile; card on/off; empty stack.
- [ ] Renderer builds blocks from the plan: `split` (stack + placeholder card for now),
      `tiles`, `sliders`, `circles`, `overflow`. Relayout is debounced and flicker-free.
- [ ] Move the 4 round buttons out of the system item into the `circles` block (per Q-d);
      hide the now-empty system item; battery pill hidden by default.
- [ ] Re-layout on dynamic changes: toggle rfkill/Bluetooth, mic in use (input slider), and a
      **test extension** (`tests/ext-dummy-tile`) that adds a dummy `QuickToggle` after our
      enable → appears in overflow; removed → disappears.
- [ ] DND: use the stock/extension tile if present; else implement `dndFallback.js` (FR-17).

**AT-3:** layout matches `target-mockup.png` structurally with a placeholder card; all items
work; dynamic add/remove/visibility handled with no gaps; unit tests green; leak loop passes.

---

## Phase 4: Sub-menus in the final layout

Tasks
- [ ] Implement `submenus.js` per the chosen strategy: slot placed after the owning block,
      in-flow, animated, only-one-open, closes with the popup, Escape works.
- [ ] Verify: Wi-Fi network list (long list scrolls), Bluetooth device list, Power Mode choices,
      power button menu, any extension-provided menu toggle in overflow.
- [ ] Ensure the popup height stays within the monitor (Q-i) when a sub-menu is open.
- [ ] Keyboard: Tab/arrow navigation into and out of sub-menus; focus restored on close.

**AT-4:** every menu-toggle's sub-menu is usable in every block position, never overlaps the
card or other items, and closing/opening repeatedly (50x) does not leak or glitch.

---

## Phase 5: Music card (GATE)

Tasks
- [ ] Pure modules + tests first: `mprisMetadata.js`, `playerSelection.js` (fixtures in
      `tests/fixtures/mpris/`). See `04-MUSIC-CARD-MPRIS.md` sections 3, 4, 9.
- [ ] `mpris.js` watcher (async proxies, name watching, actions, cleanup).
- [ ] `musicCard.js` widgets + wiring into the `split` block (replace placeholder), including
      empty state and disabled buttons.
- [ ] `artCache.js` (local first, then remote with limits), rounded rendering per Q-j.
- [ ] Settings: `music-card-enabled` (live toggle: destroy watcher, degrade split block),
      `fetch-remote-art`.
- [ ] Manual tests with Spotify, Firefox/YouTube, VLC (or what the user has installed), two
      players at once, player quitting.

**AT-5:** `04-MUSIC-CARD-MPRIS.md` section 8 checklist passes; no uncaught errors in the
journal; disable removes all proxies (verify with `busctl --user monitor` / leak loop and
`gjs` handle counts).

---

## Phase 6: Styling pass

Tasks
- [ ] Compare side by side with `target-mockup.png`. Tune structural CSS only: gaps, circle
      size, card padding, art size, control sizes, text truncation.
- [ ] Verify with MacTahoe **light** and **dark**, default Adwaita (acceptable, not
      perfect), scale 100/150/200 %, text scaling 1.5, RTL.
- [ ] Card inherits the glass look (UI spec section 5 approach); document the final approach
      and any theme-copied values in `docs/03-UI-SPEC.md`.
- [ ] Add sub-menu and relayout polish (no flicker, animation respects `enable-animations`).

**AT-6:** UI spec section 8 checklist all ticked, screenshots saved to
`docs/progress/screens/` (nested shell screenshots) for human review.

---

## Phase 7: Preferences, hardening, packaging (GATE)

Tasks
- [ ] `prefs.js` (Adw): all settings in PRD FR-13; layout JSON validation + reset.
- [ ] `conflicts.js`: detect known conflicting extensions; warn once.
- [ ] Error boundaries: if `enable()` throws or an invariant fails, restore stock and log
      (NFR-1). Test by injecting a failure.
- [ ] Lock/unlock, suspend/resume, theme switch, monitor hot-plug, GNOME Shell crash
      recovery (stock panel returns after the extension is auto-disabled).
- [ ] Full QA checklist (dev doc section 6) executed and results recorded.
- [ ] Review against GNOME extension review guidelines (no `run_dispose`, no leaked sources,
      no sync I/O, no excessive logging, no Gtk in shell process).
- [ ] `make pack` zip; README for the repo (install, uninstall, troubleshooting, how to edit
      the layout JSON, recovery if the panel breaks).
- [ ] Final live-session test: ask the **human** to install the zip and log out/in, then
      verify; only then is it "done".

**AT-7:** PRD section 9 acceptance criteria 1 to 9 all pass and are recorded.

---

## Phase 8 (optional stretch, only if the human asks)

Tahoe parity: Edit mode (reorder via drag), per-item sizes (small/medium/large),
"Focus"-style group, player switcher, raise-on-click, battery pill, per-block collapse.

---

## Progress report template (`docs/progress/phase-N-report.md`)

```
# Phase N report
## Done
## Verified how (commands, screenshots, test output)
## Deviations from docs (and why)
## Open issues / risks discovered
## Questions for the human
## Next phase readiness
```
