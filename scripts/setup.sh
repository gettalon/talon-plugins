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

# ─── Checkbox UI ───
# Args: title, array-name of "key|label" items, assoc-array-name of checked state
run_checkbox() {
  local title="$1"; shift
  local -n _items=$1; shift
  local -n _checked=$1
  local num=${#_items[@]} cursor=0

  _draw() {
    for i in "${!_items[@]}"; do
      local key="${_items[$i]%%|*}" label="${_items[$i]#*|}"
      local box="[ ]"; [ "${_checked[$key]}" = "1" ] && box="${G}[x]${R}"
      if [ "$i" -eq "$cursor" ]; then
        echo -e "  ${C}▸${R} ${box} ${B}${key}${R} ${D}${label}${R}"
      else
        echo -e "    ${box} ${key} ${D}${label}${R}"
      fi
    done
    echo -e "  ${D}↑↓ move  Space toggle  Enter confirm${R}"
  }

  echo -e "\n${B}${C}${title}${R}"
  _draw
  local lines=$((num + 1))

  if { [ -t 0 ] || [ -e /dev/tty ]; } 2>/dev/null; then
    while true; do
      IFS= read -rsn1 key < /dev/tty 2>/dev/null || break
      if [[ "$key" == $'\x1b' ]]; then
        read -rsn2 rest < /dev/tty 2>/dev/null || break
        case "$rest" in
          '[A') cursor=$(( (cursor - 1 + num) % num )) ;;
          '[B') cursor=$(( (cursor + 1) % num )) ;;
        esac
      elif [[ "$key" == " " ]]; then
        local k="${_items[$cursor]%%|*}"
        [ "${_checked[$k]}" = "1" ] && _checked[$k]=0 || _checked[$k]=1
      elif [[ "$key" == "" ]]; then break; fi
      printf "\033[${lines}A"
      _draw
    done
  fi
}

