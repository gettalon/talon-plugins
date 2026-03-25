#!/usr/bin/env bash
# Talon Plugins — setup for AI coding tools
# Usage: curl -fsSL https://raw.githubusercontent.com/gettalon/talon-plugins/master/scripts/setup.sh | bash
# Or:    bash setup.sh [all|codex|cursor|windsurf|gemini|claude]
set -euo pipefail

REPO="https://raw.githubusercontent.com/gettalon/talon-plugins/master"
MCP_PKG="@gettalon/mcp@2"

G='\033[32m' Y='\033[33m' C='\033[36m' D='\033[2m' B='\033[1m' R='\033[0m' RED='\033[31m'
ok()   { echo -e "  ${G}✓${R} $1"; }
skip() { echo -e "  ${D}– $1${R}"; }
info() { echo -e "  ${D}$1${R}"; }
head() { echo -e "\n${B}${C}$1${R}"; }

# ─── MCP config helpers ───

add_json_mcp() {
  local file="$1" key="$2" cmd="$3" shift; shift; shift
  local args_json="$*"
  local dir; dir=$(dirname "$file")
  mkdir -p "$dir"
  if [ -f "$file" ] && grep -q "\"$key\"" "$file" 2>/dev/null; then
    ok "$key already in $file"
    return
  fi
  python3 -c "
import json, os
f = '$file'
cfg = {}
if os.path.exists(f):
    with open(f) as fh: cfg = json.load(fh)
cfg.setdefault('mcpServers', {})['$key'] = {'command': '$cmd', 'args': $args_json}
with open(f, 'w') as fh: json.dump(cfg, fh, indent=2)
" 2>/dev/null
  ok "Added $key to $file"
}

add_toml_mcp() {
  local file="$1" key="$2" cmd="$3" args="$4"
  mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -q "$key" "$file" 2>/dev/null; then
    ok "$key already in $file"
    return
  fi
  cat >> "$file" <<EOF

[mcp_servers.$key]
command = "$cmd"
args = $args
EOF
  ok "Added $key to $file"
}

# ─── Per-tool setup ───
# Each tool gets:
#   - talon-browser MCP (browser control via Chrome DevTools)
# Claude Code also gets:
#   - All plugins (browser, computer-use, ai-dispatch, gitlab-scrum, autoresearch)

setup_codex() {
  head "Codex"
  add_toml_mcp "$HOME/.codex/config.toml" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
}

setup_cursor() {
  head "Cursor"
  add_json_mcp "$HOME/.cursor/mcp.json" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
}

setup_windsurf() {
  head "Windsurf"
  add_json_mcp "$HOME/.windsurf/mcp.json" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
}

setup_gemini() {
  head "Gemini CLI"
  add_json_mcp "$HOME/.gemini/settings.json" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
}

