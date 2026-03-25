#!/usr/bin/env bash
# Talon Plugins — setup MCP server for all detected AI coding tools
# Usage: curl -fsSL https://raw.githubusercontent.com/gettalon/talon-plugins/master/scripts/setup.sh | bash
set -euo pipefail

MCP_PKG="@gettalon/mcp@2"

G='\033[32m' Y='\033[33m' C='\033[36m' D='\033[2m' B='\033[1m' R='\033[0m'
ok()   { echo -e "  ${G}✓${R} $1"; }
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
print()
" 2>/dev/null
  else
    echo '{"mcpServers":{"talon-browser":{"command":"npx","args":["-y","'"${MCP_PKG}"'"]}}}' | python3 -m json.tool > "$file"
  fi
  ok "Added to $file"
}

echo -e "\n${B}${C}Talon Setup${R} — configure MCP server for your AI tools"
echo -e "${D}Server: ${MCP_PKG}${R}"

# Codex — ~/.codex/config.toml
head "Codex"
CODEX_CFG="$HOME/.codex/config.toml"
mkdir -p "$HOME/.codex"
if [ -f "$CODEX_CFG" ] && grep -q "talon-browser" "$CODEX_CFG" 2>/dev/null; then
  ok "Already configured"
else
  cat >> "$CODEX_CFG" <<EOF

[mcp_servers.talon-browser]
command = "npx"
args = ["-y", "${MCP_PKG}"]
EOF
  ok "Added to $CODEX_CFG"
fi

# Cursor
head "Cursor"
add_json_mcp "$HOME/.cursor/mcp.json"

# Windsurf
head "Windsurf"
add_json_mcp "$HOME/.windsurf/mcp.json"

# Gemini CLI
head "Gemini CLI"
add_json_mcp "$HOME/.gemini/settings.json"

# Claude Code
head "Claude Code"
info "Run in Claude Code:"
info "  /plugin marketplace add gettalon/talon-plugins"
info "  /plugin install browser-control@gettalon-talon-plugins"
info "  /reload-plugins"

head "Done!"
ok "MCP server auto-starts when your tool connects"
echo ""