# ─── Detect tools ───
declare -A HAS
{ [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; } && HAS[codex]=1
[ -d "$HOME/.cursor" ] && HAS[cursor]=1
[ -d "$HOME/.windsurf" ] && HAS[windsurf]=1
{ [ -d "$HOME/.gemini" ] || command -v gemini &>/dev/null; } && HAS[gemini]=1
command -v claude &>/dev/null && HAS[claude]=1

echo -e "\n${B}${C}Talon Setup${R}\n"

# ─── Step 1: Select Skills/Plugins ───
SKILL_ITEMS=(
  "gitlab-scrum|GitLab issues, labels, milestones"
  "gitlab-sprint|Sprint planning and lifecycle"
  "gitlab-board|Kanban board management"
  "gitlab-wiki|Wiki pages with Mermaid diagrams"
  "ai-dispatch|Multi-backend AI routing (7 backends)"
  "autoresearch|Autonomous edit-test-measure loop"
)
declare -A S_ON
S_ON[all]=1
for e in "${SKILL_ITEMS[@]}"; do S_ON[${e%%|*}]=1; done

# Add "all" toggle at top
SKILL_MENU=("all|Toggle all skills" "${SKILL_ITEMS[@]}")
declare -A S_CHECK
S_CHECK[all]=1
for e in "${SKILL_ITEMS[@]}"; do S_CHECK[${e%%|*}]=1; done

run_checkbox "Skills / Plugins" SKILL_MENU S_CHECK

# Sync "all" toggle
if [ "${S_CHECK[all]}" = "1" ]; then
  for e in "${SKILL_ITEMS[@]}"; do S_CHECK[${e%%|*}]=1; done
fi

# ─── Step 2: Select Tools ───
TOOL_ITEMS=()
for t in codex cursor windsurf gemini claude; do
  local_label=""
  [ "${HAS[$t]:-0}" = "1" ] && local_label="(detected)"
  TOOL_ITEMS+=("$t|$local_label")
done

declare -A T_CHECK
T_CHECK[all]=1
for t in codex cursor windsurf gemini claude; do
  T_CHECK[$t]=${HAS[$t]:-0}
done
# Check if all detected
all_det=1; for t in codex cursor windsurf gemini claude; do [ "${T_CHECK[$t]}" != "1" ] && all_det=0; done
T_CHECK[all]=$all_det

TOOL_MENU=("all|Toggle all tools" "${TOOL_ITEMS[@]}")

run_checkbox "Tools" TOOL_MENU T_CHECK

# Sync "all" toggle
if [ "${T_CHECK[all]}" = "1" ]; then
  for t in codex cursor windsurf gemini claude; do T_CHECK[$t]=1; done
fi

# ─── MCP helpers ───
add_json_mcp() {
  local file="$1"; mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -q "talon-browser" "$file" 2>/dev/null; then ok "MCP already configured"; return; fi
  python3 -c "
import json,os;f='$file'
cfg=json.load(open(f)) if os.path.exists(f) else {}
cfg.setdefault('mcpServers',{})['talon-browser']={'command':'npx','args':['-y','${MCP_PKG}']}
json.dump(cfg,open(f,'w'),indent=2)" 2>/dev/null
  ok "MCP added"
}

add_toml_mcp() {
  local file="$1"; mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -q "talon-browser" "$file" 2>/dev/null; then ok "MCP already configured"; return; fi
  printf '\n[mcp_servers.talon-browser]\ncommand = "npx"\nargs = ["-y", "%s"]\n' "${MCP_PKG}" >> "$file"
  ok "MCP added"
}

# ─── Skill installer ───
declare -A SKILL_SRC=(
  [gitlab-scrum]="gitlab-scrum/gitlab-scrum" [gitlab-sprint]="gitlab-scrum/gitlab-sprint"
  [gitlab-board]="gitlab-scrum/gitlab-board" [gitlab-wiki]="gitlab-scrum/gitlab-wiki"
  [ai-dispatch]="ai-dispatch/ai-dispatch" [autoresearch]="autoresearch/autoresearch"
)

install_skill() {
  local skill="$1" target="$2"
  [ "${S_CHECK[$skill]:-0}" != "1" ] && return
  local src="${SKILL_SRC[$skill]}" plugin="${SKILL_SRC[$skill]%%/*}"
  local dir="$target/$skill" file="$dir/SKILL.md"
  [ -f "$file" ] && { ok "$skill"; return; }
  mkdir -p "$dir"
  curl -fsSL "${REPO_RAW}/plugins/${plugin}/skills/${skill}/SKILL.md" -o "$file" 2>/dev/null || \
  curl -fsSL "${REPO_RAW}/plugins/${plugin}/skills/${skill}/skill.md" -o "$file" 2>/dev/null && \
    ok "$skill" || { skip "$skill"; rm -rf "$dir"; }
}

install_skills_to() {
  local target="$1"
  for e in "${SKILL_ITEMS[@]}"; do install_skill "${e%%|*}" "$target"; done
}

# ─── Install per tool ───
echo ""

if [ "${T_CHECK[codex]}" = "1" ]; then
  echo -e "\n${B}${C}Codex${R}"
  add_toml_mcp "$HOME/.codex/config.toml"
  install_skills_to "$HOME/.agents/skills"
fi

if [ "${T_CHECK[cursor]}" = "1" ]; then
  echo -e "\n${B}${C}Cursor${R}"
  add_json_mcp "$HOME/.cursor/mcp.json"
  install_skills_to "$HOME/.agents/skills"
fi

if [ "${T_CHECK[windsurf]}" = "1" ]; then
  echo -e "\n${B}${C}Windsurf${R}"
  add_json_mcp "$HOME/.windsurf/mcp.json"
  install_skills_to "$HOME/.agents/skills"
fi

if [ "${T_CHECK[gemini]}" = "1" ]; then
  echo -e "\n${B}${C}Gemini CLI${R}"
  add_json_mcp "$HOME/.gemini/settings.json"
  install_skills_to "$HOME/.agents/skills"
fi

if [ "${T_CHECK[claude]}" = "1" ]; then
  echo -e "\n${B}${C}Claude Code${R}"
  if command -v claude &>/dev/null; then
    claude plugin marketplace list 2>/dev/null | grep -q "gettalon-talon-plugins" && ok "Marketplace ready" || \
      { claude plugin marketplace add gettalon/talon-plugins 2>/dev/null && ok "Marketplace added"; }
    NAMES=$(curl -fsSL "${REPO_RAW}/.claude-plugin/marketplace.json" 2>/dev/null | \
      python3 -c "import sys,json;[print(p['name']) for p in json.load(sys.stdin).get('plugins',[])]" 2>/dev/null)
    [ -z "$NAMES" ] && NAMES="web computer-use ai-dispatch autoresearch gitlab-scrum"
    for p in $NAMES; do
      claude plugin list 2>/dev/null | grep -q "${p}@gettalon-talon-plugins" && ok "$p" || \
        { claude plugin install "${p}@gettalon-talon-plugins" 2>/dev/null && ok "$p installed" || info "$p — /plugin install ${p}@gettalon-talon-plugins"; }
    done
    info "Run /reload-plugins to activate"
  else
    skip "claude CLI not found"
  fi
fi

echo -e "\n${B}${C}Done!${R}"
ok "MCP + Skills configured"
echo ""
