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
  info "Run in Claude Code:"
  info "  /plugin marketplace add gettalon/talon-plugins"
  info "  /plugin install browser-control@gettalon-talon-plugins"
  info "  /reload-plugins"
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
  # Interactive — let user choose
  echo ""
  echo -e "${B}Setup options:${R}"
  echo -e "  ${B}a${R}) All tools (default)"
  echo -e "  ${B}d${R}) Detected only (${detected_list[*]})"
  echo -e "  ${B}s${R}) Select individually"
  echo ""
  read -r -p "Choice [a/d/s] (default: a): " choice < /dev/tty 2>/dev/null || choice="a"
  choice="${choice:-a}"

  case "$choice" in
    a|A)
      for t in "${ALL_TOOLS[@]}"; do "setup_$t"; done
      ;;
    d|D)
      for t in "${detected_list[@]}"; do "setup_$t"; done
      ;;
    s|S)
      for t in "${ALL_TOOLS[@]}"; do
        read -r -p "  Setup $t? [Y/n]: " yn < /dev/tty 2>/dev/null || yn="y"
        yn="${yn:-y}"
        [[ "$yn" =~ ^[Yy] ]] && "setup_$t"
      done
      ;;
    *) for t in "${ALL_TOOLS[@]}"; do "setup_$t"; done ;;
  esac
fi

head "Done!"
ok "MCP server auto-starts when your tool connects"
echo ""
