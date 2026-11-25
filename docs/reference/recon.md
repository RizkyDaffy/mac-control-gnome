# Recon Notes — GNOME Shell 51.0

**Source extracted from:** `/usr/lib/gnome-shell/libshell-51.so` (gresource)  
**GJS:** 1.90.0 | **Ubuntu:** 26.10 | **Session:** Wayland  
**Extracted files:** `/tmp/gnome-shell-src/`

---

## Q-a: Grid/box structure

**Grid widget property name:** `_grid`  
Declared at `quickSettings.js:775`:
```js
this._grid = new St.Widget({
    style_class: 'quick-settings-grid',
    layout_manager: new QuickSettingsLayout(placeholder, { nColumns }),
});
this.box.add_child(this._grid);  // quickSettings.js:781
```

`this.box` is from `PopupMenu.PopupMenu` (superclass of `QuickSettingsMenu`). The popup box is `this._boxPointer` → `this.box`. The `_grid` is the direct child of `box` with class `quick-settings-grid`.

**Overlay layer:** `this._overlay` — a `Clutter.Actor` (not St), positioned by `BindConstraint` to match `_grid` X/Y/W. Sub-menus (`.menu.actor`) are parented to `_overlay`, not to `_grid`. See `quickSettings.js:821` and `_completeAddItem()` at line 839.

**Items are accessed via `_grid` children:**
```js
// Enumerate all grid tiles:
for (const child of quickSettingsMenu._grid) { ... }
// or
quickSettingsMenu._grid.get_children()
// Get first (bottom-most in z-order):
quickSettingsMenu.getFirstItem()  // quickSettings.js:849 → _grid.get_first_child()
```

**Column count:** `N_QUICK_SETTINGS_COLUMNS = 2` (`panel.js:42`). Full-width items added with `colSpan=2`; half-width with `colSpan=1` (default).

---

## Q-b: Item identification

No runtime IDs exist on the items. Identification must be done by **class identity** (via `instanceof`) or **style_class** or **the indicator that owns them**.

| Logical ID | Class / Type | CSS class | Source file:line | Conditional? |
|---|---|---|---|---|
| `volume-output` | `OutputStreamSlider` extends `QuickSlider` | `quick-slider` | `volume.js:293` | Yes — hidden when no PulseAudio sink |
| `volume-input` | `InputStreamSlider` extends `QuickSlider` | `quick-slider` | `volume.js:367` | Yes — only shown when app is recording |
| `brightness` | `BrightnessItem` extends `QuickSlider` | `quick-slider` | `brightness.js:37` | Yes — hidden when `globalScale` is falsy |
| `wifi` | `NMWirelessSection` → `QuickMenuToggle` subclass | `quick-toggle quick-toggle-has-menu button` | `network.js` (deep) | Yes — requires `HAVE_NETWORKMANAGER` + wifi adapter |
| `bluetooth` | `BluetoothToggle` extends `QuickMenuToggle` | `quick-toggle quick-toggle-has-menu button` | `bluetooth.js:272` | Yes — requires `HAVE_BLUETOOTH` + rfkill switch |
| `dark-style` | `DarkModeToggle` extends `QuickToggle` | `quick-toggle button` | `darkMode.js:9` | No — always present |
| `dnd` | `DoNotDisturbToggle` extends `QuickToggle` | `quick-toggle button` | `status/doNotDisturb.js` | No — always present |
| `night-light` | `NightLightToggle` extends `QuickToggle` | `quick-toggle button` | `nightLight.js:15` | Yes — hidden when `night-light-supported` = false |
| `power-mode` | `PowerProfilesToggle` extends `QuickMenuToggle` | `quick-toggle quick-toggle-has-menu button` | `powerProfiles.js:41` | Yes — hidden when UPower.PowerProfiles DBus not present |
| `airplane-mode` | `RfkillToggle` extends `QuickToggle` | `quick-toggle button` | `rfkill.js:93` | Yes — only when `show-airplane-mode` rfkill property true |
| `system-item` | `SystemItem` extends `QuickSettingsItem` | `quick-settings-system-item` | `system.js:262` | No — always present, colSpan=2 |
| `screenshot` | `ScreenshotItem` extends `QuickSettingsItem` | `icon-button` | `system.js:109` | Yes — hidden in greeter mode |
| `settings` | `SettingsItem` extends `QuickSettingsItem` | `icon-button` | `system.js:132` | Yes — hidden when `allowSettings` = false |
| `lock` | `LockItem` extends `QuickSettingsItem` | `icon-button` | `system.js:239` | Yes — hidden when `can-lock-screen` = false |
| `power` (shutdown) | `ShutdownItem` extends `QuickSettingsItem` | `icon-button` | `system.js:166` | Yes — hidden when no actions available |
| `power-toggle` (battery) | `PowerToggle` extends `QuickToggle` | `quick-toggle button power-item` | `system.js:26` | Yes — hidden when no battery (`IsPresent = false`) |

