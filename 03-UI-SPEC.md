# 03: UI / Layout Specification

References: `docs/reference/target-mockup.png` (**the source of truth for structure**),
`docs/reference/current-layout.png` (before), `docs/reference/macos-tahoe-control-center.png`
(inspiration).

## 1. Target structure (wireframe)

```
┌──────────────────────────────────────────────┐
│ ┌───────────────────┐  ┌───────────────────┐ │
│ │ (wifi)  Wi-Fi   > │  │ [art]             │ │
│ │         <SSID>    │  │ Not Playing       │ │
│ └───────────────────┘  │                   │ │   ← Block A "connectivity" (split)
│ ┌───────────────────┐  │   ⏮    ⏯    ⏭    │ │      left stack = Wi-Fi over Bluetooth
│ │ (bt)  Bluetooth > │  └───────────────────┘ │      right = music card (height = stack)
│ └───────────────────┘                        │
│ ┌───────────────────┐  ┌───────────────────┐ │
│ │ ◐ Dark Style      │  │ 🔕 Do Not Disturb │ │   ← Block B tiles-1
│ └───────────────────┘  └───────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ 🔊 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         │ │   ← Block C sliders (volume)
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ ☀  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │ │   ← (brightness)
│ └──────────────────────────────────────────┘ │
│    ( ⌗ )      ( ⚙ )      ( 🔒 )      ( ⏻ )    │   ← Block D circles
│ ┌───────────────────┐  ┌───────────────────┐ │
│ │ ◔ Power Mode      │  │ ☀ Night Light     │ │   ← Block E tiles-2 (flow)
│ │   Balanced        │  └───────────────────┘ │
│ └───────────────────┘                        │
│ ┌───────────────────┐                        │
│ │ ✈ Airplane Mode   │                        │   ← lone tile stays in the left half
│ └───────────────────┘                        │
│ (overflow: any unclaimed items, 2-col flow)  │   ← Block F, only if non-empty
└──────────────────────────────────────────────┘
```

Differences from stock (`current-layout.png`):
- The 100% battery pill is **removed** (setting to restore, P2).
- Volume/brightness sliders move **below** the connectivity and Dark/DND tiles.
- The 4 round buttons move from the top to **below the sliders**, evenly spread.
- Wi-Fi and Bluetooth are **stacked** (not side by side) and a **music card** sits beside them.
- Dark Style | Do Not Disturb form their own row (moved up).
- Power Mode | Night Light | Airplane Mode flow at the bottom.

Keep every item's own look: Wi-Fi/Bluetooth show an arrow ">" and show the SSID/subtitle;
Power Mode shows its "Balanced" subtitle; Dark Style shows the active (white pill + accent
text) state when enabled.

## 2. Metrics (relative; measure real values at runtime)

The mockup and the user's screen have different pixel scales, so **do not hardcode pixel sizes
copied from the images**. Use the theme's own metrics:

- **Gap** between tiles and rows: reuse the stock grid's spacing (VERIFY value from the theme
  CSS/`St` `spacing` on `.quick-settings-grid`, or read `_grid.get_theme_node()`).
  Same gap horizontally and vertically.
- **Tile height** `T`: the natural height of a stock tile (`.quick-toggle` `min-height` or its
  natural allocation). Do not override.
- **Container width** `W`: the popup's content width (unchanged from stock).
- **Two-column tile width**: `(W − gap) / 2`.
- **Music card:** width `(W − gap) / 2`; height `2·T + gap` (equal to the two stacked tiles).
  If the stack has a single visible tile: height `T`... but the card's content must still fit
  (see section 4) so use `max(stackHeight, cardMinHeight)`; the stack is vertically centred or
  top-aligned (top-aligned by default) in that case.
- **Sliders:** natural stock height, full width `W`.
- **Circle buttons:** in the mockup they are roughly the same height as a tile, slightly
  larger than the stock circles in the current layout. Make diameter a CSS value
  `-mac-cc-circle` equivalent via a style class and default to **the stock icon-button size**
  first; adjust after the styling pass to match the mockup visually. Four buttons spread with
  equal free space between them (`space-between`-like: use `x_align: FILL`, each child
  `x_expand: true`, children `x_align: CENTER`).
- Outer padding of the popup: unchanged from stock.

## 3. Behaviour spec per block

**A. Split (connectivity)**
- Left: vertical box of stack tiles, in config order, each full left-column width.
- Right: music card.
- Hidden tile in the stack → remaining tile(s) re-flow, card height follows the stack.
- No Bluetooth hardware: stack contains Wi-Fi only → card height becomes `max(T, cardMin)`.
- Neither visible → card full width, height `cardMin`.
- Card disabled in settings → block degrades to normal 2-col tile flow of the stack items.
- Sub-menu (Wi-Fi/Bluetooth) opens **below the entire split block, full width**, pushing the
  content below it down (never overlapping the music card).

**B/E/F. Tiles / overflow flow**
- 2 columns, equal width, left-to-right, top-to-bottom, hidden items skipped.
- Lone last tile: left half only (do not stretch).
- A menu-toggle's sub-menu opens **directly below its row, full width**.

**C. Sliders**
- One per row, full width. Includes the microphone/input slider when visible.
- All stock behaviours: drag, click-to-set, scroll, icon-click mute, keyboard arrows.

**D. Circles**
- One row, equal spacing. A hidden button (e.g. no screenshot tool) is skipped and the rest re-space.
- Power button's menu must still appear next to its button (VERIFY positioning). It may open
  downward inside the popup, or as a popup menu anchored to the button, whichever the stock
  code does; it must stay on screen.

