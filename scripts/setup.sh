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

install_skills() {
  local target="$1" tool_name="$2"
  mkdir -p "$target"

  # plugin/skill pairs — format: "plugin-name/skill-name"
  local SKILL_DIRS=(
    "gitlab-scrum/gitlab-scrum"
    "gitlab-scrum/gitlab-sprint"
    "gitlab-scrum/gitlab-board"
    "gitlab-scrum/gitlab-wiki"
    "ai-dispatch/ai-dispatch"
    "ai-dispatch/ai-dispatch-setup"
    "autoresearch/autoresearch"
  )

  for skill_path in "${SKILL_DIRS[@]}"; do
    local plugin="${skill_path%%/*}"
    local skill="${skill_path#*/}"
    local skill_dir="$target/$skill"
    local skill_file="$skill_dir/SKILL.md"

    if [ -f "$skill_file" ]; then
      ok "$skill already installed"
      continue
    fi

    mkdir -p "$skill_dir"
    # Download SKILL.md (try uppercase first, then lowercase)
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
  # MCP
  add_toml_mcp "$HOME/.codex/config.toml" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
  # Skills — Codex reads ~/.agents/skills/ and .agents/skills/
  info "Installing skills to ~/.agents/skills/"
  install_skills "$HOME/.agents/skills" "codex"
}

setup_cursor() {
  head "Cursor"
  # MCP
  add_json_mcp "$HOME/.cursor/mcp.json" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
  # Skills — Cursor reads ~/.agents/skills/ (shared) and ~/.cursor/skills/
  info "Installing skills to ~/.agents/skills/"
  install_skills "$HOME/.agents/skills" "cursor"
}

setup_windsurf() {
  head "Windsurf"
  # MCP
  add_json_mcp "$HOME/.windsurf/mcp.json" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
  # Skills — Windsurf reads ~/.agents/skills/ and ~/.windsurf/skills/
  info "Installing skills to ~/.agents/skills/"
  install_skills "$HOME/.agents/skills" "windsurf"
}

setup_gemini() {
  head "Gemini CLI"
  # MCP
  add_json_mcp "$HOME/.gemini/settings.json" "talon-browser" "npx" '["-y", "'"${MCP_PKG}"'"]'
  # Gemini uses extensions or commands, not .agents/skills
  # Install as custom commands
  local cmd_dir="$HOME/.gemini/commands"
  mkdir -p "$cmd_dir"
  for skill in gitlab-scrum gitlab-sprint gitlab-board gitlab-wiki; do
    local cmd_file="$cmd_dir/${skill}.toml"
    if [ -f "$cmd_file" ]; then
      ok "$skill command already exists"
      continue
    fi
    local url="${REPO_RAW}/plugins/gitlab-scrum/skills/${skill}/skill.md"
    local content
    content=$(curl -fsSL "$url" 2>/dev/null | sed '1,/^---$/d; /^---$/,$!d; /^---$/d') || continue
    cat > "$cmd_file" <<TOML
description = "Talon: ${skill} — GitLab Scrum skill"
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
