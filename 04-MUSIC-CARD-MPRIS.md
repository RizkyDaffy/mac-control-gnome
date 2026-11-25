# 04: Music Card & MPRIS Design

The music card is the **only brand-new feature widget**. It shows the active media player's
track and offers previous / play-pause / next. It talks to players over **MPRIS2** on the
session D-Bus. Do not depend on GNOME Shell's private `ui/mpris.js` classes (they change
between releases); read that file for ideas only.

## 1. MPRIS2 recap

- Players own well-known names `org.mpris.MediaPlayer2.<name>[.instanceN]` on the **session bus**,
  object path `/org/mpris/MediaPlayer2`.
- Interface `org.mpris.MediaPlayer2` (root): properties `Identity`, `DesktopEntry`, `CanRaise`;
  method `Raise`.
- Interface `org.mpris.MediaPlayer2.Player`:
  - Properties: `PlaybackStatus` (`"Playing" | "Paused" | "Stopped"`), `Metadata` (`a{sv}`),
    `CanGoNext`, `CanGoPrevious`, `CanPlay`, `CanPause`, `CanControl`, `Position` (do not poll).
  - Methods: `Play`, `Pause`, `PlayPause`, `Next`, `Previous`, `Stop`.
- Property changes arrive via `org.freedesktop.DBus.Properties.PropertiesChanged` (GDBusProxy's
  `g-properties-changed` signal covers it).
- Metadata keys we use: `xesam:title` (s), `xesam:artist` (as, **array**), `xesam:album` (s),
  `mpris:artUrl` (s), `mpris:trackid` (o or s). Be defensive: any may be missing or have the
  wrong type; some players send empty strings.
- Player discovery: `org.freedesktop.DBus` `ListNames` at start, then watch `NameOwnerChanged`
  for names starting with `org.mpris.MediaPlayer2.`.

## 2. Component split

```
mpris.js            (Gio; owns proxies)       → emits 'changed' with a PlayerState|null
playerSelection.js  (PURE)                    → pickActivePlayer(players)
mprisMetadata.js    (PURE)                    → normalizeMetadata(raw)
artCache.js         (Gio/Soup, async)         → resolveArt(artUrl) → local file path | null
musicCard.js        (St widgets only)         → render(state); emits button actions
```

### PlayerState (normalised, what the UI sees)

```js
{
  busName: 'org.mpris.MediaPlayer2.spotify',
  identity: 'Spotify',
  status: 'Playing' | 'Paused' | 'Stopped',
  title: string,           // '' if unknown
  artist: string,          // joined with ', ' if array
  album: string,
  artUrl: string | null,   // raw URL from the player
  canGoNext: boolean, canGoPrevious: boolean, canPlayPause: boolean,
  canRaise: boolean,
  lastActive: number       // monotonic ms when it last became Playing (for selection)
}
```

## 3. Player selection (pure function; unit-test it)

`pickActivePlayer(players, now)`:
1. Ignore `playerctld` (a proxy daemon that duplicates real players). (VERIFY name)
2. Ignore players whose status is `Stopped` **and** have no title (dead/empty).
3. If any are `Playing`: choose the one that most recently *started* playing (`lastActive` max).
4. Else among `Paused`: choose the most recently active (`lastActive` max; fall back to most
   recently seen).
5. Else `null`.
6. **Stickiness:** if the previously chosen player is still `Playing`, keep it unless another
   player *newly* started playing (avoid flapping between two players that both report
   Playing).
7. Debounce visible changes ~100 ms to avoid flicker when a browser rapidly updates metadata.

Required unit tests: no players; one paused; two playing (newest wins); playing beats paused;
stopped-with-title still shown (as paused-like) vs stopped-empty hidden; playerctld ignored;
stickiness.

## 4. Metadata normalisation (pure; unit-test it)

`normalizeMetadata(raw)` → `{title, artist, album, artUrl}`:
- `title`: string or `''`. Trim. Cap at 300 chars.
- `artist`: accept `string[]` or `string`; join non-empty entries with `', '`; cap 300.
- `artUrl`: accept only strings with scheme `file:`, `http:` or `https:`; else `null`. Reject
  `data:`, `javascript:`, relative paths.
- Never throw on malformed input; return empty strings.
- GVariant unpack: `variant.recursiveUnpack()` for `a{sv}` (VERIFY helper is available in the
  GJS version). Treat any unpacked value defensively.

## 5. D-Bus implementation notes (`mpris.js`)

- Use `Gio.DBusProxy.new_for_bus(Gio.BusType.SESSION, flags, null, name, '/org/mpris/MediaPlayer2',
  'org.mpris.MediaPlayer2.Player', cancellable, callback)` (async variant) per player, plus a
  root-interface proxy for `Identity`/`CanRaise` (or read via `Properties.GetAll`).
