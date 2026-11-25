# Phase 5 report

## Done
- `src/lib/mpris.js` (`MprisWatcher`):
  - Async D-Bus `ListNames` + `NameOwnerChanged` watching on `org.freedesktop.DBus` for `org.mpris.MediaPlayer2.*` (filtering `playerctld`).
  - Async `Gio.DBusProxy.makeProxyWrapper` per player for `org.mpris.MediaPlayer2.Player`, tracking `PlaybackStatus`, `Metadata`, `CanControl`, `CanPlay`, `CanPause`, `CanGoNext`, `CanGoPrevious`.
  - Unpacks `GLib.Variant` metadata values, normalizes via `normalizeMetadata()`, selects active player via `pickActivePlayer()`, debounces updates by 100 ms, and exposes `playPause()`, `next()`, `previous()`, `playerCount`, `onChanged()`, `destroy()`.
- `src/lib/artCache.js` (`ArtCache` + `setArtOnWidget`):
  - Async `file://` existence check via `Gio.File.query_info_async`.
  - Async `http(s)://` fetch via `Soup.Session` (`gi://Soup?version=3.0`) when `fetchRemoteArt` is enabled, validating `image/*` `Content-Type` and `<= 2 MiB`, caching by SHA-256 under `~/.cache/tahoe-control-center@local/art/`, and pruning oldest files past 50 entries.
  - `setArtOnWidget()` sets `background-image: url(...)` using `GLib.filename_to_uri()` with injection-safe character filtering.
- `src/lib/musicCard.js` (`MusicCard`):
  - `St.BoxLayout` (`mac-cc-music-card mac-cc-split-right`) with `mac-cc-music-art`, `mac-cc-music-title` / `mac-cc-music-artist` (`Pango.EllipsizeMode.END`), and `prev` / `playpause` / `next` buttons (`icon-button mac-cc-music-btn`).
  - Handles `Not Playing` idle state, button sensitivity, play/pause icon switching, and cancellable art updates.
- Wired `MprisWatcher`, `ArtCache`, and `changed::music-card-enabled` / `changed::fetch-remote-art` in `src/lib/controller.js` and `src/lib/controlCenter.js`.
- Expanded `tests/run.js` with additional `mprisMetadata` edge-case tests.

## Verified how (commands, screenshots, test output)
- `make test`: `Results: 99 passed, 0 failed` (`ALL TESTS PASSED`).
- `node --check`: passed on `src/lib/mpris.js`, `src/lib/artCache.js`, `src/lib/musicCard.js`, `src/lib/controlCenter.js`, `src/lib/controller.js`.
- `gjs -c`: verified `Soup` 3.0 (`MAJOR_VERSION = 3`) is available in GJS.

## Deviations from docs (and why)
- None; `mprisMetadata.js` and `playerSelection.js` were already completed in Phase 1.

## Open issues / risks discovered
- Live MPRIS playback testing (Spotify, Firefox/YouTube, VLC, `busctl` proxy count check on `disable()`) remains to be tested in the nested `gnome-shell --devkit` session.

## Questions for the human
- None.

## Next phase readiness
- Ready for Phase 6 (CSS styling pass for `.mac-cc-music-card`, `.mac-cc-music-art`, spacing, and MacTahoe light/dark parity).
