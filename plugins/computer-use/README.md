# Computer Use Plugin

Control the macOS desktop from Claude Code — mouse, keyboard, screenshots, windows, displays, clipboard. 21 actions matching Claude's Computer Use API.

## Install

```bash
/plugin install gettalon/talon-plugins:computer-use
```

## Setup

```bash
npm install -g usecomputer
```

Then enable Accessibility permissions for your terminal:
**System Settings → Privacy & Security → Accessibility → Enable your terminal app**

## What it does

Uses [usecomputer](https://github.com/remorses/kimaki/tree/main/usecomputer) CLI for native macOS Quartz event automation:

- **Screenshot** — capture screen, region, window, or display
- **Click** — left/right/middle, single/double/triple, with modifiers
- **Hover** — move cursor without clicking
- **Drag** — drag and drop with duration control
- **Type** — text input with delay, stdin, chunking
- **Press** — keyboard shortcuts with repeat
- **Scroll** — directional with position targeting
- **Mouse down/up** — press and hold
- **Windows/Displays** — list and target
- **Clipboard** — get/set
- **Batch** — chain multiple actions in one call
- **Open App** — launch/focus applications
- **Hold Key** — hold a key for duration

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/setup.sh` | Install usecomputer + check permissions |
| `scripts/batch.sh` | Chain multiple actions from JSON |
| `scripts/open-app.sh` | Launch/focus an app |
| `scripts/hold-key.sh` | Hold a key for duration |
| `scripts/map-coords.sh` | Map screenshot coords to screen coords |
| `scripts/computer-use.sh` | Unified action dispatcher |
