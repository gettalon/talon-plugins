#!/usr/bin/env bash
# manage-workflow.sh — CRUD operations for YAML workflow state machines
#
# Usage:
#   manage-workflow.sh create <name> [--agent <agent-name>]   Create from template
#   manage-workflow.sh list   [--agent <agent-name>]          List all workflows
#   manage-workflow.sh get    <name> [--agent <agent-name>]   Show workflow details
#   manage-workflow.sh update <name> [--agent <agent-name>]   Re-validate after edits
#   manage-workflow.sh delete <name> [--agent <agent-name>]   Delete a workflow
#   manage-workflow.sh validate <file> [file2 ...]            Validate workflow files
#   manage-workflow.sh diagram <name> [--agent <agent-name>]  Show state diagram

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# --- Helpers ---

die() { echo -e "${RED}Error${NC}: $1" >&2; exit 1; }
info() { echo -e "${BLUE}>>>${NC} $1"; }
ok() { echo -e "${GREEN}OK${NC}: $1"; }
warn() { echo -e "${YELLOW}WARN${NC}: $1"; }

# Resolve workflow directory
resolve_dir() {
  local agent="${1:-}"
  if [[ -n "$agent" ]]; then
    echo "agents/$agent/workflows"
  else
    echo "workflows"
  fi
}

# Find workflow file by name
find_workflow() {
  local name="$1" agent="${2:-}"
  local dir
  dir="$(resolve_dir "$agent")"
  local file="$dir/$name.yaml"
  [[ -f "$file" ]] || file="$dir/$name.yml"
  [[ -f "$file" ]] && echo "$file" || return 1
}

# Check python3 + pyyaml
check_deps() {
  command -v python3 &>/dev/null || die "python3 required"
  python3 -c "import yaml" 2>/dev/null || die "pyyaml required: pip3 install pyyaml"
}

# --- Validate (core engine, used by all commands) ---

validate_file() {
  local file="$1"
  [[ -f "$file" ]] || { echo "ERROR: File not found: $file"; return 1; }

  python3 - "$file" <<'PYEOF'
import sys, yaml

file = sys.argv[1]
with open(file) as f:
    try:
        doc = yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f"ERROR: Invalid YAML: {e}")
        sys.exit(1)

if not isinstance(doc, dict):
    print("ERROR: Document root must be a mapping")
    sys.exit(1)

errors, warnings = [], []

for field in ['name', 'description', 'initial_state', 'states']:
    if field not in doc:
        errors.append(f"Missing required field: {field}")

if errors:
    for e in errors: print(f"ERROR: {e}")
    sys.exit(1)

name = doc['name']
initial = doc['initial_state']
states = doc.get('states', {})

if not isinstance(states, dict):
    print("ERROR: states must be a mapping")
    sys.exit(1)

if len(states) == 0:
    errors.append("States map is empty")

if initial not in states:
    errors.append(f'Initial state "{initial}" not in states: {list(states.keys())}')

all_names = set(states.keys())
valid_modes = {'plan', 'ask', 'allow', 'bypass'}

for key, state in states.items():
    if not isinstance(state, dict):
        errors.append(f'State "{key}" must be a mapping')
        continue
    sn = state.get('name', key)
    if sn != key:
        errors.append(f'State key "{key}" != state.name "{sn}"')
    mode = state.get('permission_mode')
    if mode and mode not in valid_modes:
        errors.append(f'State "{key}": invalid permission_mode "{mode}"')
    for i, t in enumerate(state.get('transitions', [])):
        if not isinstance(t, dict):
            errors.append(f'State "{key}": transition {i} must be a mapping')
            continue
        target = t.get('to')
        if not target:
            errors.append(f'State "{key}": transition {i} missing "to"')
        elif target not in all_names:
            errors.append(f'State "{key}": transition to unknown state "{target}"')

# Orphan detection
if initial in states:
    reachable, queue = set(), [initial]
    while queue:
        c = queue.pop(0)
        if c in reachable: continue
        reachable.add(c)
        for t in states.get(c, {}).get('transitions', []):
            tgt = t.get('to')
            if tgt and tgt not in reachable: queue.append(tgt)
    for o in all_names - reachable:
        warnings.append(f'Unreachable state: "{o}"')

if not any(len(s.get('transitions', [])) == 0 for s in states.values() if isinstance(s, dict)):
    warnings.append("No terminal state (empty transitions)")

for e in errors: print(f"ERROR: {e}")
for w in warnings: print(f"WARN: {w}")

if not errors:
    sc = len(states)
    tc = sum(len(s.get('transitions', [])) for s in states.values() if isinstance(s, dict))
    print(f"VALID: {name}|{sc} states|{tc} transitions")

sys.exit(1 if errors else 0)
PYEOF
}

# --- CREATE ---

