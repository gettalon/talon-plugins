#!/bin/bash
# Install Talon native messaging host for Chrome
# Usage: ./install.sh [chrome-extension-id]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.gettalon.mcp"
HOST_SCRIPT="$SCRIPT_DIR/talon-native-host.js"

# Get extension ID from arg or prompt
EXT_ID="${1:-}"
if [ -z "$EXT_ID" ]; then
  echo "Usage: ./install.sh <chrome-extension-id>"
  echo ""
  echo "Find your extension ID at chrome://extensions (enable Developer Mode)"
  exit 1
fi

# Detect OS and set target directory
if [ "$(uname)" = "Darwin" ]; then
  TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [ "$(uname)" = "Linux" ]; then
  TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
else
  echo "Unsupported OS. Please install manually."
  exit 1
fi

mkdir -p "$TARGET_DIR"

# Make host script executable
chmod +x "$HOST_SCRIPT"

# Write manifest with correct path and extension ID
cat > "$TARGET_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Talon MCP native messaging host for browser discovery",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo "Installed native messaging host:"
echo "  Manifest: $TARGET_DIR/$HOST_NAME.json"
echo "  Script:   $HOST_SCRIPT"
echo "  Extension: $EXT_ID"
echo ""
echo "Restart Chrome to activate."