- Do not use sync proxy construction in the shell process.
- Use cached properties (`proxy.get_cached_property('Metadata')`) and the
  `g-properties-changed` signal. On `g-name-owner-notify` / `NameOwnerChanged` with empty new
  owner → drop the player.
- Actions: `proxy.call('PlayPause', null, Gio.DBusCallFlags.NONE, -1, cancellable, cb)`. Catch
  errors at this boundary (player may have vanished) and ignore `Gio.IOErrorEnum.CANCELLED`.
- Track `lastActive`: set to `GLib.get_monotonic_time()/1000` when `PlaybackStatus` becomes
  `Playing`.
- Everything created is destroyed in `destroy()`: proxies unreferenced, signals disconnected,
  cancellable cancelled, pending selection timeout removed.
- Lifetime: create the watcher on `enable()` only if `music-card-enabled`; destroy it when the
  setting is turned off.

## 6. Album art (`artCache.js`)

- `file://` → use directly (check it exists with an **async** `query_info`).
- `http(s)://`:
  - Only if `fetch-remote-art` is true.
  - Use libsoup 3 (`import Soup from 'gi://Soup?version=3.0'`) with `Soup.Session`,
    `send_and_read_async`, timeout 10 s, `Gio.Cancellable`.
  - Accept only `Content-Type: image/*`, size ≤ 2 MiB. Reject others, never log full URLs at
    info level (can contain tokens).
  - Cache to `GLib.get_user_cache_dir()/<uuid>/art/<sha256(url)>` (write async). Keep at
    most ~50 files, delete oldest. Delete the whole directory on uninstall if feasible, at
    least on `disable()` do not leave unbounded data.
  - Fetch at most one art request at a time; cancel the in-flight request when the track
    changes. Keep the last good image while the next loads (avoid flashing).
- Rendering the image into the card:
  - Preferred: `St.Bin` with inline style `background-image: url("file:///...")` plus
    `background-size: cover` if St supports it (VERIFY), `border-radius` via class. Study how
    `ui/mpris.js` and `ui/userWidget.js` render covers/avatars in the installed Shell and copy
    that technique.
  - Fallbacks: `St.Icon` with `Gio.FileIcon` (no rounded clipping), then `St.DrawingArea` with
    Cairo rounded-rect clip.
  - Escape/validate the path put into inline `style` (reject quotes/parentheses in the path,
    or use `Gio.File.get_path()` and `encodeURI`).
- Placeholder when no art or load failed: a blank rounded square (matches mockup), using a
  neutral symbolic icon only if it looks good.

## 7. Card behaviour spec

| State | Title line | Artist line | Buttons | Art |
|---|---|---|---|---|
| No player | "Not Playing" (translated) | hidden | visible, insensitive | placeholder |
| Playing | track title or player identity if title empty | artist or album | prev/next per `CanGo*`; play/pause shows **pause** icon | art or placeholder |
| Paused | same | same | play/pause shows **play** icon | art or placeholder |

- Update **only on state change** (signal-driven). No timers, no Position polling.
- Play/pause icon swaps with `PlaybackStatus`. Button press → action → state change arrives
  via signal; do not optimistically flip the icon (avoids desync).
- Title with long text: single line with `Pango.EllipsizeMode.END` (set on
  `label.clutter_text.ellipsize`).
- P2: clicking the art or title raises the player (`Raise` if `CanRaise`); middle area
  could switch between multiple players.

## 8. Edge cases checklist

- Player exits while selected → card falls to the next best player or "Not Playing".
- Spotify (deb/snap/flatpak), Firefox (YouTube), Chromium/Chrome, VLC, Rhythmbox, Amberol,
  mpv with mpris plugin: all produce sane output. Some give `file://` art, some `https://`.
- Two Firefox windows / many Chromium tabs → several players; selection rules apply.
- Metadata arrives in multiple property updates (title before art) → no flicker.
- Browser reports `Playing` with empty title → show identity ("Firefox") rather than blank.
- Very long title/artist, non-Latin text, emoji.
- D-Bus name vanishes mid-call → no uncaught exception.
- Extension disabled/enabled repeatedly → no duplicate proxies (see leak loop).
- Session lock/unlock → watcher recreated cleanly.

## 9. Unit-test fixtures (put in `tests/fixtures/mpris/`)

Provide JSON fixtures for raw metadata of: Spotify, Firefox YouTube, VLC, empty, malformed
(artist as number, title null, artUrl `javascript:...`). Tests assert normalised output.