cmd_create() {
  local name="${1:-}" agent="${2:-}"
  [[ -n "$name" ]] || die "Usage: manage-workflow.sh create <name> [--agent <agent-name>]"

  local dir
  dir="$(resolve_dir "$agent")"
  mkdir -p "$dir"

  local file="$dir/$name.yaml"
  [[ ! -f "$file" ]] || die "Workflow already exists: $file"

  local template="$PLUGIN_DIR/templates/workflow.yaml.template"
  if [[ -f "$template" ]]; then
    sed \
      -e "s/{{WORKFLOW_NAME}}/$name/g" \
      -e "s/{{WORKFLOW_DESCRIPTION}}/TODO: describe this workflow/g" \
      -e "s/{{INITIAL_STATE}}/planning/g" \
      -e "s/{{INITIAL_STATE_INSTRUCTIONS}}/Explore and plan the approach/g" \
      -e "s/{{NEXT_STATE}}/implementation/g" \
      -e "s/{{CONDITION}}/plan_approved/g" \
      "$template" > "$file"
  else
    cat > "$file" <<EOF
name: $name
description: TODO
initial_state: planning

states:
  planning:
    name: planning
    permission_mode: plan
    on_entry: "Explore and plan"
    transitions:
      - to: implementation

  implementation:
    name: implementation
    permission_mode: allow
    on_entry: "Execute the plan"
    transitions:
      - to: done

  done:
    name: done
    on_entry: "Complete"
    transitions: []
EOF
  fi

  ok "Created $file"
  info "Edit the file, then run: manage-workflow.sh validate $file"
}

# --- LIST ---

cmd_list() {
  local agent="${1:-}"
  local found=0

  list_dir() {
    local dir="$1" label="$2"
    [[ -d "$dir" ]] || return
    for f in "$dir"/*.yaml "$dir"/*.yml; do
      [[ -f "$f" ]] || continue
      found=1
      local result
      result="$(validate_file "$f" 2>&1)" || true
      local basename
      basename="$(basename "$f" .yaml)"
      basename="${basename%.yml}"

      if echo "$result" | grep -q "^VALID:"; then
        local details
        details="$(echo "$result" | grep "^VALID:" | cut -d'|' -f2-3 | tr '|' ', ')"
        echo -e "  ${GREEN}$basename${NC} ($label) — $details"
      else
        echo -e "  ${RED}$basename${NC} ($label) — invalid"
      fi
    done
  }

  echo -e "${BOLD}Workflows:${NC}"
  echo ""

  if [[ -n "$agent" ]]; then
    list_dir "agents/$agent/workflows" "$agent"
  else
    # List standalone
    list_dir "workflows" "standalone"
    # List per-agent
    for agent_dir in agents/*/workflows; do
      [[ -d "$agent_dir" ]] || continue
      local aname
      aname="$(basename "$(dirname "$agent_dir")")"
      list_dir "$agent_dir" "$aname"
    done
  fi

  if [[ $found -eq 0 ]]; then
    echo "  (none found)"
    echo ""
    echo "Create one: manage-workflow.sh create <name>"
  fi
  echo ""
}

# --- GET ---

cmd_get() {
  local name="${1:-}" agent="${2:-}"
  [[ -n "$name" ]] || die "Usage: manage-workflow.sh get <name> [--agent <agent-name>]"

  local file
  file="$(find_workflow "$name" "$agent")" || die "Workflow not found: $name"

  echo -e "${BOLD}=== $name ===${NC}"
  echo -e "${BLUE}File${NC}: $file"
  echo ""
  cat "$file"
  echo ""

  # Validate
  echo -e "${BOLD}--- Validation ---${NC}"
  validate_file "$file" 2>&1 | while IFS= read -r line; do
    case "$line" in
      ERROR:*) echo -e "  ${RED}$line${NC}" ;;
      WARN:*)  echo -e "  ${YELLOW}$line${NC}" ;;
      VALID:*) echo -e "  ${GREEN}Valid${NC}: $(echo "$line" | cut -d'|' -f2-3 | tr '|' ', ')" ;;
      *)       echo "  $line" ;;
    esac
  done
}

# --- UPDATE (re-validate) ---

cmd_update() {
  local name="${1:-}" agent="${2:-}"
  [[ -n "$name" ]] || die "Usage: manage-workflow.sh update <name> [--agent <agent-name>]"

  local file
  file="$(find_workflow "$name" "$agent")" || die "Workflow not found: $name"

  info "Validating $file..."
  local result
  result="$(validate_file "$file" 2>&1)" || true

  echo "$result" | while IFS= read -r line; do
    case "$line" in
      ERROR:*) echo -e "  ${RED}$line${NC}" ;;
      WARN:*)  echo -e "  ${YELLOW}$line${NC}" ;;
      VALID:*) ok "$(echo "$line" | cut -d'|' -f2-3 | tr '|' ', ')" ;;
      *)       echo "  $line" ;;
    esac
  done

  if echo "$result" | grep -q "^ERROR:"; then
    die "Fix errors above, then re-run update"
  fi
}

