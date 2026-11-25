# 02: Technical Architecture

> Important: Sections 2 and 5 describe GNOME Shell **internals from memory**. Those APIs are
> private and change between releases. Every claim tagged **VERIFY** must be confirmed in
> Phase 0 against the installed Shell (see section 9 for how to read its source).

## 1. Extension fundamentals (GNOME Shell 45+)

Layout of an extension directory (here: `src/`):

```
src/
├── metadata.json          # uuid, name, description, shell-version, settings-schema
├── extension.js           # default export class extends Extension (enable/disable)
├── prefs.js               # default export class extends ExtensionPreferences (Adw)
├── stylesheet.css         # auto-loaded by the Shell when the extension is enabled
├── schemas/               # gschema.xml (compiled to gschemas.compiled)
└── lib/                   # our modules
```

`metadata.json` (example):

```json
{
  "uuid": "tahoe-control-center@local",
  "name": "Tahoe Control Center",
  "description": "macOS Tahoe-style layout for Quick Settings with a Now Playing card.",
  "shell-version": ["<detected major version>"],
  "settings-schema": "org.gnome.shell.extensions.tahoe-control-center",
  "url": "",
  "version": 1
}
```

Entry point skeleton:

```js
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Controller} from './lib/controller.js';

export default class TahoeControlCenter extends Extension {
    enable() {
        this._controller = new Controller(this);
        this._controller.enable();
    }
    disable() {
        this._controller?.disable();   // must be idempotent and never throw
        this._controller = null;
    }
}
```

Rules that matter here: no work in the constructor, all setup in `enable()`, all teardown in
`disable()`. Session modes: default `["user"]` only (the extension is unloaded on the lock
screen, which is fine, but then `disable()` runs on every lock, so it must be fast and
`enable()` must rebuild cleanly on unlock).

## 2. How the stock Quick Settings is built (`[VERIFIED GS 51]`)

Files in the Shell's gresource (`/usr/lib/gnome-shell/libshell-51.so`): `ui/quickSettings.js`,
`ui/panel.js`, `ui/status/*.js` (network, bluetooth, system, volume, brightness, nightLight,
darkMode, doNotDisturb, powerProfiles, rfkill, ...).

Verified structure in GNOME Shell 51.0:

- `Main.panel.statusArea.quickSettings` (`panel.js:302`, `436`) is the panel button. Its `menu`
  is a `QuickSettingsMenu` (`quickSettings.js:739`, extends `PopupMenu.PopupMenu`). `menu.box`
  (class `quick-settings`) is the vertical container inside `menu._boxPointer`. Inside
  `menu.box` is `menu._grid` (`quickSettings.js:775`, `St.Widget` with style class
  `quick-settings-grid` and `QuickSettingsLayout` with `N_QUICK_SETTINGS_COLUMNS = 2` from
  `panel.js:42`). `[VERIFIED GS 51]`
- Items are added through `menu.addItem(item, colSpan = 1)` (`quickSettings.js:824`) or
  `menu.insertItemBefore(item, sibling, colSpan = 1)` (`quickSettings.js:829`), which call
  `_completeAddItem()` (`quickSettings.js:834`): adds `item` to `menu._grid`, sets
  `column-span` via `menu._grid.layout_manager.child_set_property(menu._grid, item, 'column-span', colSpan)`,
  and adds `item.menu.actor` (if present) to `menu._overlay`. `[VERIFIED GS 51]`
- The panel's `QuickSettings` class (`panel.js:336-352`) creates `SystemIndicator`s:
  `_system`, `_camera`, `_volumeOutput`, `_volumeInput`, `_brightness`, `_remoteAccess`,
  `_location`, `_thunderbolt`, `_nightLight`, `_darkMode`, `_doNotDisturb`, `_backlight`,
  `_powerProfiles`, `_rfkill`, `_autoRotate`, `_unsafeMode`, `_backgroundApps`, plus optional
  `_network` (`Config.HAVE_NETWORKMANAGER`) and `_bluetooth` (`Config.HAVE_BLUETOOTH`). Each
  exposes `quickSettingsItems`. `[VERIFIED GS 51]`
