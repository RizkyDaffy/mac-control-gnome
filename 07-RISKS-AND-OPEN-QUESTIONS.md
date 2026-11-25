# 07: Risks & Open Questions

## 1. Open questions (resolve in Phase 0 unless noted)

| # | Question | Who answers | Why it matters |
|---|---|---|---|
| Q1 | Exact GNOME Shell and Ubuntu versions? (`gnome-shell --version`) | Human | All internals depend on it; decides devkit vs `--nested` |
| Q2 | Where does the Do Not Disturb tile in the user's Quick Settings come from (GNOME itself, Quick Settings Tweaks, another extension)? | Agent (tree dump + `gnome-extensions list`) | Decides whether the fallback DND tile (FR-17) is needed; if another extension owns it, load order matters |
| Q3 | Which sub-menu strategy works (S-A / S-B / S-C)? | Agent, human confirms | Highest technical risk; determines UX |
| Q4 | Can the 4 round buttons be reparented out of the system item without breaking the power menu? | Agent | Affects block D design |
| Q5 | Does the user want the battery pill hidden (as in the mockup) or optionally shown? | Human | Default value of `show-battery-pill` |
| Q6 | Which extensions does the user run (Blur My Shell, Dash to Dock, Just Perfection, Kiwi, Quick Settings Tweaks, Unified Panel...)? | Human (`gnome-extensions list --enabled`) | Conflicts; the glass look may rely on Blur My Shell touching the popup |
| Q7 | Which media players does the user use? | Human | Prioritises MPRIS test matrix |
| Q8 | Keep microphone slider (when visible) in the sliders block? Default yes. | Human | Layout default |
| Q9 | Should the order match Tahoe more closely later (Display above Sound, etc.)? | Human | Affects only `layout.js` defaults |
| Q10 | Is publishing to extensions.gnome.org ever wanted? | Human | If yes, follow review guidelines strictly from the start (already encouraged) |

## 2. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Shell internals (`_grid`, indicator names, layout manager) differ from memory or change in a point release | High | High | Phase 0 recon; isolate all private access in `registry.js`/`reparent.js`; feature detection; tree dump; keep a "recon notes" doc per tested version |
| R2 | Moving menu-toggles breaks their sub-menu positioning | High | High | Phase 2 identity-relayout proof before any new UI; strategy ladder S-A to S-C; human gate |
| R3 | Hiding the stock grid causes size/positioning artefacts or hides things other code expects | Medium | Medium | Verify in Phase 0 (Q-f); fallback: collapse the grid instead of `hide()`; or reparent into an off-screen holder |
| R4 | Another extension (Quick Settings Tweaks, Unified Panel) also rearranges the panel → conflicts | Medium | Medium | `conflicts.js` warning; document supported combos; the overflow block tolerates foreign items |
| R5 | Extension load order: other extensions add tiles after ours | High | Low | Reactive relayout on `child-added`; unclaimed → overflow |
| R6 | Theme (MacTahoe) styles depend on structure (selectors like `.quick-settings-grid > .quick-toggle`) that no longer match after reparenting | Medium | Medium | Inspect theme CSS in Phase 0 (Q-g). If selectors are structural, add parallel selectors in our CSS or give containers the original style classes (`quick-settings-grid`) where harmless |
| R7 | Blur My Shell blur on the popup breaks or double-applies with the new container | Low-Med | Low | Test with BMS enabled; keep the popup's outer actor (`menu.box`) unchanged |
| R8 | Memory/signal leaks on enable/disable cycles (lock screen triggers disable/enable) | Medium | Medium | `Disposables`; leak loop gate; stock-restore diff |
| R9 | Rounded album-art rendering is awkward in St | Medium | Low | Fallback ladder (background-image, Gio.FileIcon, DrawingArea) |
| R10 | MPRIS players behave inconsistently (empty metadata, duplicate players, `playerctld`) | High | Low | Defensive normalisation; selection rules; fixtures; debounce |
| R11 | Remote art fetching: slow/malicious URLs | Low | Medium | http(s) only, size/type/time limits, cache cap, user toggle |
| R12 | GNOME upgrade (new Ubuntu release) breaks the extension | Medium (over time) | Medium | Keep recon doc; isolate internals; user can disable via `gnome-extensions disable`; document recovery |
| R13 | Agent restarts the live shell or enables the dev extension in the live session | Low | Very high | CLAUDE.md hard rules; isolated dconf script refuses to run unsafely |
| R14 | Popup becomes taller than small screens | Medium | Medium | Match stock scroll/height-limit behaviour; test at 768 px high |
| R15 | Keyboard navigation order breaks after reparenting | Medium | Low-Med | Explicit Tab-order test; reorder children, not just visually |

## 3. Decisions already made (change only with the human's approval)

- D1. **Move, don't recreate** existing controls. (Exceptions: music card, optional DND fallback.)
- D2. **Structural CSS only**; the MacTahoe theme provides visuals.
- D3. Declarative layout config with sane default equal to the target mockup.
- D4. Own D-Bus MPRIS client, not Shell's private `ui/mpris.js`.
- D5. GNOME 45+ ESM extension; Wayland-first; nested shell + isolated dconf dev loop.
- D6. Layout engine split into **pure planning** (tested) and **Shell renderer** (thin).
- D7. Overflow block guarantees no item is ever lost.

## 4. Known limitations to document for the user

- Depends on private GNOME Shell APIs; may need updates after GNOME upgrades.
- The stock grid is hidden while the extension is enabled; extensions that expect to *visually*
  position tiles in it will still add tiles (we absorb them into overflow), but their custom
  column spans may not be honoured.
- Edit mode / resizable controls (macOS-style) are not part of v1.