setup_claude() {
  head "Claude Code"
  if ! command -v claude &>/dev/null; then
    skip "claude CLI not found"
    return
  fi

  # Add marketplace
  if ! claude plugin marketplace list 2>/dev/null | grep -q "gettalon-talon-plugins"; then
    claude plugin marketplace add gettalon/talon-plugins 2>/dev/null && ok "Marketplace added" || info "Marketplace may already exist"
  else
    ok "Marketplace already added"
  fi

  # Fetch available plugins from marketplace
  MARKETPLACE_URL="${REPO}/.claude-plugin/marketplace.json"
  PLUGINS=$(curl -fsSL "$MARKETPLACE_URL" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('plugins', []):
    print(p['name'] + '|' + p['description'])
" 2>/dev/null)

  if [ -z "$PLUGINS" ]; then
    PLUGINS="web|Browser control
computer-use|Desktop automation
ai-dispatch|Multi-backend AI routing
autoresearch|Autonomous research loop
gitlab-scrum|GitLab Scrum management"
  fi

  # Checkbox select plugins
  IFS=$'\n' read -r -d '' -a PLUGIN_LIST <<< "$PLUGINS" || true
  PLUGIN_NUM=${#PLUGIN_LIST[@]}

  if [ "$PLUGIN_NUM" -gt 0 ] && { [ -t 0 ] || [ -e /dev/tty ]; }; then
    echo ""
    echo -e "  ${B}Select plugins to install:${R} ${D}(↑↓ Space Enter)${R}"

    declare -A P_CHECKED
    declare -a P_NAMES P_DESCS
    for i in "${!PLUGIN_LIST[@]}"; do
      P_NAMES[$i]="${PLUGIN_LIST[$i]%%|*}"
      P_DESCS[$i]="${PLUGIN_LIST[$i]#*|}"
      P_CHECKED[${P_NAMES[$i]}]=1
    done
    P_CURSOR=0

    draw_plugins() {
      for i in "${!P_NAMES[@]}"; do
        local name="${P_NAMES[$i]}"
        local desc="${P_DESCS[$i]}"
        local box="[ ]"
        [ "${P_CHECKED[$name]}" = "1" ] && box="${G}[x]${R}"
        if [ "$i" -eq "$P_CURSOR" ]; then
          echo -e "    ${C}▸${R} ${box} ${B}${name}${R} ${D}${desc}${R}"
        else
          echo -e "      ${box} ${name} ${D}${desc}${R}"
        fi
      done
      echo -e "    ${D}↑↓ move  Space toggle  Enter confirm${R}"
    }

    draw_plugins
    P_LINES=$((PLUGIN_NUM + 1))

    while true; do
      IFS= read -rsn1 key < /dev/tty 2>/dev/null || break
      if [[ "$key" == $'\x1b' ]]; then
        read -rsn2 rest < /dev/tty 2>/dev/null || break
        case "$rest" in
          '[A') P_CURSOR=$(( (P_CURSOR - 1 + PLUGIN_NUM) % PLUGIN_NUM )) ;;
          '[B') P_CURSOR=$(( (P_CURSOR + 1) % PLUGIN_NUM )) ;;
        esac
      elif [[ "$key" == " " ]]; then
        local name="${P_NAMES[$P_CURSOR]}"
        [ "${P_CHECKED[$name]}" = "1" ] && P_CHECKED[$name]=0 || P_CHECKED[$name]=1
      elif [[ "$key" == "" ]]; then
        break
      fi
      printf "\033[${P_LINES}A"
      draw_plugins
    done

    # Install selected
    for name in "${P_NAMES[@]}"; do
      if [ "${P_CHECKED[$name]}" = "1" ]; then
        if claude plugin list 2>/dev/null | grep -q "${name}@gettalon-talon-plugins"; then
          ok "$name already installed"
        else
          claude plugin install "${name}@gettalon-talon-plugins" 2>/dev/null && ok "$name installed" || info "$name — run: /plugin install ${name}@gettalon-talon-plugins"
        fi
      fi
    done
  else
    # Non-interactive: install all
    for entry in "${PLUGIN_LIST[@]}"; do
      local name="${entry%%|*}"
      if claude plugin list 2>/dev/null | grep -q "${name}@gettalon-talon-plugins"; then
        ok "$name already installed"
      else
        claude plugin install "${name}@gettalon-talon-plugins" 2>/dev/null && ok "$name installed" || info "$name — run: /plugin install ${name}@gettalon-talon-plugins"
      fi
    done
  fi
  info "Run /reload-plugins in Claude Code to activate"
}

# ─── Detect tools ───