- Item classes exported from `quickSettings.js`: `QuickSettingsItem`, `QuickToggle`
  (`quick-toggle button`), `QuickMenuToggle` (`quick-toggle-has-menu`), `QuickSlider`
  (`quick-slider`), `SystemIndicator`. System buttons use `icon-button`. `[VERIFIED GS 51]`
- **Sub-menu mechanics:** `QuickMenuToggle.menu` is a `QuickToggleMenu` (`quickSettings.js:363`)
  whose `.actor` (`quick-toggle-menu-container`) is parented to `menu._overlay` (`Clutter.Actor`
  sibling of `_boxPointer` on `menu.actor`, `quickSettings.js:821`, `839`), NOT to `menu._grid`.
  A `Clutter.BindConstraint` binds `menu.actor`'s Y to `sourceActor` with `offset = sourceActor.height`
  (`quickSettings.js:367-373`). `QuickSettingsLayout.vfunc_allocate` checks
  `row.some(c => c.menu?.actor.visible)` (`quickSettings.js:733`) and adds `overlayHeight`
  below that row. Each `QuickSettingsItem` with `hasMenu: true` creates a
  `PopupMenu.PopupMenuManager` (`quickSettings.js:35-36`) enforcing one open sub-menu at a time,
  and `QuickSettingsMenu` applies `_dimEffect` (`Clutter.BrightnessContrastEffect`) to
  `_boxPointer` on `open-state-changed` (`quickSettings.js:841-845`, `860-875`). `[VERIFIED GS 51]`
- **System item** (`SystemItem` at `status/system.js:262`, owned by `_system._systemItem` at
  `system.js:327`): one `QuickSettingsItem` (`quick-settings-system-item`, `colSpan = 2`) whose
  `child` is a plain `St.BoxLayout` containing `this._powerToggle` (`PowerToggle`, `power-item`,
  hidden when no battery), `_laptopSpacer`, `ScreenshotItem`, `SettingsItem`, `_desktopSpacer`,
  `LockItem`, and `ShutdownItem` (`system.js:270-299`). The battery percentage label
  (`_percentageLabel`) lives on `system.Indicator` in the top bar (`system.js:320`), **not**
  inside `SystemItem` (inside `SystemItem`, battery % is `PowerToggle.title`). `ShutdownItem` has
  `hasMenu: true`, and `SystemItem` aliases `this.menu = shutdownItem.menu` (`system.js:300`).
  `ShutdownItem.menu` is anchored to `ShutdownItem` via `QuickToggleMenu`'s Y `BindConstraint`
  and added to `menu._overlay` via `SystemItem.menu`. `[VERIFIED GS 51]`
- **Third-party extensions** add tiles via
  `Main.panel.statusArea.quickSettings.addExternalIndicator(indicator, colSpan)` (`panel.js:423`)
  which calls `menu.insertItemBefore(...)` → `menu._grid.insert_child_below(...)`. Therefore
  `child-added` on `menu._grid` sees them. `[VERIFIED GS 51]`
- **Do Not Disturb:** Stock GNOME Shell 51 tile (`DoNotDisturbToggle` in
  `ui/status/doNotDisturb.js`, indicator `_doNotDisturb` at `panel.js:346`, `401`). Backed by
  `org.gnome.desktop.notifications` `show-banners` (inverted). No enabled extension provides DND;
  `dndFallback.js` is only needed if missing on another system. `[VERIFIED GS 51]`

## 3. Core design principles

1. **Move, don't recreate.** Reparent actors; keep their signal handlers and bindings.
2. **Reversible.** Take a snapshot (parent, index, column-span, visibility, y/x-expand,
   style_class we modified) before moving anything. Restore from the snapshot.
3. **Data-driven layout.** A pure function turns `(layoutConfig, availableItems)` into a
   `LayoutPlan`; a thin Shell-side renderer turns the plan into actors.
4. **Reactive.** Watch for new/removed items and visibility changes; re-plan on idle, debounced.
5. **Isolated risk.** Anything depending on private structure lives in `registry.js`
   (finding items) or `reparent.js`/`submenus.js` (moving them). Everything else is
   version-agnostic.
