#!/usr/bin/env bash
# Execute a computer-use action from Claude's tool response
# Usage: computer-use.sh <action> [args...]
#
# Actions:
#   screenshot [--path /tmp/screen.png]
#   click <x> <y> [--coordMap MAP] [--button left|right] [--count 1|2]
#   type <text> [--delay ms]
#   press <key_combo>
#   scroll <direction> [--amount N]
#   move <x> <y> [--coordMap MAP]
#   drag <fromX> <fromY> <toX> <toY> [--coordMap MAP]

set -euo pipefail

ACTION="${1:-}"
shift || true

map_point() {
  local x="$1" y="$2" coordmap="$3"
  local dir
  dir="$(cd "$(dirname "$0")" && pwd)"
  "$dir/map-coords.sh" "$x" "$y" "$coordmap"
}

case "$ACTION" in
  screenshot)
    PATH_ARG="${1:---path}"
    if [ "$PATH_ARG" = "--path" ]; then
      OUT="${2:-/tmp/talon-screen-$(date +%s).png}"
    else
      OUT="$PATH_ARG"
    fi
    usecomputer screenshot --path "$OUT"
    ;;

  click)
    X="$1"; Y="$2"; shift 2
    COORD_MAP="" BUTTON="left" COUNT="1"
    while [ $# -gt 0 ]; do
      case "$1" in
        --coordMap) COORD_MAP="$2"; shift 2 ;;
        --button) BUTTON="$2"; shift 2 ;;
        --count) COUNT="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    if [ -n "$COORD_MAP" ]; then
      read -r X Y <<< "$(map_point "$X" "$Y" "$COORD_MAP")"
    fi
    usecomputer click -x "$X" -y "$Y" --button "$BUTTON" --count "$COUNT"
    ;;

  type)
    TEXT="$1"; shift
    DELAY=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --delay) DELAY="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    if [ -n "$DELAY" ]; then
      usecomputer type "$TEXT" --delay "$DELAY"
    else
      usecomputer type "$TEXT"
    fi
    ;;

  press)
    usecomputer press "$1"
    ;;

  scroll)
    DIR="$1"; shift
    AMOUNT="3"
    while [ $# -gt 0 ]; do
      case "$1" in
        --amount) AMOUNT="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    usecomputer scroll --direction "$DIR" --amount "$AMOUNT"
    ;;

  move)
    X="$1"; Y="$2"; shift 2
    COORD_MAP=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --coordMap) COORD_MAP="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    if [ -n "$COORD_MAP" ]; then
      read -r X Y <<< "$(map_point "$X" "$Y" "$COORD_MAP")"
    fi
    usecomputer mouse move -x "$X" -y "$Y"
    ;;

  position)
    usecomputer mouse position --json
    ;;

  debug)
    X="$1"; Y="$2"; shift 2
    COORD_MAP=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --coordMap) COORD_MAP="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    if [ -n "$COORD_MAP" ]; then
      usecomputer debug-point -x "$X" -y "$Y" --coord-map "$COORD_MAP"
    else
      usecomputer debug-point -x "$X" -y "$Y"
    fi
    ;;

  *)
    echo "Usage: $0 <action> [args...]" >&2
    echo "Actions: screenshot, click, type, press, scroll, move, position, debug" >&2
    exit 1
    ;;
esac