# --- DELETE ---

cmd_delete() {
  local name="${1:-}" agent="${2:-}"
  [[ -n "$name" ]] || die "Usage: manage-workflow.sh delete <name> [--agent <agent-name>]"

  local file
  file="$(find_workflow "$name" "$agent")" || die "Workflow not found: $name"

  echo -e "Delete ${RED}$file${NC}?"
  read -rp "Confirm (y/N): " confirm
  if [[ "$confirm" =~ ^[Yy] ]]; then
    rm "$file"
    ok "Deleted $file"
  else
    info "Cancelled"
  fi
}

# --- VALIDATE ---

cmd_validate() {
  local files=("$@")
  [[ ${#files[@]} -gt 0 ]] || die "Usage: manage-workflow.sh validate <file> [file2 ...]"

  local total_errors=0

  for file in "${files[@]}"; do
    echo ""
    echo -e "${BOLD}=== Validating: $file ===${NC}"
    local result
    result="$(validate_file "$file" 2>&1)" || true

    echo "$result" | while IFS= read -r line; do
      case "$line" in
        ERROR:*) echo -e "  ${RED}$line${NC}" ;;
        WARN:*)  echo -e "  ${YELLOW}$line${NC}" ;;
        VALID:*) ok "$(echo "$line" | cut -d'|' -f2-3 | tr '|' ', ')" ;;
        *)       echo "  $line" ;;
      esac
    done

    if echo "$result" | grep -q "^ERROR:"; then
      ((total_errors++))
    fi
  done

  echo ""
  if [[ $total_errors -gt 0 ]]; then
    echo -e "${RED}$total_errors file(s) failed validation${NC}"
    exit 1
  else
    echo -e "${GREEN}All workflows valid${NC}"
  fi
}

# --- DIAGRAM ---

cmd_diagram() {
  local name="${1:-}" agent="${2:-}"
  [[ -n "$name" ]] || die "Usage: manage-workflow.sh diagram <name> [--agent <agent-name>]"

  local file
  file="$(find_workflow "$name" "$agent")" || die "Workflow not found: $name"

  python3 - "$file" <<'PYEOF'
import sys, yaml

with open(sys.argv[1]) as f:
    doc = yaml.safe_load(f)

states = doc.get('states', {})
initial = doc.get('initial_state', '')

print(f"\n  Workflow: {doc.get('name', '?')}")
print(f"  {doc.get('description', '')}\n")

# Build adjacency
for key, state in states.items():
    if not isinstance(state, dict): continue
    marker = " *" if key == initial else ""
    mode = state.get('permission_mode', '')
    mode_str = f" ({mode})" if mode else ""
    tools = state.get('allowed_tools')
    tools_str = ""
    if tools is not None:
        tools_str = f" [{len(tools)} tools]" if tools else " [no tools]"
    elif tools is None:
        tools_str = " [all tools]"

    print(f"  [{key}]{marker}{mode_str}{tools_str}")

    transitions = state.get('transitions', [])
    for i, t in enumerate(transitions):
        target = t.get('to', '?')
        cond = t.get('condition', '')
        is_last = i == len(transitions) - 1
        branch = "└──" if is_last else "├──"
        cond_str = f" ({cond})" if cond else ""
        print(f"    {branch}> {target}{cond_str}")

    if not transitions:
        print(f"    └── (terminal)")
    print()

print(f"  * = initial state")
PYEOF
}

# --- Main ---

check_deps

command="${1:-help}"
shift || true

# Parse --agent flag
agent=""
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) agent="${2:-}"; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done

case "$command" in
  create)   cmd_create "${args[0]:-}" "$agent" ;;
  list|ls)  cmd_list "$agent" ;;
  get|show) cmd_get "${args[0]:-}" "$agent" ;;
  update)   cmd_update "${args[0]:-}" "$agent" ;;
  delete|rm)cmd_delete "${args[0]:-}" "$agent" ;;
  validate) cmd_validate "${args[@]}" ;;
  diagram)  cmd_diagram "${args[0]:-}" "$agent" ;;
  help|--help|-h)
    echo "Usage: manage-workflow.sh <command> [args] [--agent <name>]"
    echo ""
    echo "Commands:"
    echo "  create   <name>           Create workflow from template"
    echo "  list                      List all workflows"
    echo "  get      <name>           Show workflow details + validation"
    echo "  update   <name>           Re-validate after edits"
    echo "  delete   <name>           Delete a workflow"
    echo "  validate <file> [...]     Validate workflow file(s)"
    echo "  diagram  <name>           Show state diagram"
    echo ""
    echo "Options:"
    echo "  --agent <name>            Scope to agent (agents/<name>/workflows/)"
    ;;
  *) die "Unknown command: $command. Run with --help" ;;
esac
