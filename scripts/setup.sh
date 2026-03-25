#!/usr/bin/env bash
# Talon Plugins — cross-tool setup (MCP + Skills)
# Usage: curl -fsSL https://raw.githubusercontent.com/gettalon/talon-plugins/master/scripts/setup.sh | bash
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/gettalon/talon-plugins/master"
MCP_PKG="@gettalon/mcp@2"

G='\033[32m' C='\033[36m' D='\033[2m' B='\033[1m' R='\033[0m'
ok()   { echo -e "  ${G}✓${R} $1"; }
skip() { echo -e "  ${D}– $1${R}"; }
info() { echo -e "  ${D}$1${R}"; }

# ─── Data ───
SKILLS=("all" "gitlab-scrum" "gitlab-sprint" "gitlab-board" "gitlab-wiki" "ai-dispatch" "autoresearch")
S_LABEL=("Toggle all" "GitLab issues/labels/milestones" "Sprint planning" "Kanban boards" "Wiki + Mermaid" "AI routing (7 backends)" "Edit-test-measure loop")

TOOLS=("all" "codex" "cursor" "windsurf" "gemini" "claude")
T_LABEL=("Toggle all" "" "" "" "" "")

declare -A HAS
{ [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; } && HAS[codex]=1
[ -d "$HOME/.cursor" ] && HAS[cursor]=1
[ -d "$HOME/.windsurf" ] && HAS[windsurf]=1
{ [ -d "$HOME/.gemini" ] || command -v gemini &>/dev/null; } && HAS[gemini]=1
command -v claude &>/dev/null && HAS[claude]=1

declare -A S_ON T_ON
for s in "${SKILLS[@]}"; do S_ON[$s]=1; done
for t in "${TOOLS[@]}"; do T_ON[$t]=1; done

# ─── Combined UI ───
S_NUM=${#SKILLS[@]}
T_NUM=${#TOOLS[@]}
SECTION=0  # 0=skills, 1=tools
S_CUR=0
T_CUR=0

draw_all() {
  echo -e "  ${B}Skills / Plugins${R}"
  for i in "${!SKILLS[@]}"; do
    local s="${SKILLS[$i]}" label="${S_LABEL[$i]}"
    local box="[ ]"; [ "${S_ON[$s]}" = "1" ] && box="${G}[x]${R}"
    if [ "$SECTION" -eq 0 ] && [ "$i" -eq "$S_CUR" ]; then
      echo -e "  ${C}▸${R} ${box} ${B}${s}${R} ${D}${label}${R}"
    else
      echo -e "    ${box} ${s} ${D}${label}${R}"
    fi
  done
  echo ""
  echo -e "  ${B}Tools${R}"
  for i in "${!TOOLS[@]}"; do
    local t="${TOOLS[$i]}" label="${T_LABEL[$i]}"
    local box="[ ]"; [ "${T_ON[$t]}" = "1" ] && box="${G}[x]${R}"
    local det=""; [ "$t" != "all" ] && [ "${HAS[$t]:-0}" = "1" ] && det=" ${D}✓${R}"
    if [ "$SECTION" -eq 1 ] && [ "$i" -eq "$T_CUR" ]; then
      echo -e "  ${C}▸${R} ${box} ${B}${t}${R}${det} ${D}${label}${R}"
    else
      echo -e "    ${box} ${t}${det} ${D}${label}${R}"
    fi
  done
  echo -e "  ${D}↑↓ move  Tab switch section  Space toggle  Enter confirm${R}"
}

TOTAL_LINES=$((S_NUM + T_NUM + 4))  # headers + blank + hint

echo -e "\n${B}${C}Talon Setup${R}\n"

if { [ -t 0 ] || [ -e /dev/tty ]; } 2>/dev/null; then
  draw_all
  while true; do
    IFS= read -rsn1 key < /dev/tty 2>/dev/null || break
    if [[ "$key" == $'\x1b' ]]; then
      read -rsn2 rest < /dev/tty 2>/dev/null || break
      case "$rest" in
        '[A') # Up
          if [ "$SECTION" -eq 0 ]; then
            if [ "$S_CUR" -eq 0 ]; then SECTION=1; T_CUR=$((T_NUM - 1))
            else S_CUR=$((S_CUR - 1)); fi
          else
            if [ "$T_CUR" -eq 0 ]; then SECTION=0; S_CUR=$((S_NUM - 1))
            else T_CUR=$((T_CUR - 1)); fi
          fi ;;
        '[B') # Down
          if [ "$SECTION" -eq 0 ]; then
            if [ "$S_CUR" -eq $((S_NUM - 1)) ]; then SECTION=1; T_CUR=0
            else S_CUR=$((S_CUR + 1)); fi
          else
            if [ "$T_CUR" -eq $((T_NUM - 1)) ]; then SECTION=0; S_CUR=0
            else T_CUR=$((T_CUR + 1)); fi
          fi ;;
      esac
    elif [[ "$key" == $'\t' ]]; then
      # Tab switches section
      if [ "$SECTION" -eq 0 ]; then SECTION=1; else SECTION=0; fi
    elif [[ "$key" == " " ]]; then
      if [ "$SECTION" -eq 0 ]; then
        local s="${SKILLS[$S_CUR]}"
        if [ "$s" = "all" ]; then
          local v=1; [ "${S_ON[all]}" = "1" ] && v=0
          for sk in "${SKILLS[@]}"; do S_ON[$sk]=$v; done
        else
          [ "${S_ON[$s]}" = "1" ] && S_ON[$s]=0 || S_ON[$s]=1
          local a=1; for sk in "${SKILLS[@]}"; do [ "$sk" = "all" ] && continue; [ "${S_ON[$sk]}" != "1" ] && a=0; done; S_ON[all]=$a
        fi
      else
        local t="${TOOLS[$T_CUR]}"
        if [ "$t" = "all" ]; then
          local v=1; [ "${T_ON[all]}" = "1" ] && v=0
          for tk in "${TOOLS[@]}"; do T_ON[$tk]=$v; done
        else
          [ "${T_ON[$t]}" = "1" ] && T_ON[$t]=0 || T_ON[$t]=1
          local a=1; for tk in "${TOOLS[@]}"; do [ "$tk" = "all" ] && continue; [ "${T_ON[$tk]}" != "1" ] && a=0; done; T_ON[all]=$a
        fi
      fi
    elif [[ "$key" == "" ]]; then break; fi
    printf "\033[${TOTAL_LINES}A"
    draw_all
  done
fi

# ─── Install ───

add_json_mcp() {
  local file="$1"; mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -q "talon-browser" "$file" 2>/dev/null; then ok "MCP ready"; return; fi
  python3 -c "
import json,os;f='$file'
cfg=json.load(open(f)) if os.path.exists(f) else {}
cfg.setdefault('mcpServers',{})['talon-browser']={'command':'npx','args':['-y','${MCP_PKG}']}
json.dump(cfg,open(f,'w'),indent=2)" 2>/dev/null
  ok "MCP added"
}

add_toml_mcp() {
  local file="$1"; mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -q "talon-browser" "$file" 2>/dev/null; then ok "MCP ready"; return; fi
  printf '\n[mcp_servers.talon-browser]\ncommand = "npx"\nargs = ["-y", "%s"]\n' "${MCP_PKG}" >> "$file"
  ok "MCP added"
}

declare -A SKILL_SRC=(
  [gitlab-scrum]="gitlab-scrum/gitlab-scrum" [gitlab-sprint]="gitlab-scrum/gitlab-sprint"
  [gitlab-board]="gitlab-scrum/gitlab-board" [gitlab-wiki]="gitlab-scrum/gitlab-wiki"
  [ai-dispatch]="ai-dispatch/ai-dispatch" [autoresearch]="autoresearch/autoresearch"
)

install_skills() {
  local target="$1"
  for s in "${SKILLS[@]}"; do
    [ "$s" = "all" ] && continue
    [ "${S_ON[$s]}" != "1" ] && continue
    local src="${SKILL_SRC[$s]}" plugin="${SKILL_SRC[$s]%%/*}"
    local dir="$target/$s" file="$dir/SKILL.md"
    [ -f "$file" ] && { ok "$s"; continue; }
    mkdir -p "$dir"
    curl -fsSL "${REPO_RAW}/plugins/${plugin}/skills/${s}/SKILL.md" -o "$file" 2>/dev/null || \
    curl -fsSL "${REPO_RAW}/plugins/${plugin}/skills/${s}/skill.md" -o "$file" 2>/dev/null && \
      ok "$s" || { skip "$s"; rm -rf "$dir"; }
  done
}

echo ""

for t in "${TOOLS[@]}"; do
  [ "$t" = "all" ] && continue
  [ "${T_ON[$t]}" != "1" ] && continue
  echo -e "\n${B}${C}${t}${R}"
  case "$t" in
    codex)    add_toml_mcp "$HOME/.codex/config.toml"; install_skills "$HOME/.agents/skills" ;;
    cursor)   add_json_mcp "$HOME/.cursor/mcp.json"; install_skills "$HOME/.agents/skills" ;;
    windsurf) add_json_mcp "$HOME/.windsurf/mcp.json"; install_skills "$HOME/.agents/skills" ;;
    gemini)   add_json_mcp "$HOME/.gemini/settings.json"; install_skills "$HOME/.agents/skills" ;;
    claude)
      if command -v claude &>/dev/null; then
        claude plugin marketplace list 2>/dev/null | grep -q "gettalon-talon-plugins" && ok "Marketplace ready" || \
          { claude plugin marketplace add gettalon/talon-plugins 2>/dev/null && ok "Marketplace added"; }
        NAMES=$(curl -fsSL "${REPO_RAW}/.claude-plugin/marketplace.json" 2>/dev/null | \
          python3 -c "import sys,json;[print(p['name']) for p in json.load(sys.stdin).get('plugins',[])]" 2>/dev/null)
        [ -z "$NAMES" ] && NAMES="web computer-use ai-dispatch autoresearch gitlab-scrum"
        for p in $NAMES; do
          claude plugin list 2>/dev/null | grep -q "${p}@gettalon-talon-plugins" && ok "$p" || \
            { claude plugin install "${p}@gettalon-talon-plugins" 2>/dev/null && ok "$p" || info "$p — /plugin install ${p}@gettalon-talon-plugins"; }
        done
        info "/reload-plugins to activate"
      else skip "claude not found"; fi ;;
  esac
done

echo -e "\n${B}${C}Done!${R}"
ok "MCP + Skills configured"
echo ""
