#!/usr/bin/env bash
# Hold a key for a duration then release
# Usage: hold-key.sh <key> <duration_seconds>
# Example: hold-key.sh space 2
#          hold-key.sh shift 1.5

set -euo pipefail

KEY="${1:?Usage: hold-key.sh <key> <duration_seconds>}"
DURATION="${2:-1}"

osascript -e "
tell application \"System Events\"
    key down $KEY
    delay $DURATION
    key up $KEY
end tell
"