**Recommended extension identification pattern:**
```js
// By checking style_class and position in SystemItem:
const systemItem = quickSettings.menu._grid.get_children()
    .find(c => c.style_class?.includes('quick-settings-system-item'));
const screenshotBtn = systemItem?.child?.get_first_child(); // PowerToggle or ScreenshotItem
```

---

## Q-c: Do Not Disturb tile

**Yes — DND is a stock GNOME Shell 51 tile**, sourced from `status/doNotDisturb.js` (in gresource).

```js
// status/doNotDisturb.js (extracted):
class DoNotDisturbToggle extends QuickToggle {
    constructor() {
        super({ title: _('Do Not Disturb'), iconName: 'notifications-disabled-symbolic', toggleMode: true });
        this._settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
        this._settings.bind('show-banners', this, 'checked', Gio.SettingsBindFlags.INVERT_BOOLEAN);
    }
}
```

Backed by `org.gnome.desktop.notifications → show-banners` (inverted).  
Added at `panel.js:401`: `this._addItemsBefore(this._doNotDisturb.quickSettingsItems, sibling)`.

**No enabled extension provides a DND tile** — the enabled list (`myna-shell@canonical.com`, `blur-my-shell@aunetx`, `dash2dock-lite@icedman.github.com`, etc.) contains no DND extension. Stock only.

---

## Q-d: System item internals

`SystemItem` (`system.js:262`) is a `QuickSettingsItem` with `reactive: false`. Its `child` is a plain `St.BoxLayout` (no style_class set). Children in order:

| Property | Class | Visibility |
|---|---|---|
| `this._powerToggle` | `PowerToggle` (QuickToggle + `power-item`) | Only when battery present (`IsPresent`) |
| `this._laptopSpacer` | `Clutter.Actor` x_expand:true | Visible = `_powerToggle.visible` (laptop only) |
| `screenshotItem` | `ScreenshotItem` (icon-button) | Hidden in greeter |
| `settingsItem` | `SettingsItem` (icon-button) | Hidden when `allowSettings=false` |
| `this._desktopSpacer` | `Clutter.Actor` x_expand:true | Visible = NOT `_powerToggle.visible` (desktop only) |
| `lockItem` | `LockItem` (icon-button) | Hidden when `can-lock-screen=false` |
| `shutdownItem` | `ShutdownItem` (icon-button, hasMenu:true) | Hidden when no power actions available |

**Battery label:** Rendered as `this._percentageLabel` (St.Label) in `Indicator` (`system.js:320`), appended to the panel indicator `St.BoxLayout`, not inside `SystemItem`. It is synced from `PowerToggle.title` (which is `formatter.format(percentage/100)`).

**Power/Shutdown sub-menu:** `ShutdownItem.menu` is a `QuickToggleMenu` (`system.js:170`, `hasMenu:true`). The menu is then hoisted: `SystemItem.menu = shutdownItem.menu` (`system.js:300`). This means the whole `SystemItem` exposes the shutdown popup as its menu, anchored to `ShutdownItem` as `sourceActor`.

**No `homogeneous` used** on the system item's BoxLayout (`system.js:270`). Buttons are sized by their own preferred width. Left and right spacers (`x_expand:true`) center the icons depending on laptop vs desktop.

---

## Q-e: Sub-menu mechanics

### Where `menu.actor` is parented
`QuickToggleMenu.actor` (a `St.Widget` with `quick-toggle-menu-container`) is NOT a child of the grid. It is added to `this._overlay` by `_completeAddItem()` (`quickSettings.js:839`):
```js
this._overlay.add_child(item.menu.actor);
```
`_overlay` is a `Clutter.Actor` positioned via `BindConstraint` to match the grid's X, Y, and width (`quickSettings.js:784-820`).

### Who positions it
`QuickToggleMenu` constructor (`quickSettings.js:367-383`):
```js
const constraints = new Clutter.BindConstraint({
    coordinate: Clutter.BindCoordinate.Y,
    source: sourceActor,   // the tile widget
});
sourceActor.bind_property('height', constraints, 'offset', ...);
// → actor.y = tile.y + tile.height  (appears below the tile)
```
X positioning: `actor.x_expand: true` → it fills the full overlay width (= grid width).  
The layout manager also reserves vertical space: when any row's tile has `menu.actor.visible`, the layout inserts `overlayHeight` extra pixels below that row (`quickSettings.js:733-734`).

### Open/close animation
**Open** (`quickSettings.js:463-491`):
1. Measure natural height: `actor.height = -1; getPreferred(); actor.height = previous`.
2. `box.opacity = 0`, then ease `actor.height` → `targetHeight` (duration = `POPUP_ANIMATION_TIME/2 * distance/targetHeight`).
3. On complete: ease `box.opacity` → 255 (duration = `POPUP_ANIMATION_TIME/2`).

