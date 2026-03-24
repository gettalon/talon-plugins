#!/bin/bash
# Copy Chrome extension to Downloads for easy loading
EXT_DIR="$(dirname "$0")/../chrome-extension"
DEST="$HOME/Downloads/talon-browser-control"

rm -rf "$DEST"
cp -r "$EXT_DIR" "$DEST"

echo "Chrome extension copied to: $DEST"
echo ""
echo "To install:"
echo "  1. Open Chrome → chrome://extensions"
echo "  2. Enable Developer Mode"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: $DEST"
echo ""

# Try to open Chrome extensions page
if [ "$(uname)" = "Darwin" ]; then
  open "chrome://extensions" 2>/dev/null || true
fi
