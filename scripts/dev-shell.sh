#!/usr/bin/env bash
# dev-shell.sh — Safe nested GNOME Shell for Tahoe Control Center development.
# GNOME Shell 51 uses --devkit (NOT --nested --wayland).
#
# SAFETY RULES (never violate):
#   - Never kills or restarts the live gnome-shell.
#   - Never modifies the live dconf database (uses an isolated profile).
#   - Never uses sudo.
set -euo pipefail

UUID="tahoe-control-center@local"
DEV_CACHE="$HOME/.cache/tahoe-cc-dev"
DCONF_PROFILE_FILE="$DEV_CACHE/dconf-profile"

# ── Safety check 1: refuse if DCONF_PROFILE is already set to something else ─
if [[ -n "${DCONF_PROFILE:-}" ]] && [[ "${DCONF_PROFILE}" != "$DCONF_PROFILE_FILE" ]]; then
    echo "ERROR: DCONF_PROFILE is already set to '${DCONF_PROFILE}'." >&2
    echo "       Refusing to run to avoid writing to an unexpected dconf profile." >&2
    exit 1
fi

# ── Create isolated dconf profile in ~/.cache/tahoe-cc-dev/ ────────────────
mkdir -p "$DEV_CACHE"

cat > "$DCONF_PROFILE_FILE" <<'EOF'
user-db:tahoe-cc-dev
EOF

# ── Seed dev db from live settings (theme, wallpaper, etc.) ───────────────
echo "Seeding dev dconf db from live session settings..."
env -u DCONF_PROFILE dconf dump / | DCONF_PROFILE="$DCONF_PROFILE_FILE" dconf load / 2>/dev/null || true

export DCONF_PROFILE="$DCONF_PROFILE_FILE"

# ── Safety check 2: refuse if DCONF_PROFILE ended up unset or wrong ────────
if [[ -z "${DCONF_PROFILE:-}" ]] || [[ "$DCONF_PROFILE" != "$DCONF_PROFILE_FILE" ]]; then
    echo "ERROR: DCONF_PROFILE is unset or invalid ('$DCONF_PROFILE'). Aborting." >&2
    exit 1
fi

# ── Set extension state in dev db only ────────────────────────────────────
echo "Enabling extension '$UUID' in dev dconf db only..."
dconf write /org/gnome/shell/enabled-extensions "['$UUID']"
dconf write /org/gnome/shell/disable-user-extensions "false"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Tahoe Control Center — Safe Development Shell               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  GNOME Shell 51 devkit will launch in a new window.          ║"
echo "║                                                              ║"
echo "║  Looking Glass (in the devkit window):                       ║"
echo "║    Alt+F2  →  type 'lg'  →  Enter                           ║"
echo "║    Evaluator tab:                                            ║"
echo "║      Main.panel.statusArea.quickSettings.menu._grid         ║"
echo "║        .get_children()                                       ║"
echo "║                                                              ║"
echo "║  Extension logs:                                             ║"
echo "║    stdout/stderr in this terminal, or: make logs             ║"
echo "║                                                              ║"
echo "║  dconf profile: $DCONF_PROFILE_FILE"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Launch nested shell (GNOME 51 uses --devkit) ───────────────────────────
exec gnome-shell --devkit
