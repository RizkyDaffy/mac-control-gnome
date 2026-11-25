# 01: Product Requirements Document (PRD)

**Project:** Tahoe Control Center (GNOME Shell extension)
**Owner:** the user (a Ubuntu/GNOME desktop user, themed with MacTahoe-gtk-theme)
**Status:** Draft v1

## 1. Summary

Replace the *layout* of the GNOME Quick Settings popup with a macOS-Tahoe-style Control
Center structure and add a Now Playing music card. All existing controls remain the real
GNOME controls, only repositioned. The result should look and behave as if the Control Center
had been designed that way natively.

## 2. Background and context

- The user runs Ubuntu with GNOME and has installed **MacTahoe-gtk-theme** (liquid-glass look
  is already working). Remaining gap: the **structure** of the Quick Settings popup still
  follows GNOME's fixed 2-column grid, whereas macOS Tahoe 26's Control Center uses a grouped
  layout with a Now Playing card and rows of round buttons.
- **Current layout (reference: `docs/reference/current-layout.png`)**, top to bottom: battery
  pill + 4 round buttons (screenshot, settings, lock, power) / volume slider / brightness
  slider / Wi-Fi | Bluetooth / Power Mode | Night Light / Dark Style | Do Not Disturb /
  Airplane Mode.
- **Target layout (reference: `docs/reference/target-mockup.png`)**, see section 5 and
  `docs/03-UI-SPEC.md`.
- Existing off-the-shelf extensions (Quick Settings Tweaks, Unified Panel, Kiwi, Compact Quick
  Settings) can add media controls or change column count, but none can produce this exact
  grouped layout. Hence a custom extension.

## 3. Goals

- G1. Reproduce the target mockup's structure 1:1 in the real quick settings popup.
- G2. Every control keeps full original behaviour (toggling, sub-menus, sliders, state sync).
- G3. Add a Now Playing card driven by MPRIS that controls the active media player.
- G4. Be robust: dynamic/hidden items, third-party items, theme changes, lock/unlock, suspend.
- G5. Be reversible: disabling the extension restores the stock layout exactly.
- G6. Make layout **data-driven** so the user can later re-order to match Tahoe more closely
  without touching code.

## 4. Non-goals (v1)

- Re-theming or editing MacTahoe theme files. (CSS in this project is structural only.)
- A drag-and-drop "Edit Controls" mode, resizable controls (small/medium/large), or
  third-party control API. (Stretch, P2, see section 8.)
- Replacing GNOME's notification/calendar menu.
- Supporting GNOME Shell < 45 (legacy `imports` API).
- Publishing to extensions.gnome.org. (Keep the code review-friendly, but publishing is not a
  v1 goal.)
- X11-specific features; must work on Wayland (and not break on X11).

## 5. Target layout (summary; full spec in `03-UI-SPEC.md`)

Top to bottom inside the popup:

1. **Split block:** left column = Wi-Fi tile stacked over Bluetooth tile; right = **Music
   card** spanning the height of both tiles.
2. **Tile row:** Dark Style | Do Not Disturb.
3. **Volume slider** (full width).
4. **Brightness slider** (full width).
5. **Round button row:** screenshot, settings, lock, power (evenly distributed).
6. **Tile flow:** Power Mode | Night Light, then Airplane Mode alone on the next row (left
   half).
7. **Overflow area:** any other item the stock panel/extension provides that is not named
   above (so nothing is ever lost).

Notes: the battery-percentage pill from the stock panel is **not shown** in the target
(top bar already shows battery). It can be re-enabled by setting (P2).
The mockup has the typo "Do Not Distrub". The real label must remain GNOME's own string.

## 6. Users and use cases

Single primary persona: a desktop Linux user who wants a Mac-like Control Center.
- U1. Opens the panel and toggles Wi-Fi/Bluetooth/Dark Style/DND quickly.
- U2. Expands Wi-Fi/Bluetooth to pick a network/device via the arrow.
- U3. Adjusts volume/brightness with sliders; clicks the slider icon to mute.
- U4. Sees what's playing and uses prev/play-pause/next without opening the player.
- U5. Hits screenshot/settings/lock/power round buttons.

## 7. Functional requirements