declare -A DETECTED
{ [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; } && DETECTED[codex]=1
[ -d "$HOME/.cursor" ] && DETECTED[cursor]=1
[ -d "$HOME/.windsurf" ] && DETECTED[windsurf]=1
{ [ -d "$HOME/.gemini" ] || command -v gemini &>/dev/null; } && DETECTED[gemini]=1
command -v claude &>/dev/null && DETECTED[claude]=1

echo -e "\n${B}${C}Talon Setup${R}"
echo -e "${D}Browser MCP: ${MCP_PKG}${R}"

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

echo ""
echo -e "${D}MCP plugins (Codex/Cursor/Windsurf/Gemini):${R}"
info "  talon-browser — Chrome browser control (15 tools)"
echo -e "${D}Claude Code plugins (skills + MCP):${R}"
info "  web, computer-use, ai-dispatch, gitlab-scrum, autoresearch"

# ─── Handle CLI arg or interactive ───

TARGET="${1:-}"

if [ -n "$TARGET" ]; then
  case "$TARGET" in
    all)     for t in "${ALL_TOOLS[@]}"; do "setup_$t"; done ;;
    codex)   setup_codex ;;
    cursor)  setup_cursor ;;
    windsurf) setup_windsurf ;;
    gemini)  setup_gemini ;;
    claude)  setup_claude ;;
    *) echo -e "${RED}Unknown: $TARGET${R}"; echo "Usage: setup.sh [all|codex|cursor|windsurf|gemini|claude]"; exit 1 ;;
  esac
elif [ ${#detected_list[@]} -eq 0 ]; then
  echo -e "\n${Y}No tools detected. Setting up all configs anyway.${R}"
  for t in "${ALL_TOOLS[@]}"; do "setup_$t"; done
else
  # Checkbox: select tools
  MENU_ITEMS=("All" "${ALL_TOOLS[@]}")
  MENU_NUM=${#MENU_ITEMS[@]}
  declare -A CHECKED
  CHECKED[All]=1
  for t in "${ALL_TOOLS[@]}"; do
    [[ " ${detected_list[*]} " == *" $t "* ]] && CHECKED[$t]=1 || CHECKED[$t]=0
  done
  all_on=1; for t in "${ALL_TOOLS[@]}"; do [ "${CHECKED[$t]}" != "1" ] && all_on=0; done
  CHECKED[All]=$all_on
  CURSOR=0

  draw_checkboxes() {
    for i in "${!MENU_ITEMS[@]}"; do
      local t="${MENU_ITEMS[$i]}" box="[ ]"
      [ "${CHECKED[$t]}" = "1" ] && box="${G}[x]${R}"
      local label="$t"
      [ "$t" != "All" ] && [[ " ${detected_list[*]} " == *" $t "* ]] && label="$t ${D}(detected)${R}"
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
      local v=1; [ "${CHECKED[All]}" = "1" ] && v=0
      CHECKED[All]=$v; for tool in "${ALL_TOOLS[@]}"; do CHECKED[$tool]=$v; done
    else
      [ "${CHECKED[$t]}" = "1" ] && CHECKED[$t]=0 || CHECKED[$t]=1
      local a=1; for tool in "${ALL_TOOLS[@]}"; do [ "${CHECKED[$tool]}" != "1" ] && a=0; done
      CHECKED[All]=$a
    fi
  }

  if [ -t 0 ] || [ -e /dev/tty ]; then
    echo -e "\n${B}Select tools to configure:${R}"
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
      elif [[ "$key" == " " ]]; then toggle_item
      elif [[ "$key" == "" ]]; then break
      fi
      printf "\033[${LINES_DRAWN}A"
      draw_checkboxes
    done
  fi

  for t in "${ALL_TOOLS[@]}"; do
    [ "${CHECKED[$t]}" = "1" ] && "setup_$t"
  done
fi

head "Done!"
ok "MCP server auto-starts when your tool connects"
echo -e "${D}  Config locations:${R}"
info "  Codex:    ~/.codex/config.toml"
info "  Cursor:   ~/.cursor/mcp.json"
info "  Windsurf: ~/.windsurf/mcp.json"
info "  Gemini:   ~/.gemini/settings.json"
info "  Claude:   ~/.claude/plugins/"
echo ""
