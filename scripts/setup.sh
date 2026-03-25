#!/usr/bin/env bash
# Talon Plugins — cross-tool setup (MCP + Skills)
# Usage: curl -fsSL https://raw.githubusercontent.com/gettalon/talon-plugins/master/scripts/setup.sh | bash
# Or:    bash setup.sh [all|codex|cursor|windsurf|gemini|claude]
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/gettalon/talon-plugins/master"
REPO_GIT="https://github.com/gettalon/talon-plugins.git"
MCP_PKG="@gettalon/mcp@2"

G='\033[32m' Y='\033[33m' C='\033[36m' D='\033[2m' B='\033[1m' R='\033[0m' RED='\033[31m'
ok()   { echo -e "  ${G}✓${R} $1"; }
skip() { echo -e "  ${D}– $1${R}"; }
info() { echo -e "  ${D}$1${R}"; }
head() { echo -e "\n${B}${C}$1${R}"; }

# ─── MCP helpers ───

add_json_mcp() {
  local file="$1" key="$2" cmd="$3"; shift 3; local args_json="$*"
  mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -q "\"$key\"" "$file" 2>/dev/null; then
    ok "$key already in $(basename "$file")"
    return
  fi
  python3 -c "
import json, os
f = '$file'
cfg = json.load(open(f)) if os.path.exists(f) else {}
cfg.setdefault('mcpServers', {})['$key'] = {'command': '$cmd', 'args': $args_json}
json.dump(cfg, open(f, 'w'), indent=2)
" 2>/dev/null
  ok "Added $key to $(basename "$file")"
}

add_toml_mcp() {
  local file="$1" key="$2" cmd="$3" args="$4"
  mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -q "$key" "$file" 2>/dev/null; then
    ok "$key already in $(basename "$file")"
    return
  fi
  printf '\n[mcp_servers.%s]\ncommand = "%s"\nargs = %s\n' "$key" "$cmd" "$args" >> "$file"
  ok "Added $key to $(basename "$file")"
}

# ─── Skills helper — download skills to a target directory ───

# ─── Reusable checkbox UI ───
# Usage: checkbox_select "Title" RESULT_ARRAY ITEMS_ARRAY CHECKED_ARRAY
# ITEMS: array of "key|label" pairs
# CHECKED: associative array of key=1/0 (modified in place)
# RESULT: not used — reads CHECKED directly after return

