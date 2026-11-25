WORKSPACE := $(shell pwd)
UUID     := tahoe-control-center@local
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: install schemas nested logs test pack uninstall clean

## Install: symlink src/ into the extension install dir (NOT enabled in live session)
install:
	mkdir -p "$(HOME)/.local/share/gnome-shell/extensions"
	ln -sfn "$(WORKSPACE)/src" "$(INSTALL_DIR)"
	@echo "Symlink created: $(INSTALL_DIR) → $(WORKSPACE)/src"
	@echo "NOTE: Extension is NOT enabled. Use 'make nested' to test in a safe nested shell."

## Compile GSettings schema
schemas:
	glib-compile-schemas src/schemas/
	@echo "Schema compiled: src/schemas/gschemas.compiled"

## Launch safe nested GNOME Shell for development (GNOME 51 devkit)
nested:
	bash scripts/dev-shell.sh

## Tail gnome-shell journal filtered to TahoeCC log lines
logs:
	journalctl -f -o cat /usr/bin/gnome-shell | grep TahoeCC

## Run pure-logic GJS test suite
test:
	gjs -m tests/run.js

## Pack extension zip for distribution (requires gnome-extensions CLI)
pack:
	mkdir -p dist
	gnome-extensions pack src/ --out-dir dist/ --force

## Remove symlink
uninstall:
	rm -rf "$(INSTALL_DIR)"
	@echo "Uninstalled: $(INSTALL_DIR)"

## Remove build artifacts
clean:
	rm -rf dist/ src/schemas/gschemas.compiled