6. **Fail safe.** If the registry cannot find an item it expects, skip it (log once) rather
   than aborting. If rendering fails, restore stock and stop.

## 4. Module design

```
src/lib/
├── controller.js      # lifecycle: wires everything; enable()/disable(); error boundary
├── registry.js        # finds stock items → logical ids; watches grid for additions/removals
├── reparent.js        # snapshot/move/restore of actors; idempotent
├── layoutPlan.js      # PURE: config + items → LayoutPlan (unit-tested)
├── layoutConfig.js    # default declarative layout + schema validation (PURE)
├── controlCenter.js   # builds container actors from the plan; relayout scheduler
├── submenus.js        # in-flow sub-menu host (see section 6)
├── musicCard.js       # St widgets for the card (no D-Bus here)
├── mpris.js           # D-Bus watching, per-player state (Gio)
├── playerSelection.js # PURE: which player is "active"
├── mprisMetadata.js   # PURE: normalise Metadata a{sv} → {title, artist, album, artUrl...}
├── artCache.js        # async art fetch + disk cache (Soup 3 / Gio)
├── dndFallback.js     # fallback DND tile (only if needed)
├── disposables.js     # tracks signals/timeouts/cancellables for disable()
├── debug.js           # dumpActorTree(), item inventory, gated by debug flag
└── conflicts.js       # detects conflicting extensions
```

### 4.1 Logical item ids (registry output)

| id | Kind | Source (`[VERIFIED GS 51]`) | Default block |
|---|---|---|---|
| `wifi` | menu-toggle | `_network` indicator; wireless toggle (`NMWirelessSection` in `status/network.js`) | split.stack |
| `bluetooth` | menu-toggle | `_bluetooth` indicator (`BluetoothToggle`, `status/bluetooth.js:272`) | split.stack |
| `dark-style` | toggle | `_darkMode` (`DarkModeToggle`, `status/darkMode.js:9`) | tiles-1 |
| `dnd` | toggle | `_doNotDisturb` (`DoNotDisturbToggle`, `status/doNotDisturb.js`) | tiles-1 |
| `volume-output` | slider | `_volumeOutput` (`OutputStreamSlider`, `status/volume.js:293`) | sliders |
| `volume-input` | slider | `_volumeInput` (`InputStreamSlider`, `status/volume.js:367`, visible only when recording) | sliders |
| `brightness` | slider | `_brightness` (`BrightnessItem`, `status/brightness.js:37`) | sliders |
| `system-battery` | toggle | `_system._systemItem._powerToggle` (`PowerToggle`, `status/system.js:26`, `power-item`; top-bar pill is `_system._percentageLabel`) | (hidden by default) |
| `screenshot`, `settings`, `lock`, `power` | button | `_system._systemItem.child` children (`ScreenshotItem`, `SettingsItem`, `LockItem`, `ShutdownItem` in `status/system.js`) | circles |
| `power-mode` | menu-toggle | `_powerProfiles` (`PowerProfilesToggle`, `status/powerProfiles.js:41`) | tiles-2 |
| `night-light` | toggle | `_nightLight` (`NightLightToggle`, `status/nightLight.js:15`) | tiles-2 |
| `airplane-mode` | toggle | `_rfkill` (`RfkillToggle`, `status/rfkill.js:93`) | tiles-2 |
| anything else (VPN, remote access, location, auto-rotate, background apps, third-party) | any | any grid child not claimed | overflow |

The registry exposes:

```js
class Registry {
  items(): Map<id, {id, kind, actor, indicator, menu?, original: Snapshot}>
  unclaimed(): item[]            // everything in the grid we could not name
  connect('changed', cb)         // grid child added/removed, visible toggled
}
```

Identification strategy, in order of preference: (1) reference through the indicator object
(`quickSettings._bluetooth.quickSettingsItems[0]`), (2) JS class name of the item
(`item.constructor.name`), (3) a stable property (e.g. `item.menu` presence, `iconName`) (4)
**never** by translated label text. Document in code comments exactly what each rule relies
on, and add a **tree dump** (`debug.js`) so a human can see why an item was not recognised.

