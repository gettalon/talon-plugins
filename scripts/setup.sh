#!/usr/bin/env bash
# Talon Plugins — setup MCP server for AI coding tools
# Usage: curl -fsSL https://raw.githubusercontent.com/gettalon/talon-plugins/master/scripts/setup.sh | bash
# Or:    bash setup.sh [all|codex|cursor|windsurf|gemini]
set -euo pipefail

MCP_PKG="@gettalon/mcp@2"

G='\033[32m' Y='\033[33m' C='\033[36m' D='\033[2m' B='\033[1m' R='\033[0m' RED='\033[31m'
ok()   { echo -e "  ${G}✓${R} $1"; }
skip() { echo -e "  ${D}– $1${R}"; }
info() { echo -e "  ${D}$1${R}"; }
head() { echo -e "\n${B}${C}$1${R}"; }

add_json_mcp() {
  local file="$1" dir
  dir=$(dirname "$file")
  mkdir -p "$dir"
  if [ -f "$file" ] && grep -q "talon-browser" "$file" 2>/dev/null; then
    ok "Already configured"
    return
  fi
  if [ -f "$file" ]; then
    python3 -c "
import json
with open('$file') as f: cfg = json.load(f)
cfg.setdefault('mcpServers', {})['talon-browser'] = {'command': 'npx', 'args': ['-y', '${MCP_PKG}']}
with open('$file', 'w') as f: json.dump(cfg, f, indent=2)
" 2>/dev/null
  else
    echo '{"mcpServers":{"talon-browser":{"command":"npx","args":["-y","'"${MCP_PKG}"'"]}}}' | python3 -m json.tool > "$file"
  fi
  ok "Added to $file"
}

setup_codex() {
  head "Codex"
  local cfg="$HOME/.codex/config.toml"
  mkdir -p "$HOME/.codex"
  if [ -f "$cfg" ] && grep -q "talon-browser" "$cfg" 2>/dev/null; then
    ok "Already configured"
  else
    cat >> "$cfg" <<EOF

[mcp_servers.talon-browser]
command = "npx"
args = ["-y", "${MCP_PKG}"]
EOF
    ok "Added to $cfg"
  fi
}

setup_cursor()   { head "Cursor";     add_json_mcp "$HOME/.cursor/mcp.json"; }
setup_windsurf() { head "Windsurf";   add_json_mcp "$HOME/.windsurf/mcp.json"; }
setup_gemini()   { head "Gemini CLI"; add_json_mcp "$HOME/.gemini/settings.json"; }

setup_claude() {
  head "Claude Code"
  if ! command -v claude &>/dev/null; then
    skip "claude CLI not found"
    return
  fi
  # Add marketplace if not present
  if ! claude plugin marketplace list 2>/dev/null | grep -q "gettalon-talon-plugins"; then
    claude plugin marketplace add gettalon/talon-plugins 2>/dev/null && ok "Marketplace added" || info "Marketplace may already exist"
  else
    ok "Marketplace already added"
  fi
  # Install plugins
  for plugin in browser-control computer-use ai-dispatch gitlab-scrum; do
    if claude plugin list 2>/dev/null | grep -q "${plugin}@gettalon-talon-plugins"; then
      ok "$plugin already installed"
    else
      claude plugin install "${plugin}@gettalon-talon-plugins" 2>/dev/null && ok "$plugin installed" || info "$plugin — install manually: /plugin install ${plugin}@gettalon-talon-plugins"
    fi
  done
  info "Run /reload-plugins in Claude Code to activate"
}

# Detect tools
declare -A DETECTED
[ -d "$HOME/.codex" ] || command -v codex &>/dev/null && DETECTED[codex]=1
[ -d "$HOME/.cursor" ] && DETECTED[cursor]=1
[ -d "$HOME/.windsurf" ] && DETECTED[windsurf]=1
[ -d "$HOME/.gemini" ] || command -v gemini &>/dev/null && DETECTED[gemini]=1
command -v claude &>/dev/null && DETECTED[claude]=1

echo -e "\n${B}${C}Talon Setup${R}"
echo -e "${D}MCP server: ${MCP_PKG}${R}"

# Show detected
head "Detected Tools"
ALL_TOOLS=(codex cursor windsurf gemini claude)
detected_list=()
for tool in "${ALL_TOOLS[@]}"; do
  if [ "${DETECTED[$tool]:-}" = "1" ]; then
    ok "$tool"
    detected_list+=("$tool")
  else
    skip "$tool (not found)"
  fi
