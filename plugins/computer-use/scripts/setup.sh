#!/usr/bin/env bash
# Setup usecomputer for talon-computer skill
set -euo pipefail

echo "=== talon-computer setup ==="

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install from https://nodejs.org" >&2
  exit 1
fi
echo "Node.js: $(node --version)"

# Check/install usecomputer
if command -v usecomputer &>/dev/null; then
  echo "usecomputer: already installed ($(usecomputer --version 2>/dev/null || echo 'version unknown'))"
else
  echo "Installing usecomputer..."
  npm install -g usecomputer
  echo "usecomputer: installed"
fi

# Check macOS
if [ "$(uname)" != "Darwin" ]; then
  echo "WARNING: usecomputer requires macOS. Desktop automation will not work on this platform." >&2
  exit 1
fi

# Check accessibility permissions
echo ""
echo "=== Accessibility Permission ==="
echo "usecomputer needs Accessibility access to control mouse/keyboard."
echo "Go to: System Settings → Privacy & Security → Accessibility"
echo "Enable your terminal app (Alacritty, Terminal, iTerm2, etc.)"
echo ""

# Quick test
echo "=== Testing ==="
if usecomputer mouse position --json &>/dev/null; then
  echo "Mouse position: OK"
else
  echo "WARNING: usecomputer mouse position failed."
  echo "Make sure Accessibility permissions are granted."
fi

echo ""
echo "Setup complete. Use /talon-computer skill to control the desktop."