### 4.2 LayoutPlan (pure, unit-tested)

Config (data):

```js
export const DEFAULT_LAYOUT = {
  version: 1,
  blocks: [
    {type: 'split',   id: 'connectivity', stack: ['wifi', 'bluetooth'], card: 'music'},
    {type: 'tiles',   id: 'tiles-1',      items: ['dark-style', 'dnd']},
    {type: 'sliders', id: 'sliders',      items: ['volume-output', 'brightness', 'volume-input']},
    {type: 'circles', id: 'circles',      items: ['screenshot', 'settings', 'lock', 'power']},
    {type: 'tiles',   id: 'tiles-2',      items: ['power-mode', 'night-light', 'airplane-mode']},
    {type: 'overflow', id: 'overflow'},
  ],
};
```

Block semantics:

- `split`: `stack` items (visible ones only) in a vertical column on the left; right = the card
  (`music`). Card height = stack height (see UI spec for how). If card disabled or no visible
  stack: degrade as in FR-3.
- `tiles`: 2-column flow of the visible items, left to right; a final lone tile uses the left
  half only.
- `sliders`: one per row, full width. Hidden sliders skipped.
- `circles`: single row, equally spaced, hidden buttons skipped.
- `overflow`: all unclaimed visible items, 2-column flow. Items with `kind: 'slider'` go
  full width. Items with a large natural span (e.g. media-like) go full width.
- A block with zero visible items renders nothing (no spacing, no empty box).

`planLayout(config, items)` returns something like:

```js
[
  {block: 'connectivity', type: 'split', stack: ['wifi','bluetooth'], card: true},
  {block: 'tiles-1', type: 'tiles', rows: [['dark-style','dnd']]},
  {block: 'sliders', type: 'sliders', rows: [['volume-output'],['brightness']]},
  ...
]
```

Validation: unknown block types/ids are ignored with a warning; an item listed twice is
placed only the first time; invalid user JSON falls back to `DEFAULT_LAYOUT`.

### 4.3 Renderer (`controlCenter.js`)

- Builds `this._root = new St.BoxLayout({vertical: true, style_class: 'mac-cc'})` and inserts
  it into `quickSettings.menu.box` at the position of the stock grid. The stock `_grid` is
  **hidden** (not destroyed) so stock bookkeeping keeps working. (VERIFY that hiding the grid
  doesn't break menu positioning logic or leave a size artefact; if it does, set the grid's
  height/opacity instead or reparent it into an off-screen holder.)
- For each plan block, create a block actor and add the item actors to it. Equal widths in a
  row: `x_expand: true` for children and `layout_manager.homogeneous = true` on the row
  (`St.BoxLayout` uses `Clutter.BoxLayout` which supports `homogeneous`, though stock
  `SystemItem` uses `x_expand: true` spacers instead `[VERIFIED GS 51]`). For the `circles`
  block, carry style class `quick-settings-system-item` so MacTahoe's `.quick-settings-system-item .icon-button`
  circle rules apply (`gnome-shell.css:4420`).
- Relayout strategy: keep block actors if the block's *plan signature* is unchanged; only
  rebuild changed blocks. Simplest correct v1: on change, detach all item actors from our
  rows (without destroying), destroy our row actors, rebuild rows from the plan. It is OK
  as long as it is debounced and not triggered while the popup is mid-animation. Optimize
  later if needed.
- Scheduler: `queueRelayout()` sets a flag and schedules a single `GLib.idle_add` (or
  `Meta.later_add`). Track the source id. Multiple triggers coalesce.
- Triggers: grid `child-added`/`child-removed`; each item's `notify::visible`; settings
  change; music card enable/disable; `St.Settings` text-scaling change (for sizing).
- Restore on `disable()`: reparent every item back using its snapshot, `show()` the stock
  grid, destroy `_root`.

### 4.4 Snapshot/Restore (`reparent.js`)