**Close** (`quickSettings.js:499-525`):
1. Ease `box.opacity` → 0.
2. On complete: ease `actor.height` → 0, then `actor.hide()`, emit `menu-closed`.

`POPUP_ANIMATION_TIME = 400` ms (`quickSettings.js:17`).

### "Only one open" enforcement
`QuickSettingsMenu._setDimmed(isOpen)` is called on `open-state-changed` (`quickSettings.js:841-845`):
```js
item.menu.connect('open-state-changed', (m, isOpen) => {
    this._setDimmed(isOpen);
    this._activeMenu = isOpen ? item.menu : null;
});
```
`_setDimmed` applies a `Clutter.BrightnessContrastEffect` on `_boxPointer` dimming to 50%.  
Actual single-open enforcement: `PopupMenu.PopupMenuManager` manages `this._menuManager` on `QuickSettingsItem` (`quickSettings.js:35`). `PopupMenuManager` closes the previous open menu when a new one opens.

### What happens if toggle removed from grid
`menu.actor` stays in `_overlay` (it was added there separately). The overlay does not auto-remove it. The layout manager no longer sees the tile in `_getRows()`, so it won't reserve space for the sub-menu. **The actor becomes orphaned/invisible but not destroyed** — the extension must manually `_overlay.remove_child(item.menu.actor)` when removing an item. This is a known extension pitfall.

---

## Q-f: Layout manager on child add/removal

`QuickSettingsLayout` (`quickSettings.js:565`) is a `Clutter.LayoutManager` subclass. It has **no** `vfunc_actor_added` / `vfunc_actor_removed` overrides — it simply re-runs layout on the next allocate cycle (Clutter queues a relayout automatically on child list changes).

**`_getRows()`** (`quickSettings.js:612`) skips `child` if `!child.visible` or if `child === this._overlay` (the placeholder actor). So **hidden children occupy no row**, and the grid re-flows around them.

**If the grid is hidden:** `this._grid.hide()` makes it invisible but still allocates space in `box`. The `QuickSettingsMenu` has no special handling for a hidden grid. `_boxPointer` sizing would collapse (St recalculates preferred size). If you want to hide all tiles: set items `visible=false` individually rather than hiding the grid.

**`column-span`** is stored as `QuickSettingsLayoutMeta` child property (`quickSettings.js:541`), set via `layout_manager.child_set_property(grid, item, 'column-span', n)`.

---

## Q-g: CSS classes

| Widget | `style_class` | Declared at |
|---|---|---|
| `QuickToggle` | `quick-toggle button` | `quickSettings.js:57` |
| `QuickMenuToggle` | adds `quick-toggle-has-menu` | `quickSettings.js:171` |
| `QuickMenuToggle` menu-button | `quick-toggle-menu-button icon-button` | `quickSettings.js:185` |
| `QuickMenuToggle` separator | `quick-toggle-separator` | `quickSettings.js:181` |
| `QuickToggle` icon | `quick-toggle-icon` | `quickSettings.js:73` |
| `QuickToggle` title label | `quick-toggle-title` | `quickSettings.js:91` |
| `QuickToggle` subtitle label | `quick-toggle-subtitle` | `quickSettings.js:99` |
| `QuickSlider` | `quick-slider` | `quickSettings.js:269` |
| `QuickSlider` icon button | `icon-button flat` | `quickSettings.js:290` |
| `QuickSlider` menu button | `icon-button flat` | `quickSettings.js:341` |
| `QuickSlider` slider bin | `slider-bin` | `quickSettings.js:327` |
| `QuickToggleMenu.actor` | `quick-toggle-menu-container` | `quickSettings.js:377` |
| `QuickToggleMenu.box` | `quick-toggle-menu` (from PopupMenuBase) + via `setHeader` css `header`, `icon`, `title`, `subtitle` | `quickSettings.js:365` |
| Grid widget | `quick-settings-grid` | `quickSettings.js:776` |
| `QuickSettingsMenu.box` | adds `quick-settings` | `quickSettings.js:760` |
| `SystemItem` | `quick-settings-system-item` | `system.js:266` |
| `ScreenshotItem` / `SettingsItem` / `LockItem` / `ShutdownItem` | `icon-button` | `system.js:113,135,244,169` |
| `PowerToggle` extra | adds `power-item` | `system.js:38` |
| Panel indicator box | `panel-status-indicators-box` | `quickSettings.js:882`, `panel.js:307` |
| Panel status icon | `system-status-icon` | `quickSettings.js:895` |

---

## Q-h: St.BoxLayout `homogeneous` in GNOME 51

