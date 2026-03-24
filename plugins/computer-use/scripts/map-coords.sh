#!/usr/bin/env bash
# Map image coordinates to screen coordinates using usecomputer's coordMap
# Usage: map-coords.sh <image_x> <image_y> <coordMap>
# Example: map-coords.sh 400 220 "0,0,1600,900,1568,882"
# Output: 408 224

set -euo pipefail

if [ $# -ne 3 ]; then
  echo "Usage: $0 <image_x> <image_y> <coordMap>" >&2
  echo "  coordMap format: captureX,captureY,captureW,captureH,imageW,imageH" >&2
  exit 1
fi

IMAGE_X="$1"
IMAGE_Y="$2"
COORD_MAP="$3"

# Parse coordMap: captureX,captureY,captureW,captureH,imageW,imageH
IFS=',' read -r CAP_X CAP_Y CAP_W CAP_H IMG_W IMG_H <<< "$COORD_MAP"

# Map: screen = capture + (image / imageSize) * captureSize
SCREEN_X=$(python3 -c "print(int($CAP_X + ($IMAGE_X / $IMG_W) * $CAP_W))")
SCREEN_Y=$(python3 -c "print(int($CAP_Y + ($IMAGE_Y / $IMG_H) * $CAP_H))")

echo "$SCREEN_X $SCREEN_Y"
