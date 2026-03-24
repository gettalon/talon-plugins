#!/usr/bin/env bash
# Launch or focus an application by name
# Usage: open-app.sh <app_name>
# Example: open-app.sh Safari
#          open-app.sh "Google Chrome"
#          open-app.sh Finder

set -euo pipefail

APP="${1:?Usage: open-app.sh <app_name>}"

open -a "$APP" 2>/dev/null || {
  echo "App not found: $APP" >&2
  echo "Trying Spotlight..." >&2
  osascript -e "
    tell application \"System Events\"
      keystroke space using command down
      delay 0.3
      keystroke \"$APP\"
      delay 0.5
      key code 36
    end tell
  "
}