**No `homogeneous` property is used anywhere** in the Quick Settings source. The `SystemItem` child BoxLayout (`system.js:270`) uses `x_expand: true` on spacer `Clutter.Actor`s to push buttons to edges — not `homogeneous`.

St.BoxLayout wraps `Clutter.BoxLayout` which does support `homogeneous`, but it is **not exercised in stock shell 51**. Extensions can safely use it, but the system item layout pattern uses spacers instead, which is more flexible.

---

## Q-i: Height clamping on small screens

**No explicit height clamping or `St.ScrollView` in `quickSettings.js` or `panel.js`.** The popup grows unconstrained to fit its content.

The `QuickSettingsMenu` inherits from `PopupMenu.PopupMenu` which in turn uses `St.BoxPointer`. Height is constrained only by screen geometry via `St.BoxPointer`'s placement algorithm (it shifts the popup up if it would go off-screen, but does not scroll or clamp content height).

The `QuickToggleMenu` (sub-menus) similarly grows to natural height with no scroll — the `actor.height = -1` on open (`quickSettings.js:487`) releases any constraint.

**Implication for Tahoe:** If a custom panel exceeds the screen height, we need to add our own `St.ScrollView` wrapper. GNOME upstream does not do this in 51.0.

---

## Q-j: Album art / background-image in St

`mpris.js` in GNOME 51 is a **pure data model** — `MprisPlayer` and `MprisSource` classes, no UI widgets at all. `trackCoverUrl` is exposed as a plain string property (`mpris.js:157`, `mpris.js:65`). Album art rendering is delegated to the message list / notification system (`MessageList.Source`).

**How album art is typically rendered in GNOME Shell extensions:**

The `trackCoverUrl` is a `file://` or `http://` URL. In the message list UI (not in this file), art is applied via:
```css
/* St CSS property */
background-image: url("file:///path/to/art.jpg");
background-size: cover;  /* or: contain, auto, <px> */
```

St supports these CSS properties inherited from Clutter's style engine:
- `background-image: url(...)` — file or resource URI
- `background-size: cover | contain | auto | <length> <length>`
- `background-color`, `background-gradient-direction`, `background-gradient-start/end`

For programmatic image setting, extensions typically use:
```js
widget.style = `background-image: url("${coverUrl}"); background-size: cover;`;
```

There is no St API to set background-image directly — string CSS via `.style` property is the standard approach.

---

## Items in this machine's grid

Based on source analysis + enabled extensions + hardware detection:

| Item | colSpan | Conditional? | Expected on this machine |
|---|---|---|---|
| `SystemItem` (battery+buttons) | 2 | Battery portion conditional | **Yes** (desktop likely — no battery label) |
| `OutputStreamSlider` | 2 | Yes — needs PulseAudio sink | **Yes** |
| `InputStreamSlider` | 2 | Yes — only during recording | **Conditional** (hidden unless recording) |
| `BrightnessItem` | 2 | Yes — needs backlight | **Yes** (laptop/external monitor) |
| `NMWirelessSection` or wired | 1 | Yes — needs NM + wifi | **Yes** (network adapter present) |
| `BluetoothToggle` | 1 | Yes — needs BT adapter | **Probably yes** |
| `PowerProfilesToggle` | 1 | Yes — needs UPower.PowerProfiles | **Probably yes** |
| `NightLightToggle` | 1 | Yes — needs night-light-supported | **Probably yes** |
| `DarkModeToggle` | 1 | No | **Yes** |
| `DoNotDisturbToggle` | 1 | No | **Yes** |
| `RfkillToggle` (Airplane) | 1 | Yes — only on hardware with rfkill | **Maybe** (depends on hardware) |
| Background apps row | 2 | Yes — only when bg apps active | **Conditional** |

---

## Sub-menu strategy recommendation

**Recommend strategy S-B: overlay-reparent.**

Rationale from source:
1. `item.menu.actor` is **already in `_overlay`**, not `_grid` — the shell's own design separates tile from menu actor.
2. `QuickSettingsLayout` explicitly tracks `overlayHeight` per row (`quickSettings.js:701`) and inserts it when `row.some(c => c.menu?.actor.visible)` — the layout is designed around this overlay model.
3. The overlay is positioned via `BindConstraint` to `_grid` and `_boxPointer`, so sub-menu position tracks the grid automatically.
4. Opening/closing is fully animated; we can call `item.menu.open()` / `item.menu.close()` directly.

For Tahoe's custom panel layout: add items via `menu.addItem(item, colSpan)` which calls `_completeAddItem` and correctly parents `item.menu.actor` to `_overlay`. Do NOT manually re-parent tiles or menus — the layout manager's row-height accounting (`overlayHeight`) depends on them staying in their respective parents.

**Gotcha:** Removing an item from the grid does NOT auto-remove `item.menu.actor` from `_overlay`. Always call `menu._overlay.remove_child(item.menu.actor)` when removing a tile.