done

# Handle CLI arg
TARGET="${1:-}"

if [ -n "$TARGET" ]; then
  # Direct target specified
  case "$TARGET" in
    all)     for t in "${ALL_TOOLS[@]}"; do "setup_$t"; done ;;
    codex)   setup_codex ;;
    cursor)  setup_cursor ;;
    windsurf) setup_windsurf ;;
    gemini)  setup_gemini ;;
    claude)  setup_claude ;;
    *) echo -e "${RED}Unknown target: $TARGET${R}"; echo "Usage: setup.sh [all|codex|cursor|windsurf|gemini|claude]"; exit 1 ;;
  esac
elif [ ${#detected_list[@]} -eq 0 ]; then
  echo -e "\n${Y}No tools detected. Setting up all configs anyway.${R}"
  for t in "${ALL_TOOLS[@]}"; do "setup_$t"; done
else
  # Checkbox multi-select: ↑/↓ move, Space toggle, Enter confirm
  # "All" at top + individual tools. Detected = checked by default.
  MENU_ITEMS=("All" "${ALL_TOOLS[@]}")
  MENU_NUM=${#MENU_ITEMS[@]}
  declare -A CHECKED
  CHECKED[All]=1
  for t in "${ALL_TOOLS[@]}"; do
    [[ " ${detected_list[*]} " == *" $t "* ]] && CHECKED[$t]=1 || CHECKED[$t]=0
  done
  # If not all checked, uncheck "All"
  all_on=1
  for t in "${ALL_TOOLS[@]}"; do [ "${CHECKED[$t]}" != "1" ] && all_on=0; done
  CHECKED[All]=$all_on
  CURSOR=0

  draw_checkboxes() {
    for i in "${!MENU_ITEMS[@]}"; do
      local t="${MENU_ITEMS[$i]}"
      local box="[ ]"
      [ "${CHECKED[$t]}" = "1" ] && box="${G}[x]${R}"
      local label="$t"
      # Show detected marker
      if [ "$t" != "All" ]; then
        [[ " ${detected_list[*]} " == *" $t "* ]] && label="$t ${D}(detected)${R}" || label="$t"
      fi
      if [ "$i" -eq "$CURSOR" ]; then
        echo -e "  ${C}▸${R} ${box} ${B}${label}${R}"
      else
        echo -e "    ${box} ${label}"
      fi
    done
    echo -e "  ${D}↑↓ move  Space toggle  Enter confirm${R}"
  }

  toggle_item() {
    local t="${MENU_ITEMS[$CURSOR]}"
    if [ "$t" = "All" ]; then
      # Toggle all
      local new_val=1
      [ "${CHECKED[All]}" = "1" ] && new_val=0
      CHECKED[All]=$new_val
      for tool in "${ALL_TOOLS[@]}"; do CHECKED[$tool]=$new_val; done
    else
      # Toggle individual
      [ "${CHECKED[$t]}" = "1" ] && CHECKED[$t]=0 || CHECKED[$t]=1
      # Update "All" state
      local all_on=1
      for tool in "${ALL_TOOLS[@]}"; do [ "${CHECKED[$tool]}" != "1" ] && all_on=0; done
      CHECKED[All]=$all_on
    fi
  }

  if [ -t 0 ] || [ -e /dev/tty ]; then
    echo ""
    echo -e "${B}Select tools to configure:${R}"
    draw_checkboxes
    LINES_DRAWN=$((MENU_NUM + 1))

    while true; do
      IFS= read -rsn1 key < /dev/tty 2>/dev/null || break
      if [[ "$key" == $'\x1b' ]]; then
        read -rsn2 rest < /dev/tty 2>/dev/null || break
        case "$rest" in
          '[A') CURSOR=$(( (CURSOR - 1 + MENU_NUM) % MENU_NUM )) ;;
          '[B') CURSOR=$(( (CURSOR + 1) % MENU_NUM )) ;;
        esac
      elif [[ "$key" == " " ]]; then
        toggle_item
      elif [[ "$key" == "" ]]; then
        break
      fi
      printf "\033[${LINES_DRAWN}A"
      draw_checkboxes
    done
  fi

  # Run setup for checked tools
  for t in "${ALL_TOOLS[@]}"; do
    [ "${CHECKED[$t]}" = "1" ] && "setup_$t"
  done
fi

head "Done!"
ok "MCP server auto-starts when your tool connects"
echo ""