```js
snapshot(actor) → {
  actor, parent, index,                 // original parent and child index
  colSpan,                              // via layout_manager.child_get_property(grid, actor, 'column-span') [VERIFIED GS 51]
  visible, xExpand, yExpand, xAlign, yAlign,
  addedStyleClasses: [],                // classes WE add (so we can remove them)
}
move(actor, newParent)   // remove_child from old parent, add_child to new (never destroy)
restore(snapshot)        // idempotent; if the actor was destroyed meanwhile → no-op
```

Edge cases to handle: item destroyed by its owner while in our container (listen to
`destroy`, drop from registry, queue relayout); item whose original parent is gone;
restoring in reverse of moved order to preserve indices; restoring when another extension
has since reordered the grid (best effort: append at original index clamped to child count).

## 5. Sub-menus (`[VERIFIED GS 51]`, Phase 2 experiment)

Verified mechanics (`quickSettings.js:363-539`, `733-875`): `QuickMenuToggle.menu.actor`
(`quick-toggle-menu-container`) lives in `menu._overlay`, positioned vertically below
`sourceActor` via a `Clutter.BindConstraint` on Y (`offset = sourceActor.height`), while
`QuickSettingsLayout.vfunc_allocate` inserts `overlayHeight` below the owning row. After
reparenting toggles out of `_grid` into `_root`, `_grid`'s layout manager no longer spaces
the open sub-menu.

Recommended strategy: **S-A (Submenu host)** — verify both variants in Phase 2 nested shell:

- **S-A1 (Direct slot reparenting):** For every item with `.menu` (`QuickMenuToggle`,
  `QuickSlider`, and `SystemItem`/`ShutdownItem`), move `item.menu.actor` out of `menu._overlay`
  into a `SubmenuSlot` placed directly after the owning block in `_root` (removing its
  `Clutter.BindConstraint` on Y and restoring both parent and constraint on `disable()`).
  Note: `_dimEffect` on `_boxPointer` (`quickSettings.js:860-875`) dims `_boxPointer` children
  when `open-state-changed` fires, so check dimming behavior in nested shell.
- **S-A2 (Overlay + re-targeted constraint + spacer):** Keep `item.menu.actor` in `menu._overlay`
  (outside `_boxPointer`, avoiding `_dimEffect`), re-target its Y `BindConstraint` source to
  the owning block, and place a height-bound `SubmenuSlot` spacer in `_root` after that block.
- **S-C (fallback, least desirable):** Open sub-menus as a separate popover/box anchored to
  the right of the panel. Document as degraded UX.

Also verified in source (`[VERIFIED GS 51]`): `QuickToggleMenu` already animates `actor.height`
and `box.opacity` (`POPUP_ANIMATION_TIME = 400`, `quickSettings.js:463-525`); `PopupMenuManager`
(`quickSettings.js:35-36`) enforces one open menu at a time; stock `QuickSettingsMenu` has
**no** `St.ScrollView` or height clamping (`quickSettings.js:739-876`), so Tahoe must add its
own `St.ScrollView` wrapper if content + open sub-menu exceeds monitor height. Verify Escape,
panel close, keyboard focus, and long Wi-Fi list scrolling in nested shell.

## 6. Music card and MPRIS

Separate doc: `04-MUSIC-CARD-MPRIS.md`. Architecture rule: `mpris.js` (D-Bus, state) emits
`changed` with a normalised `PlayerState | null`; `musicCard.js` (widgets) only renders state
and calls `player.playPause()/next()/previous()`. No D-Bus in widget code.

## 7. Styling approach

- Our extension CSS (`stylesheet.css`) is **structural only**: row spacing, alignment, circle
  sizes, card layout, slot animation hooks.
- Visuals (glass, colours, radius, active-state white pill) come from theme classes the items
  already carry. The music card should carry the same visual class as a tile
  (try `quick-toggle` + our class, see `03-UI-SPEC.md` section 5).
- Do not hardcode colours or opacity that the theme supplies.
- Our classes are all prefixed `mac-cc-` to avoid collisions.

## 8. Settings and preferences

GSettings schema `org.gnome.shell.extensions.tahoe-control-center`:

