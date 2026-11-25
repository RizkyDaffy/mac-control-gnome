# Environment reference

Collected from section 1 of `06-DEV-ENV-AND-TESTING.md` on 2026-11-25.

## Shell and OS

```
$ gnome-shell --version
GNOME Shell 51.0
```

```
$ lsb_release -a
Distributor ID:	Ubuntu
Description:	Ubuntu 26.10
Release:	26.10
Codename:	stonking
```

```
$ echo "$XDG_SESSION_TYPE"
wayland
```

## Theme

```
$ gsettings get org.gnome.shell.extensions.user-theme name
'MacTahoe-Dark-blue'
```

```
$ gsettings get org.gnome.desktop.interface gtk-theme
'MacTahoe-Dark-blue'
```

```
$ gsettings get org.gnome.desktop.interface color-scheme
'prefer-dark'
```

```
$ gsettings get org.gnome.desktop.interface text-scaling-factor
1.0
```

## Enabled extensions

```
$ gnome-extensions list --enabled
user-theme@gnome-shell-extensions.gcampax.github.com
blur-my-shell@aunetx
mactahoe-topbar@local
dash2dock-lite@icedman.github.com
compiz-alike-magic-lamp-effect@hermes83.github.com
touchpad-gesture-customization@coooolapps.com
search-light@icedman.github.com
ding@rastersoft.com
myna-shell@canonical.com
snapd-prompting@canonical.com
snapd-search-provider@canonical.com
tiling-assistant@ubuntu.com
ubuntu-appindicators@ubuntu.com
web-search-provider@ubuntu.com
```

## Packages

```
$ dpkg -l | grep -E '^ii\s+(gnome-shell|mutter|libmutter|gjs|libsoup)'
ii  gjs                                              1.90.0-1                                   amd64        Mozilla-based javascript bindings for the GNOME platform (cli tool)
ii  gnome-shell                                      51.0-2ubuntu3                              amd64        graphical shell for the GNOME desktop
ii  gnome-shell-common                               51.0-2ubuntu3                              all          common files for the GNOME graphical shell
ii  gnome-shell-extension-manager                    0.6.5-2                                    amd64        Utility for managing GNOME Shell Extensions
ii  gnome-shell-extension-user-theme                 51.0-1                                     all          GNOME Shell extension to load alternative GNOME Shell themes
ii  gnome-shell-extensions-common                    51.0-1                                     all          common files for official GNOME Shell extensions
ii  gnome-shell-ubuntu-extensions                    51.26.10.6ubuntu                           all          Ubuntu official Extensions to extend functionality of GNOME Shell
ii  libmutter-51-0:amd64                             51.0-1ubuntu3                              amd64        window manager library from the Mutter window manager
ii  libsoup-3.0-0:amd64                              3.6.6-1ubuntu3.2                           amd64        HTTP library implementation in C -- Shared library
ii  libsoup-3.0-common                               3.6.6-1ubuntu3.2                           all          HTTP library implementation in C -- Common files
ii  mutter-common                                    51.0-1ubuntu3                              all          shared files for the Mutter window manager
ii  mutter-common-bin                                51.0-1ubuntu3                              amd64        shared programs for the Mutter window manager
```

## MPRIS players

```
$ playerctl --list-all
```

`playerctl` is not installed on this machine (`command -v playerctl` returns
nothing), so no player list was collected. Install `playerctl` to fill this in.

## Notes

- GNOME 51, so the nested-shell path in section 3 must use the devkit
  (`gnome-shell --devkit`) rather than `--nested --wayland`; verify with
  `gnome-shell --help`.
- Still missing: a screenshot of the current panel, and the list of media players
  the user actually uses (Spotify, Firefox, Chromium, VLC, ...).