| ID | Pri | Requirement |
|---|---|---|
| FR-1 | P0 | On enable, the quick settings popup shows the target layout (section 5) in place of the stock grid. |
| FR-2 | P0 | All items are the **original actors** reparented (not clones/re-implementations), except the music card (new) and an optional DND fallback tile (FR-17). |
| FR-3 | P0 | **Split block:** left stack of N tiles (default Wi-Fi, Bluetooth) beside a music card whose height equals the stack height. If the card is disabled/hidden, the stack degrades into the normal 2-column tile flow. If the stack is empty, the card takes full width. |
| FR-4 | P0 | **Music card** shows title/artist/art of the active MPRIS player with prev / play-pause / next; empty state "Not Playing". Details in `04-MUSIC-CARD-MPRIS.md`. |
| FR-5 | P0 | **Tile flow rows:** a list of tile ids lays out two per row, left to right. Hidden/missing items are skipped and following tiles flow up. A lone tile occupies the left half, not stretched (matches Airplane Mode in mockup). |
| FR-6 | P0 | **Sliders:** full-width rows for volume (output), brightness, and the input (microphone) slider when it is visible. Mute click, drag, scroll all work as stock. |
| FR-7 | P0 | **Round button row:** the four system buttons from the stock system item, evenly spaced, equal size. The power button's menu and the other buttons' actions all still work. |
| FR-8 | P0 | **Sub-menus** for menu-toggles (Wi-Fi, Bluetooth, Power Mode, others) open and close correctly in the new layout, in-flow below the block containing the toggle; only one open at a time; all close when the popup closes. |
| FR-9 | P0 | **Dynamic items:** items that appear/disappear (hardware, state, other extensions) update the layout automatically with no empty gaps or stale rows. |
| FR-10 | P0 | **Overflow:** any item not claimed by the layout config goes to an overflow 2-column flow at the bottom. |
| FR-11 | P0 | `disable()` restores every moved actor to its original parent, index and column-span, destroys our widgets, disconnects everything. Idempotent. |
| FR-12 | P1 | Layout is **declarative** (`layout.js` default, optional gsettings JSON override) so blocks/order can change without code changes. |
| FR-13 | P1 | Preferences window (Adw): toggle music card, toggle battery pill, toggle remote album art fetch, edit layout JSON or reset to default, debug logging. |
| FR-14 | P1 | Keyboard navigation follows visual order. Buttons have accessible names. Focus ring works. |
| FR-15 | P0 | Works with MacTahoe theme (light and dark variants). P1: also renders acceptably with the default Adwaita shell theme. |
| FR-16 | P1 | Coexists with Blur My Shell, Dash to Dock, and similar. Detects known conflicting layout extensions (Quick Settings Tweaks layout features, Unified Panel, Compact Quick Settings) and logs a warning (and optionally a one-time notification). |
| FR-17 | P1 | If no Do Not Disturb tile exists in the quick settings grid (stock GNOME may keep DND in the calendar menu), provide a fallback tile bound to `org.gnome.desktop.notifications` key `show-banners` (DND on = `show-banners` false). Phase 0 determines whether needed. |
| FR-18 | P2 | Optional battery-percentage pill (setting). |
| FR-19 | P2 | Click on the card art raises the player (`Raise` if `CanRaise`). Player switcher when several players exist. |
| FR-20 | P2 | Tahoe-parity stretch: Edit mode, item sizes, "Focus" style grouping. Out of scope unless asked. |

## 8. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 Stability | The extension must never crash or freeze the shell. On any fatal error in `enable()`, fully restore the stock layout and log the error. |
| NFR-2 Performance | No polling. Opening the popup must not be noticeably slower than stock. Re-layout is debounced (one pass per main-loop idle). No per-frame work. |
| NFR-3 Compatibility | Primary: the GNOME version in `environment.md`. Best effort: adjacent versions via feature detection, declared in `metadata.json` `shell-version` only after tested. |
| NFR-4 Cleanliness | Pass the leak loop: enable/disable x20 leaves actor count, signal count and timeouts unchanged (see dev doc). |
| NFR-5 Security/privacy | Only http(s)/file URIs for art; size and type limits; no other network use. No data leaves the machine except the album-art GET to the URL the player supplied. |
| NFR-6 Maintainability | Pure logic separated and unit-tested. Each Shell-internals dependency isolated in `registry.js` or `reparent.js` with a comment explaining the assumption. |
| NFR-7 Accessibility | Keyboard reachable, accessible names, respects `enable-animations`, works at text-scaling 1.5 and HiDPI 200%. |
| NFR-8 i18n | Use GNOME's own labels for moved items (no hardcoded English). New strings (e.g. "Not Playing") go through `gettext` (`this.gettext` / `_()`) and RTL layouts must mirror correctly. |

## 9. Acceptance criteria (Definition of Done)

1. With the extension enabled, the popup's structure matches section 5 and `target-mockup.png`
   (same grouping and order; theme provides the visuals).
2. Each control (Wi-Fi, Bluetooth, Dark Style, DND, volume, brightness, screenshot, settings,
   lock, power, Power Mode, Night Light, Airplane Mode) performs its real function, and its
   state stays synced with the system.
3. Wi-Fi, Bluetooth, and Power Mode sub-menus open/close, are interactive, never overlap
   other content, and only one is open at a time.
4. Music card: with Spotify/Firefox/VLC playing, shows correct metadata and the three buttons
   work; with no player, shows "Not Playing"; reacts live to player start/stop/track change.
5. Toggling rfkill/Bluetooth, plugging devices, or enabling a third-party extension that adds
   a tile updates the layout correctly (unclaimed items appear in overflow).
6. `gnome-extensions disable <uuid>` immediately restores the stock panel, byte-for-byte same
   structure as before enabling (verify via the tree dump diff, dev doc section 5).
7. Leak loop passes. No errors from `[TahoeCC]` in `journalctl` during normal use.
8. Lock/unlock, suspend/resume, theme switch (MacTahoe light/dark), scale 100/150/200%, and
   multi-monitor all work.
9. Unit tests pass; docs updated; `make pack` produces an installable zip.

## 10. Milestones (see `05-IMPLEMENTATION-PLAN.md` for tasks)

M0 Recon, M1 Skeleton + dev loop, M2 Identity relayout (reparent proof), M3 Layout engine,
M4 Sub-menus, M5 Music card, M6 Styling pass, M7 Prefs + hardening + packaging.

## 11. Assumptions

- A1. Ubuntu with GNOME Shell 45+ on Wayland (exact version to be recorded in `environment.md`).
- A2. MacTahoe shell theme is installed and selected via the User Themes extension.
- A3. The user's current panel already shows a Do Not Disturb tile, either from GNOME itself or
  from another extension (Phase 0 finds out which).
- A4. The user accepts that Shell internals are private API and the extension may need a small
  update after major GNOME upgrades.

## 12. Open questions

Tracked in `07-RISKS-AND-OPEN-QUESTIONS.md`. The agent must resolve Q1 to Q4 in Phase 0.