| key | type | default | meaning |
|---|---|---|---|
| `music-card-enabled` | b | true | show the Now Playing card |
| `show-battery-pill` | b | false | show stock battery percentage pill (P2) |
| `fetch-remote-art` | b | true | allow https album art fetch |
| `layout-json` | s | `''` | empty = default layout; else JSON per `layoutConfig` |
| `debug` | b | false | verbose logging, tree dump on enable |

`prefs.js` uses Adw (`Adw.PreferencesPage` / `Adw.SwitchRow`) and a multi-line entry for
`layout-json` with a validate-on-apply + "Reset to default" button. The extension reacts to
settings via `changed::<key>` signals (disconnected in `disable()`).

## 9. How to read the installed Shell's source (do this in Phase 0)

The Shell's JS lives in a gresource inside `libgnome-shell.so`. Locate and extract:

```bash
# find the library (path differs per distro/arch)
dpkg -L gnome-shell | grep -E 'libgnome-shell\.so$'
# list resources and extract the ones we need
gresource list <path-to-libgnome-shell.so> | grep -E 'quickSettings|panel\.js|status/'
gresource extract <path-to-libgnome-shell.so> /org/gnome/shell/ui/quickSettings.js > /tmp/quickSettings.js
```

(Alternatively fetch the matching tag of the GNOME Shell source from GitLab if network is
allowed. Match the **exact installed version**.) Read at minimum: `ui/quickSettings.js`,
the `QuickSettings` class in `ui/panel.js`, `ui/status/system.js`, `ui/status/network.js`,
`ui/status/bluetooth.js`, `ui/status/powerProfiles.js`, `ui/status/rfkill.js`,
`ui/status/volume.js`, `ui/status/brightness.js`, `ui/status/nightLight.js`,
`ui/status/darkMode.js`, and `ui/mpris.js` (useful reference for media handling).
Record findings in `docs/reference/recon.md` with file + line references.

Runtime inspection: **Looking Glass** (`Alt+F2`, type `lg`, Enter) in the nested shell; use its
Evaluator tab to run `Main.panel.statusArea.quickSettings.menu._grid.get_children()` etc.

## 10. Lifecycle sequence

```
enable():
  settings ← getSettings()
  disposables ← new Disposables()
  registry ← new Registry(quickSettings)           # snapshots + watchers
  cc ← new ControlCenter(registry, settings, ...)  # builds _root, hides stock grid
  mpris ← new MprisWatcher(...)  if music-card-enabled
  cc.queueRelayout()
  on any exception: restoreAll(); log; return      # NFR-1

runtime:
  grid child-added  → registry.refresh() → cc.queueRelayout()
  item notify::visible → cc.queueRelayout()
  settings changed → apply → cc.queueRelayout()
  mpris changed → musicCard.update(state)

disable():
  mpris.destroy(); cc.destroy() (restores all items, shows grid, destroys _root)
  registry.destroy(); disposables.dispose(); settings ← null
```

## 11. `Disposables` helper (tiny, required)

```js
export class Disposables {
    constructor() { this._items = []; }
    connect(obj, sig, cb)   { const id = obj.connect(sig, cb); this._items.push(() => obj.disconnect(id)); return id; }
    timeout(ms, cb)         { const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, cb); this._items.push(() => GLib.Source.remove(id)); return id; } // handle already-fired sources safely
    idle(cb)                { /* same with GLib.idle_add */ }
    cancellable()           { const c = new Gio.Cancellable(); this._items.push(() => c.cancel()); return c; }
    add(fn)                 { this._items.push(fn); }
    dispose()               { while (this._items.length) { try { this._items.pop()(); } catch (e) { console.error(e); } } }
}
```

(Take care with sources that return `GLib.SOURCE_REMOVE`: removing an already-removed source
id logs a warning, so track "fired" state or use `GLib.Source.remove` guarded by a flag.)

## 12. Compatibility strategy

- Detect, don't compare versions: e.g. `const hasGrid = !!menu._grid`; `typeof item.menu?.open === 'function'`.
- Concentrate fallbacks in `registry.js`. When something is missing, log one clear warning
  naming the id and the shell version.
- `metadata.json` `shell-version` lists only versions the agent actually tested.