run_checkbox() {
  local title="$1"; shift
  local -n _items=$1; shift
  local -n _checked=$1

  local num=${#_items[@]}
  local cursor=0

  _draw() {
    for i in "${!_items[@]}"; do
      local entry="${_items[$i]}"
      local key="${entry%%|*}"
      local label="${entry#*|}"
      local box="[ ]"
      [ "${_checked[$key]}" = "1" ] && box="${G}[x]${R}"
      if [ "$i" -eq "$cursor" ]; then
        echo -e "    ${C}▸${R} ${box} ${B}${key}${R} ${D}${label}${R}"
      else
        echo -e "      ${box} ${key} ${D}${label}${R}"
      fi
    done
    echo -e "    ${D}↑↓ move  Space toggle  Enter confirm${R}"
  }

  if { [ -t 0 ] || [ -e /dev/tty ]; } 2>/dev/null; then
    echo -e "  ${B}${title}${R}"
    _draw
    local lines=$((num + 1))
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
      elif [[ "$key" == "" ]]; then
        break
      fi
      printf "\033[${lines}A"
      _draw
    done
  fi
}

# ─── Skill installer ───

# All available skills
ALL_SKILLS=(
  "gitlab-scrum|GitLab issues, labels, milestones"
  "gitlab-sprint|Sprint planning and lifecycle"
  "gitlab-board|Kanban board management"
  "gitlab-wiki|Wiki pages with Mermaid diagrams"
  "ai-dispatch|Multi-backend AI routing (7 backends)"
  "ai-dispatch-setup|AI dispatch configuration"
  "autoresearch|Autonomous edit-test-measure loop"
)

# Map skill name → plugin/skill path for download
declare -A SKILL_SOURCE=(
  [gitlab-scrum]="gitlab-scrum/gitlab-scrum"
  [gitlab-sprint]="gitlab-scrum/gitlab-sprint"
  [gitlab-board]="gitlab-scrum/gitlab-board"
  [gitlab-wiki]="gitlab-scrum/gitlab-wiki"
  [ai-dispatch]="ai-dispatch/ai-dispatch"
  [ai-dispatch-setup]="ai-dispatch/ai-dispatch-setup"
  [autoresearch]="autoresearch/autoresearch"
)

# Selected skills (default: all checked)
declare -A SKILL_CHECKED
for entry in "${ALL_SKILLS[@]}"; do
  SKILL_CHECKED[${entry%%|*}]=1
done
SKILLS_SELECTED=false

select_skills() {
  if [ "$SKILLS_SELECTED" = "true" ]; then return; fi
  SKILLS_SELECTED=true
  echo ""
  run_checkbox "Select skills to install:" ALL_SKILLS SKILL_CHECKED
}

install_skills() {
  local target="$1"
  mkdir -p "$target"

  for entry in "${ALL_SKILLS[@]}"; do
    local skill="${entry%%|*}"
    [ "${SKILL_CHECKED[$skill]}" != "1" ] && continue

    local source="${SKILL_SOURCE[$skill]}"
    local plugin="${source%%/*}"
    local skill_dir="$target/$skill"
    local skill_file="$skill_dir/SKILL.md"

    if [ -f "$skill_file" ]; then
      ok "$skill already installed"
      continue
    fi

    mkdir -p "$skill_dir"
    local url="${REPO_RAW}/plugins/${plugin}/skills/${skill}/SKILL.md"
    local url_lower="${REPO_RAW}/plugins/${plugin}/skills/${skill}/skill.md"
    if curl -fsSL "$url" -o "$skill_file" 2>/dev/null || curl -fsSL "$url_lower" -o "$skill_file" 2>/dev/null; then
      ok "$skill installed"
    else
      skip "$skill download failed"
      rm -rf "$skill_dir" 2>/dev/null
    fi
  done
}

# ─── Per-tool setup ───

setup_codex() {
  head "Codex"
  add_toml_mcp "$HOME/.codex/config.toml" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
  select_skills
  install_skills "$HOME/.agents/skills"
}

setup_cursor() {
  head "Cursor"
  add_json_mcp "$HOME/.cursor/mcp.json" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
  select_skills
  install_skills "$HOME/.agents/skills"
}

setup_windsurf() {
  head "Windsurf"
  add_json_mcp "$HOME/.windsurf/mcp.json" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
  select_skills
  install_skills "$HOME/.agents/skills"
}

setup_gemini() {
  head "Gemini CLI"
  add_json_mcp "$HOME/.gemini/settings.json" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
  select_skills
  # Gemini uses custom commands (TOML), not .agents/skills
  local cmd_dir="$HOME/.gemini/commands"
  mkdir -p "$cmd_dir"
  for entry in "${ALL_SKILLS[@]}"; do
    local skill="${entry%%|*}"
    local desc="${entry#*|}"
    [ "${SKILL_CHECKED[$skill]}" != "1" ] && continue
    local cmd_file="$cmd_dir/${skill}.toml"
    if [ -f "$cmd_file" ]; then
      ok "$skill command already exists"
      continue
    fi
    local source="${SKILL_SOURCE[$skill]}"
    local plugin="${source%%/*}"
    local url="${REPO_RAW}/plugins/${plugin}/skills/${skill}/SKILL.md"
    local url_lower="${REPO_RAW}/plugins/${plugin}/skills/${skill}/skill.md"
    local content
    content=$(curl -fsSL "$url" 2>/dev/null || curl -fsSL "$url_lower" 2>/dev/null) || continue
    # Strip frontmatter
    content=$(echo "$content" | sed '1{/^---$/d}' | sed '/^---$/,$!d; /^---$/d')
    cat > "$cmd_file" <<TOML
description = "Talon: ${skill} — ${desc}"
prompt = """
${content}

User request: {{args}}
"""
TOML
    ok "$skill command installed"
  done
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

  # Fetch plugin list
  PLUGIN_NAMES=$(curl -fsSL "${REPO_RAW}/.claude-plugin/marketplace.json" 2>/dev/null | \
    python3 -c "import sys,json; [print(p['name']) for p in json.load(sys.stdin).get('plugins',[])]" 2>/dev/null)
  [ -z "$PLUGIN_NAMES" ] && PLUGIN_NAMES="web computer-use ai-dispatch autoresearch gitlab-scrum"

  # Install plugins
  for plugin in $PLUGIN_NAMES; do
    if claude plugin list 2>/dev/null | grep -q "${plugin}@gettalon-talon-plugins"; then
      ok "$plugin already installed"
    else
      claude plugin install "${plugin}@gettalon-talon-plugins" 2>/dev/null && ok "$plugin installed" || info "$plugin — run: /plugin install ${plugin}@gettalon-talon-plugins"
    fi
  done
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
echo -e "${D}MCP: ${MCP_PKG} | Skills: .agents/skills/ standard${R}"

head "Detected Tools"
ALL_TOOLS=(codex cursor windsurf gemini claude)
detected_list=()
for tool in "${ALL_TOOLS[@]}"; do
  if [ "${DETECTED[$tool]:-}" = "1" ]; then
    ok "$tool"
    detected_list+=("$tool")
  else
    skip "$tool"
  fi
done

echo ""
echo -e "${D}Each tool gets:${R}"
info "  MCP:    talon-browser (Chrome DevTools, 15 tools)"
info "  Skills: gitlab-scrum, ai-dispatch, autoresearch"
info "  Claude Code also gets: computer-use + plugin marketplace"

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
    *) echo -e "${RED}Unknown: $TARGET${R}"; exit 1 ;;
  esac
elif [ ${#detected_list[@]} -eq 0 ]; then
  echo -e "\n${Y}No tools detected. Setting up all.${R}"
  for t in "${ALL_TOOLS[@]}"; do "setup_$t"; done
else
  # Checkbox select
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
    echo -e "\n${B}Select tools:${R}"
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
ok "MCP + Skills configured"
echo -e "${D}  Config locations:${R}"
info "  Codex:    ~/.codex/config.toml + ~/.agents/skills/"
info "  Cursor:   ~/.cursor/mcp.json + ~/.agents/skills/"
info "  Windsurf: ~/.windsurf/mcp.json + ~/.agents/skills/"
info "  Gemini:   ~/.gemini/settings.json + ~/.gemini/commands/"
info "  Claude:   ~/.claude/plugins/ (full plugin system)"
echo ""
