# Tahoe Control Center

A GNOME Shell extension that replaces the Quick Settings popup with a macOS Tahoe-style Control Center layout, including a live Now Playing music card.

> **Requires:** GNOME Shell 51 · GJS 1.90+ · `gnome-extensions` CLI

---

## Layout

```
┌─────────────────────────────────┐
│  Wi-Fi        │  Now Playing    │
│  Bluetooth    │  ♫ Title        │
│               │  Artist  ◀ ⏯ ▶ │
├───────────────┴─────────────────┤
│  Dark Style  │  Do Not Disturb  │
├─────────────────────────────────┤
│  Volume  ══════════════════════ │
│  Brightness ═══════════════════ │
├─────────────────────────────────┤
│  📷  ⚙  🔒  ⏻                  │
├─────────────────────────────────┤
│  Power Mode  │  Night Light     │
│  Airplane Mode                  │
└─────────────────────────────────┘
```

---

## Install

```bash
# 1. Clone
git clone <repo> mac-control-gnome
cd mac-control-gnome

# 2. Compile schemas + create symlink (does NOT enable in live session)
make schemas
make install
```

---

## Safe Testing (Nested Shell)

**Never run `make nested` from an SSH session or a Wayland compositor without a display.**

Open a terminal in your live desktop session:

```bash
make nested
```

This launches `gnome-shell --devkit` with an isolated dconf database.  
Your live session is **not affected**.

---

## Enable (after testing passes)

```bash
gnome-extensions enable tahoe-control-center@local
# Log out and back in, or restart GNOME Shell (X11 only):
# alt+f2 → r → Enter
```

---

## Disable / Uninstall

```bash
# Disable (restores stock Quick Settings immediately)
gnome-extensions disable tahoe-control-center@local

# Full uninstall
make uninstall
```

### Emergency disable (if shell is frozen)

Switch to a TTY with **Ctrl+Alt+F3**, then:

```bash
gnome-extensions disable tahoe-control-center@local
```

Log back in with **Ctrl+Alt+F2**.

---

## Development

| Command | Purpose |
|---|---|
| `make test` | Run pure-logic unit tests (99 cases, no shell) |
| `make schemas` | Recompile GSettings schema |
| `make install` | Symlink src/ into extension dir |
| `make nested` | Safe nested shell for visual testing |
| `make logs` | Tail TahoeCC log lines from journal |
| `make pack` | Build distributable `.zip` |
| `make clean` | Remove build artifacts |

### Rollback any change

```bash
git log --oneline        # find the target commit
git reset --hard <hash>  # reset to it
make schemas && make install
```

---

## Customising the layout

Open **GNOME Extensions → Tahoe Control Center → Preferences → Custom layout JSON**.

Leave blank to use the default Tahoe layout.

Provide a JSON object with a `blocks` array to override.  
Example (swap Dark Style / DND row order):

```json
{
  "version": 1,
  "blocks": [
    {"type": "split", "id": "connectivity", "stack": ["wifi", "bluetooth"], "music": true},
    {"type": "tiles", "id": "toggles", "items": ["dnd", "dark-style"]},
    {"type": "slider", "id": "volume", "items": ["volume-output"]},
    {"type": "slider", "id": "brightness", "items": ["brightness"]},
    {"type": "circles", "id": "actions", "items": ["system-item"]},
    {"type": "tiles", "id": "extras", "items": ["power-mode", "night-light", "airplane-mode"]},
    {"type": "overflow", "id": "overflow", "items": []}
  ]
}
```

---

## Settings

| Key | Default | Description |
|---|---|---|
| `music-card-enabled` | `true` | Show Now Playing card |
| `fetch-remote-art` | `true` | Fetch album art over HTTPS |
| `show-battery-pill` | `false` | Show battery % pill (P2) |
| `layout-json` | `""` | Custom layout JSON (empty = default) |
| `debug` | `false` | Verbose logging + actor tree dump |

---

## Compatibility

- GNOME Shell 51 (Ubuntu 26.04 / Fedora 42+)
- Works with MacTahoe light/dark themes
- Multi-monitor and HiDPI (100 / 150 / 200%)
- Wayland and X11

**Known conflicts:** `quick-settings-tweaks@qwreey` — both modify the Quick Settings grid. A warning is logged; disable one to avoid visual glitches.

---

## Recovery

The extension wraps `enable()` in a try/catch.  
On any fatal error it calls `disable()` immediately, restoring stock Quick Settings.

Logs: `journalctl -f /usr/bin/gnome-shell | grep TahoeCC`
