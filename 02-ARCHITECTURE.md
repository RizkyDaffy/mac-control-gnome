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

## 2. How the stock Quick Settings is built (VERIFY all)

Files in the Shell's gresource: `js/ui/quickSettings.js`, `js/ui/panel.js`,
`js/ui/status/*.js` (network, bluetooth, system, volume, brightness, nightLight, darkMode,
powerProfiles, rfkill, ...).

Recalled structure:

- `Main.panel.statusArea.quickSettings` is the panel button. Its `menu` is a
  `QuickSettingsMenu` (a `PopupMenu`). `menu.box` is the vertical container shown in the
  popup. Inside is `menu._grid` (an `St.Widget` with a `QuickSettingsLayout` layout manager)
  holding the items in 2 columns. (VERIFY exact property names `_grid`, `box`.)
- Items are added through `menu.addItem(item, colSpan = 1)` which does `_grid.add_child(item)`
  and sets a `column-span` child property on the layout manager. (VERIFY)
- The panel's `QuickSettings` class creates `SystemIndicator`s, recalled as members:
  `_system`, `_volumeOutput`, `_volumeInput`, `_brightness`, `_remoteAccess`, `_location`,
  `_thunderbolt`, `_nightLight`, `_network`, `_bluetooth`, `_powerProfiles`, `_rfkill`,
  `_autoRotate`, `_unsafeMode`, `_backgroundApps` (newer), `_darkMode`. Each has
  `quickSettingsItems` (array of items it contributes). (VERIFY names and presence per version.)
- Item classes exported from `quickSettings.js`: `QuickToggle`, `QuickMenuToggle` (toggle with
  an arrow and a sub-menu at `item.menu`), `QuickSlider`, `QuickSettingsItem`,
  `SystemIndicator`. Tile visuals use style class `quick-toggle` (and `quick-slider`,
  `icon-button`, ...). (VERIFY)
- **Sub-menu mechanics:** `QuickMenuToggle.menu` is a `QuickToggleMenu` (popup-menu-base style
  object with `.actor`). In the stock panel the grid's layout manager reserves an "overlay"
  row under the toggle's row when the menu is open and positions `menu.actor` there.
  Only one menu is open at a time. (VERIFY: where `menu.actor` is parented, who positions it,
  how open/close animates, what closes other menus.) **This is the highest-risk part.**
- **System item** (`_system._systemItem` or similar, from `status/system.js`): one grid item
  containing the battery label and the 4 round buttons (screenshot, settings, lock, power).
  The power button opens a power menu. (VERIFY child names and how the power menu is anchored.)
- **Third-party extensions** add tiles via
  `Main.panel.statusArea.quickSettings.addExternalIndicator(indicator)` which ends in
  `menu.addItem(...)`. Therefore a `child-added` handler on the grid sees them.
- **Do Not Disturb:** in stock GNOME, DND has historically lived in the calendar/notification
  popup, not the Quick Settings grid. The user's screenshot shows a DND tile in Quick Settings,
  so it comes from either a newer GNOME or an extension. (VERIFY in Phase 0; decides FR-17.)

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

| id | Kind | Expected source (VERIFY) | Default block |
|---|---|---|---|
| `wifi` | menu-toggle | `_network` indicator; wireless toggle (class name probably contains "Wireless") | split.stack |
| `bluetooth` | menu-toggle | `_bluetooth` indicator | split.stack |
| `dark-style` | toggle | `_darkMode` | tiles-1 |
| `dnd` | toggle | extension-provided, GNOME-provided, or fallback tile | tiles-1 |
| `volume-output` | slider | `_volumeOutput` | sliders |
| `volume-input` | slider | `_volumeInput` (only visible when a mic is in use) | sliders |
| `brightness` | slider | `_brightness` | sliders |
| `system-battery` | label | `_system` item child (percentage label) | (hidden by default) |
| `screenshot`, `settings`, `lock`, `power` | button | `_system` item children | circles |
| `power-mode` | menu-toggle | `_powerProfiles` | tiles-2 |
| `night-light` | toggle | `_nightLight` | tiles-2 |
| `airplane-mode` | toggle | `_rfkill` | tiles-2 |
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
  (VERIFY St.BoxLayout exposes the Clutter.BoxLayout `homogeneous` property in this version).
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
  colSpan,                              // from parent's layout manager if applicable (VERIFY API)
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

## 5. Sub-menus (highest-risk area; plan an experiment)

Problem: the stock layout manager positions the open sub-menu relative to the *grid row* of
the toggle. After reparenting toggles into our own containers that mechanism may no longer
apply (VERIFY by reading `QuickSettingsLayout` and `QuickMenuToggle` source).

Candidate strategies, try in this order and record results in `recon.md`:

- **S-A (preferred): Submenu host.** For every `QuickMenuToggle`, take `item.menu.actor`
  (VERIFY it can be reparented), place it in a `SubmenuSlot` (`St.Bin`/`St.BoxLayout`,
  initially hidden) inserted directly after the block that contains the toggle. Listen to
  `menu` `open-state-changed`: show the slot, animate height 0 to natural (respect
  `St.Settings.get().enable_animations`), and the reverse on close. Enforce one open at a
  time by closing others before opening (`otherMenu.close(BoxPointer.PopupAnimation.NONE)`).
  The arrow button's stock click handler should keep working untouched.
- **S-B: Keep a native mini-grid for menu toggles.** Wrap menu-toggles in a private
  `St.Widget` that uses a *clone of the stock layout manager* class (if it is exported and
  reusable). Probably brittle across versions.
- **S-C (fallback, least desirable):** Open sub-menus as a separate popover/box anchored to
  the right of the panel. Document as degraded UX.

Also verify: Escape closes the menu, panel close closes the menu, keyboard focus moves into
the menu, the menu's items scroll if long (Wi-Fi network lists), and the popup does not
exceed monitor height (the stock panel clamps height; ensure our root participates the same
way, e.g. inside a `St.ScrollView` only if the stock one does).

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
