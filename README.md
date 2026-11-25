# Tahoe Control Center: GNOME Shell extension (brief pack)

Goal: re-arrange the stock Ubuntu/GNOME **Quick Settings** panel into a macOS-Tahoe-style
**Control Center** layout and add a **Now Playing (music) card**, using a custom GNOME Shell
extension. The existing items (Wi-Fi, Bluetooth, Dark Style, volume, brightness, power buttons,
and so on) are *moved*, not rebuilt, so they keep working. Only the music card is new.

The user already runs the MacTahoe GTK/Shell theme with a "liquid glass" look. **Theming is
out of scope.** This project is about **structure and layout**.

## Files in this pack

| File | What it is | Read it when |
|---|---|---|
| `CLAUDE.md` | Standing rules for Claude Code (put at repo root) | Always, first |
| `docs/01-PRD.md` | Product requirements, scope, acceptance criteria | Before any work |
| `docs/02-ARCHITECTURE.md` | How the extension works, module design, GNOME internals to verify | Before writing code |
| `docs/03-UI-SPEC.md` | Exact target layout, wireframe, sizing and CSS rules | When building layout/styling |
| `docs/04-MUSIC-CARD-MPRIS.md` | Music card behaviour and the MPRIS (D-Bus) design | When building the music card |
| `docs/05-IMPLEMENTATION-PLAN.md` | Phased task list with gates and acceptance tests | To plan and track work |
| `docs/06-DEV-ENV-AND-TESTING.md` | Safe dev loop (nested shell), debugging, QA checklist | Before the first run |
| `docs/07-RISKS-AND-OPEN-QUESTIONS.md` | Known unknowns and decisions for the human | Phase 0 and at every gate |

## How to use with Claude Code

1. Create a repo. Copy `CLAUDE.md` to the repo root and the `docs/` folder as-is.
2. Save the reference images into `docs/reference/`:
   - `current-layout.png`: the user's current Ubuntu quick settings (left screenshot)
   - `target-mockup.png`: the desired layout (right screenshot, with the music card)
   - `macos-tahoe-control-center.png`: the real macOS Tahoe Control Center
3. The human runs the commands in `docs/06-DEV-ENV-AND-TESTING.md` section 1 and pastes the
   output into `docs/reference/environment.md` (GNOME version, Ubuntu version, enabled
   extensions, and so on). **The whole plan depends on the GNOME Shell version.**
4. Start Claude Code in the repo with the prompt below.
5. Respect the human gates in `docs/05-IMPLEMENTATION-PLAN.md`. The agent must stop and
   report at the end of Phase 0, 2, 5 and 7.

## Suggested first prompt for Claude Code

> Read `CLAUDE.md` and everything in `docs/` carefully. Then begin **Phase 0 (recon spike)**
> from `docs/05-IMPLEMENTATION-PLAN.md`. Do not build UI yet. Your deliverable for Phase 0 is
> `docs/reference/recon.md` (findings about the installed GNOME Shell's quick settings
> internals), plus a minimal throw-away extension that logs the widget tree. Follow the safety
> rules in `CLAUDE.md`: never restart or kill the live gnome-shell session; use the nested
> shell workflow. Stop when Phase 0 is done and summarize what you found, especially every
> item marked **VERIFY** in the docs.

## Conventions used in these docs

- **VERIFY**: a claim about GNOME Shell internals made from memory. The agent must confirm
  it against the installed Shell's real source/runtime before relying on it. Never trust a
  VERIFY item blindly.
- **P0 / P1 / P2**: must-have / should-have / nice-to-have.
- Requirement IDs (FR-x, NFR-x) are referenced from the plan and tests.
