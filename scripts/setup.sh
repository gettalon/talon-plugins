#!/usr/bin/env bash
# Talon Plugins — cross-tool setup (MCP + Skills)
# Usage: curl -fsSL https://raw.githubusercontent.com/gettalon/talon-plugins/master/scripts/setup.sh | bash
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/gettalon/talon-plugins/master"
MCP_PKG="@gettalon/mcp@2"

G='\033[32m' Y='\033[33m' C='\033[36m' D='\033[2m' B='\033[1m' R='\033[0m'
ok()   { echo -e "  ${G}✓${R} $1"; }
skip() { echo -e "  ${D}– $1${R}"; }
info() { echo -e "  ${D}$1${R}"; }

# ─── Detect ───
declare -A HAS
{ [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; } && HAS[codex]=1
[ -d "$HOME/.cursor" ] && HAS[cursor]=1
[ -d "$HOME/.windsurf" ] && HAS[windsurf]=1
{ [ -d "$HOME/.gemini" ] || command -v gemini &>/dev/null; } && HAS[gemini]=1
command -v claude &>/dev/null && HAS[claude]=1

echo -e "\n${B}${C}Talon Setup${R}\n"

# ─── Two-column checkbox ───
# Left: Tools    Right: Skills/Plugins

TOOLS=("codex" "cursor" "windsurf" "gemini" "claude")
SKILLS=("gitlab-scrum" "gitlab-sprint" "gitlab-board" "gitlab-wiki" "ai-dispatch" "autoresearch")

declare -A T_ON S_ON
for t in "${TOOLS[@]}"; do T_ON[$t]=${HAS[$t]:-0}; done
for s in "${SKILLS[@]}"; do S_ON[$s]=1; done

COL=0  # 0=tools, 1=skills
T_CUR=0
S_CUR=0

draw() {
  local t_num=${#TOOLS[@]} s_num=${#SKILLS[@]}
  local max=$((t_num > s_num ? t_num : s_num))

  printf "  ${B}%-34s %s${R}\n" "Tools" "Skills / Plugins"
  printf "  ${D}%-34s %s${R}\n" "─────" "────────────────"

  for i in $(seq 0 $((max - 1))); do
    # Left column: tools
    if [ "$i" -lt "$t_num" ]; then
      local t="${TOOLS[$i]}"
      local box="[ ]"; [ "${T_ON[$t]}" = "1" ] && box="${G}[x]${R}"
      local det=""; [ "${HAS[$t]:-0}" = "1" ] && det=" ${D}✓${R}"
      if [ "$COL" -eq 0 ] && [ "$i" -eq "$T_CUR" ]; then
        printf "  ${C}▸${R} %-2b %-24b" "$box" "${B}${t}${R}${det}"
      else
        printf "    %-2b %-24b" "$box" "${t}${det}"
      fi
    else
      printf "  %-30s" ""
    fi

    # Right column: skills
    if [ "$i" -lt "$s_num" ]; then
      local s="${SKILLS[$i]}"
      local sbox="[ ]"; [ "${S_ON[$s]}" = "1" ] && sbox="${G}[x]${R}"
      if [ "$COL" -eq 1 ] && [ "$i" -eq "$S_CUR" ]; then
        printf "${C}▸${R} %-2b %b" "$sbox" "${B}${s}${R}"
      else
        printf "  %-2b %b" "$sbox" "${s}"
      fi
    fi
    echo ""
  done
  echo -e "  ${D}↑↓ move  ←→ switch column  Space toggle  Enter confirm${R}"
}

TOTAL_LINES=$(( (${#TOOLS[@]} > ${#SKILLS[@]} ? ${#TOOLS[@]} : ${#SKILLS[@]}) + 3 ))

if [ -t 0 ] || [ -e /dev/tty ]; then
  draw
  while true; do
    IFS= read -rsn1 key < /dev/tty 2>/dev/null || break
    if [[ "$key" == $'\x1b' ]]; then
      read -rsn2 rest < /dev/tty 2>/dev/null || break
      case "$rest" in
        '[A') # Up
          if [ "$COL" -eq 0 ]; then T_CUR=$(( (T_CUR - 1 + ${#TOOLS[@]}) % ${#TOOLS[@]} ))
          else S_CUR=$(( (S_CUR - 1 + ${#SKILLS[@]}) % ${#SKILLS[@]} )); fi ;;
        '[B') # Down
          if [ "$COL" -eq 0 ]; then T_CUR=$(( (T_CUR + 1) % ${#TOOLS[@]} ))
          else S_CUR=$(( (S_CUR + 1) % ${#SKILLS[@]} )); fi ;;
        '[D') COL=0 ;; # Left
        '[C') COL=1 ;; # Right
      esac
    elif [[ "$key" == " " ]]; then
      if [ "$COL" -eq 0 ]; then
        local t="${TOOLS[$T_CUR]}"
        [ "${T_ON[$t]}" = "1" ] && T_ON[$t]=0 || T_ON[$t]=1
      else
        local s="${SKILLS[$S_CUR]}"
        [ "${S_ON[$s]}" = "1" ] && S_ON[$s]=0 || S_ON[$s]=1
      fi
    elif [[ "$key" == "" ]]; then
      break
    fi
    printf "\033[${TOTAL_LINES}A"
    draw
  done
fi

# ─── Install ───

# MCP helpers
add_json_mcp() {
  local file="$1"; mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -q "talon-browser" "$file" 2>/dev/null; then ok "MCP already in $(basename "$file")"; return; fi
  python3 -c "
import json, os; f='$file'
cfg = json.load(open(f)) if os.path.exists(f) else {}
cfg.setdefault('mcpServers',{})['talon-browser']={'command':'npx','args':['-y','${MCP_PKG}']}
json.dump(cfg, open(f,'w'), indent=2)" 2>/dev/null
  ok "MCP added to $(basename "$file")"
}

add_toml_mcp() {
  local file="$1"; mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -q "talon-browser" "$file" 2>/dev/null; then ok "MCP already in $(basename "$file")"; return; fi
  printf '\n[mcp_servers.talon-browser]\ncommand = "npx"\nargs = ["-y", "%s"]\n' "${MCP_PKG}" >> "$file"
  ok "MCP added to $(basename "$file")"
}

# Skill source map
declare -A SKILL_SRC=(
  [gitlab-scrum]="gitlab-scrum/gitlab-scrum" [gitlab-sprint]="gitlab-scrum/gitlab-sprint"
  [gitlab-board]="gitlab-scrum/gitlab-board" [gitlab-wiki]="gitlab-scrum/gitlab-wiki"
  [ai-dispatch]="ai-dispatch/ai-dispatch" [autoresearch]="autoresearch/autoresearch"
)

install_skill() {
  local skill="$1" target="$2"
  local src="${SKILL_SRC[$skill]}" plugin="${SKILL_SRC[$skill]%%/*}"
  local dir="$target/$skill" file="$dir/SKILL.md"
  [ -f "$file" ] && { ok "$skill already installed"; return; }
  mkdir -p "$dir"
  local url="${REPO_RAW}/plugins/${plugin}/skills/${skill}/SKILL.md"
  local url2="${REPO_RAW}/plugins/${plugin}/skills/${skill}/skill.md"
  curl -fsSL "$url" -o "$file" 2>/dev/null || curl -fsSL "$url2" -o "$file" 2>/dev/null && ok "$skill" || { skip "$skill"; rm -rf "$dir"; }
}

echo ""

# Tools
for t in "${TOOLS[@]}"; do
  [ "${T_ON[$t]}" != "1" ] && continue
  echo -e "\n${B}${C}${t}${R}"
  case "$t" in
    codex)    add_toml_mcp "$HOME/.codex/config.toml"
              for s in "${SKILLS[@]}"; do [ "${S_ON[$s]}" = "1" ] && install_skill "$s" "$HOME/.agents/skills"; done ;;
    cursor)   add_json_mcp "$HOME/.cursor/mcp.json"
              for s in "${SKILLS[@]}"; do [ "${S_ON[$s]}" = "1" ] && install_skill "$s" "$HOME/.agents/skills"; done ;;
    windsurf) add_json_mcp "$HOME/.windsurf/mcp.json"
              for s in "${SKILLS[@]}"; do [ "${S_ON[$s]}" = "1" ] && install_skill "$s" "$HOME/.agents/skills"; done ;;
    gemini)   add_json_mcp "$HOME/.gemini/settings.json"
              for s in "${SKILLS[@]}"; do [ "${S_ON[$s]}" = "1" ] && install_skill "$s" "$HOME/.agents/skills"; done ;;
    claude)
      if command -v claude &>/dev/null; then
        claude plugin marketplace list 2>/dev/null | grep -q "gettalon-talon-plugins" && ok "Marketplace ready" || \
          { claude plugin marketplace add gettalon/talon-plugins 2>/dev/null && ok "Marketplace added"; }
        PLUGIN_NAMES=$(curl -fsSL "${REPO_RAW}/.claude-plugin/marketplace.json" 2>/dev/null | \
          python3 -c "import sys,json;[print(p['name']) for p in json.load(sys.stdin).get('plugins',[])]" 2>/dev/null)
        [ -z "$PLUGIN_NAMES" ] && PLUGIN_NAMES="web computer-use ai-dispatch autoresearch gitlab-scrum"
        for p in $PLUGIN_NAMES; do
          claude plugin list 2>/dev/null | grep -q "${p}@gettalon-talon-plugins" && ok "$p" || \
            { claude plugin install "${p}@gettalon-talon-plugins" 2>/dev/null && ok "$p installed" || info "$p — /plugin install ${p}@gettalon-talon-plugins"; }
        done
        info "Run /reload-plugins to activate"
      else
        skip "claude CLI not found"
      fi ;;
  esac
done

echo -e "\n${B}${C}Done!${R}"
ok "MCP + Skills configured"
echo ""
