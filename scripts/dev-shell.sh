#!/usr/bin/env bash
# dev-shell.sh — Safe nested GNOME Shell for Tahoe Control Center development.
# GNOME Shell 51 uses --devkit (NOT --nested --wayland).
# Uses an isolated D-Bus broker + isolated dconf db so it never touches the live shell.
#
# SAFETY RULES (never violate):
#   - Never kills or restarts the live gnome-shell.
#   - Never modifies the live dconf database (uses an isolated profile).
#   - Never uses sudo.
set -euo pipefail

UUID="tahoe-control-center@local"
DEV_CACHE="$HOME/.cache/tahoe-cc-dev"
DCONF_PROFILE_FILE="$DEV_CACHE/dconf-profile"
BUS_SOCK="$DEV_CACHE/dev-bus-$$.sock"
BUS_CONF="$DEV_CACHE/session.conf"

# ── Safety check 1: refuse if DCONF_PROFILE is already set to something else ─
if [[ -n "${DCONF_PROFILE:-}" ]] && [[ "${DCONF_PROFILE}" != "$DCONF_PROFILE_FILE" ]]; then
    echo "ERROR: DCONF_PROFILE is already set to '${DCONF_PROFILE}'." >&2
    echo "       Refusing to run to avoid writing to an unexpected dconf profile." >&2
    exit 1
fi

# ── Create isolated dconf profile in ~/.cache/tahoe-cc-dev/ ────────────────
mkdir -p "$DEV_CACHE"

# Note: dconf user-db names become D-Bus writer object paths (/ca/desrt/dconf/Writer/<name>),
# which only allow [A-Za-z0-9_] — hyphens like tahoe-cc-dev cause dconf to abort.
cat > "$DCONF_PROFILE_FILE" <<'EOF'
user-db:tahoe_cc_dev
EOF

# ── Seed dev db from live settings before switching D-Bus ─────────────────
echo "Seeding dev dconf db from live session settings..."
LIVE_DUMP=$(env -u DCONF_PROFILE dconf dump /)

# ── Minimal session bus config for dbus-broker-launch ─────────────────────
cat > "$BUS_CONF" <<'EOF'
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <keep_umask/>
  <listen>unix:tmpdir=/tmp</listen>
  <auth>EXTERNAL</auth>
  <policy context="default">
    <allow send_destination="*"/>
    <allow receive_sender="*"/>
    <allow own="*"/>
  </policy>
</busconfig>
EOF

BROKER_PID=""
DCONF_PID=""
cleanup() {
    [[ -n "$DCONF_PID" ]] && kill "$DCONF_PID" 2>/dev/null || true
    [[ -n "$BROKER_PID" ]] && kill "$BROKER_PID" 2>/dev/null || true
    rm -f "$BUS_SOCK"
}
trap cleanup EXIT INT TERM

# ── Start isolated D-Bus session (no dbus-daemon or sudo needed) ──────────
rm -f "$BUS_SOCK"
systemd-socket-activate -l "$BUS_SOCK" dbus-broker-launch --config-file "$BUS_CONF" >/dev/null 2>&1 &
BROKER_PID=$!

for _ in $(seq 1 20); do
    [[ -S "$BUS_SOCK" ]] && break
    sleep 0.1
done

export DBUS_SESSION_BUS_ADDRESS="unix:path=$BUS_SOCK"
export DCONF_PROFILE="$DCONF_PROFILE_FILE"

# Start dconf-service on the isolated bus for dconf writes
/usr/libexec/dconf-service >/dev/null 2>&1 &
DCONF_PID=$!
sleep 0.2

# ── Safety check 2: refuse if DCONF_PROFILE ended up unset or wrong ────────
if [[ -z "${DCONF_PROFILE:-}" ]] || [[ "$DCONF_PROFILE" != "$DCONF_PROFILE_FILE" ]]; then
    echo "ERROR: DCONF_PROFILE is unset or invalid ('$DCONF_PROFILE'). Aborting." >&2
    exit 1
fi

# ── Seed + set extension state in isolated dev db only ────────────────────
printf '%s\n' "$LIVE_DUMP" | dconf load /
echo "Enabling extension '$UUID' and user-theme in dev dconf db only..."
dconf write /org/gnome/shell/enabled-extensions "['user-theme@gnome-shell-extensions.gcampax.github.com', '$UUID']"
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
echo "║  Extension logs: stdout/stderr in this terminal              ║"
echo "║  dconf profile:  $DCONF_PROFILE_FILE"
echo "║  dbus socket:    $BUS_SOCK"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Launch nested shell (GNOME 51 uses --devkit) ───────────────────────────
gnome-shell --devkit