**Popup height:** must not exceed the monitor. If our root can exceed the available height,
make it scrollable the same way the stock menu does (VERIFY how the stock handles it).

## 4. Music card spec (visual structure)

```
┌─────────────────────────┐
│ ┌─────┐                 │
│ │ art │  (top-left, rounded square, ~ tile height × 0.9)
│ └─────┘                 │
│ Title (1 line, ellipsis)│    ← "Not Playing" when idle
│ Artist (1 line, dim)    │    ← omitted when idle
│                         │
│   ⏮      ⏯      ⏭      │    ← controls row, evenly spaced; play/pause is the largest
└─────────────────────────┘
```

- Art: rounded square, placeholder (neutral glyph/blank rounded square, as in mockup) when none.
- Title: single line with ellipsis. Artist: single line, dimmer (use the theme's dim text class
  e.g. `dim-label`, VERIFY it exists in shell CSS, or `opacity` on the label).
- Controls: 3 icon buttons with style class `icon-button`; use symbolic icons
  `media-skip-backward-symbolic`, `media-playback-start-symbolic` /
  `media-playback-pause-symbolic`, `media-skip-forward-symbolic`. Disabled look (`reactive:
  false`, reduced opacity) when the player says it cannot go next/prev/play.
- Idle state ("Not Playing"): buttons visible but insensitive (matches mockup appearance).
- Card height is dictated by the split block. Content must scale: if the card is short
  (single-tile stack), hide the artist line first, then shrink the art.

## 5. Visual styling rules

- The card must look like a sibling of the tiles. First try
  `style_class: 'quick-toggle mac-cc-card'` (inherits glass/radius from theme). If `quick-toggle`
  brings unwanted states (hover/checked/button semantics), instead make a plain `St.BoxLayout`
  with our class and **copy the computed values from the theme node** programmatically when
  possible (`get_theme_node().get_background_color()`, border radius via the tile's theme
  node) rather than hardcoding. Last resort: static CSS with a comment pointing to the theme rule
  it mirrors.
- Round buttons keep their original `icon-button` class (already glassy from the theme).
- Never set colours in JS styles for things the theme handles. Inline `style` is acceptable
  only for the album-art `background-image`.
- Support light and dark MacTahoe variants without code changes (we never set colours).

## 6. St CSS limits (read before writing `stylesheet.css`)

St implements a **small CSS subset**. Don't write web CSS.

- Not available: `var()`, `calc()`, `gap`, flexbox, grid, `backdrop-filter`, `filter`,
  `:is()/:where()`, `@media`, CSS animations/transitions. (Animate in JS with `actor.ease()`.)
- Available and useful: `spacing` (on `St.BoxLayout`), `padding`, `margin`, `min-width`,
  `min-height`, `max-width`, `border-radius`, `border`, `background-color`,
  `background-gradient-*`, `box-shadow`, `color`, `font-*`, `text-align`, `text-overflow`
  (via `Pango.EllipsizeMode` on the label's `clutter_text`), `icon-size`, `-st-icon-style`.
- Layout is mostly done via **actor properties** in JS: `x_expand`, `y_expand`, `x_align`,
  `y_align`, `layout_manager`, `homogeneous`, `orientation`.
- Prefer classes named `mac-cc-*`. Example skeleton:

```css
.mac-cc { spacing: 6px; }                 /* replace with measured stock gap, if static */
.mac-cc-row { spacing: 6px; }
.mac-cc-split { spacing: 6px; }
.mac-cc-stack { spacing: 6px; }
.mac-cc-card { padding: 12px; }
.mac-cc-card-title { font-weight: bold; }
.mac-cc-card-artist { opacity: 150; }     /* St opacity is 0-255 */
.mac-cc-card-art { border-radius: 10px; min-width: 44px; min-height: 44px; }
.mac-cc-circles { }
```

(If the stock gap is theme-dependent, set `spacing` from JS by reading the stock grid's
theme node, and set it via `actor.set_style('spacing: %dpx')` or a property.)

## 6b. Animations

- Sub-menu open/close: height ease ~200 ms, `Clutter.AnimationMode.EASE_OUT_QUAD`. Skip when
  `St.Settings.get().enable_animations` is false.
- Relayout must not animate (avoid flicker). Optional: fade-in the whole popup is already
  handled by the Shell.

## 7. RTL, scaling, accessibility

- RTL (Arabic/Hebrew): rows mirror automatically if we use `St.BoxLayout` and don't hardcode
  left/right alignment. Test with `LANGUAGE=ar` or by switching text direction.
- HiDPI/scale: no pixel constants tied to scale; rely on theme metrics and `St` logical pixels.
- Text scaling 1.5: card title/artist truncate with ellipsis; nothing overlaps; the popup stays
  within the screen.
- Accessible names for the three music buttons ("Previous", "Play/Pause", "Next") set via
  `accessible_name`. Keyboard Tab order = visual order (reading order, left to right per row;
  for the split block: stack tiles, then card controls).

## 8. Acceptance checklist for the visual layer

- [ ] Same grouping/order as the mockup.
- [ ] Equal gaps; card height equals the two stacked tiles.
- [ ] No overlap or clipping at 100/150/200 % scale and text-scaling 1.5.
- [ ] Light and dark MacTahoe variants look right (no hardcoded colours).
- [ ] No empty gaps when items are hidden.
- [ ] Sub-menus expand in-flow without covering the card.
