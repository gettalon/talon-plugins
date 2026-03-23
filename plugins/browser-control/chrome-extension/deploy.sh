#!/bin/bash
# Build and package the Chrome extension for distribution
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
POPUP_DIR="$SCRIPT_DIR/popup-app"
OUTPUT_DIR="${1:-$HOME/Downloads/chrome-browser-control}"

echo "Building extension popup..."
cd "$POPUP_DIR"
npm run build

echo "Packaging extension to $OUTPUT_DIR..."
rm -rf "$OUTPUT_DIR"
cp -r "$SCRIPT_DIR" "$OUTPUT_DIR"
rm -rf "$OUTPUT_DIR/popup-app/node_modules"

echo "Done! Load from: $OUTPUT_DIR"
