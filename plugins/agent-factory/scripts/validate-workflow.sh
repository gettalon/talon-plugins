#!/usr/bin/env bash
# validate-workflow.sh — Validate YAML workflow state machine definitions
# Usage: bash validate-workflow.sh <workflow.yaml> [workflow2.yaml ...]
#
# Checks:
#   1. Required fields present (name, description, initial_state, states)
#   2. Initial state exists in states map
#   3. All transition targets point to existing states
#   4. State names match their keys
#   5. No orphan states (unreachable from initial state)
#   6. No empty states map

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

errors=0
warnings=0

err() { echo -e "${RED}ERROR${NC}: $1"; ((errors++)); }
warn() { echo -e "${YELLOW}WARN${NC}: $1"; ((warnings++)); }
ok() { echo -e "${GREEN}OK${NC}: $1"; }

if [[ $# -eq 0 ]]; then
  echo "Usage: validate-workflow.sh <workflow.yaml> [workflow2.yaml ...]"
  exit 1
fi

# Check for python3 (used for YAML parsing)
if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required for YAML parsing"
  exit 1
fi

for file in "$@"; do
  echo ""
  echo "=== Validating: $file ==="

  if [[ ! -f "$file" ]]; then
    err "File not found: $file"
    continue
  fi

  # Parse and validate with Python (handles YAML properly)
  python3 -c "
import sys, json

try:
    import yaml
except ImportError:
    # Fallback: try to parse as simple YAML without pyyaml
    print('WARN: pyyaml not installed. Install with: pip3 install pyyaml')
    sys.exit(2)

with open('$file', 'r') as f:
    try:
        doc = yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f'PARSE_ERROR: Invalid YAML: {e}')
        sys.exit(1)

if not isinstance(doc, dict):
    print('PARSE_ERROR: Document root must be a mapping')
    sys.exit(1)

errors = []
warnings = []

# 1. Required fields
for field in ['name', 'description', 'initial_state', 'states']:
    if field not in doc:
        errors.append(f'Missing required field: {field}')

if errors:
    for e in errors:
        print(f'ERROR: {e}')
    sys.exit(1)

name = doc['name']
initial = doc['initial_state']
states = doc.get('states', {})

if not isinstance(states, dict):
    print('ERROR: states must be a mapping')
    sys.exit(1)

# 2. Empty states check
if len(states) == 0:
    errors.append('States map is empty')

# 3. Initial state exists
if initial not in states:
    errors.append(f'Initial state \"{initial}\" not found in states: {list(states.keys())}')

# 4. State names match keys + transition targets valid
all_state_names = set(states.keys())
all_transition_targets = set()

for key, state in states.items():
    if not isinstance(state, dict):
        errors.append(f'State \"{key}\" must be a mapping')
        continue

    # Check name matches key
    state_name = state.get('name', key)
    if state_name != key:
        errors.append(f'State key \"{key}\" != state.name \"{state_name}\"')

    # Check transitions
    transitions = state.get('transitions', [])
    if not isinstance(transitions, list):
        errors.append(f'State \"{key}\": transitions must be a list')
        continue

    for i, t in enumerate(transitions):
        if not isinstance(t, dict):
            errors.append(f'State \"{key}\": transition {i} must be a mapping')
            continue
        target = t.get('to')
        if not target:
            errors.append(f'State \"{key}\": transition {i} missing \"to\" field')
        elif target not in all_state_names:
            errors.append(f'State \"{key}\": transition to unknown state \"{target}\"')
        else:
            all_transition_targets.add(target)

# 5. Orphan detection (BFS from initial state)
if initial in states:
    reachable = set()
    queue = [initial]
    while queue:
        current = queue.pop(0)
        if current in reachable:
            continue
        reachable.add(current)
        state = states.get(current, {})
        for t in state.get('transitions', []):
            target = t.get('to')
            if target and target not in reachable:
                queue.append(target)

    orphans = all_state_names - reachable
    for orphan in orphans:
        warnings.append(f'Unreachable state: \"{orphan}\" (not reachable from \"{initial}\")')

# 6. Terminal state check (at least one state with no transitions)
has_terminal = any(
    len(s.get('transitions', [])) == 0
    for s in states.values()
    if isinstance(s, dict)
)
if not has_terminal:
    warnings.append('No terminal state found (state with empty transitions list)')

# 7. Permission mode validation
valid_modes = {'plan', 'ask', 'allow', 'bypass'}
for key, state in states.items():
    if not isinstance(state, dict):
        continue
    mode = state.get('permission_mode')
    if mode and mode not in valid_modes:
        errors.append(f'State \"{key}\": invalid permission_mode \"{mode}\" (valid: {valid_modes})')

# Output results
for e in errors:
    print(f'ERROR: {e}')
for w in warnings:
    print(f'WARN: {w}')

if not errors:
    state_count = len(states)
    transition_count = sum(
        len(s.get('transitions', []))
        for s in states.values()
        if isinstance(s, dict)
    )
    print(f'OK: \"{name}\" — {state_count} states, {transition_count} transitions')

sys.exit(1 if errors else 0)
" 2>&1 | while IFS= read -r line; do
    case "$line" in
      ERROR:*)  err "${line#ERROR: }" ;;
      WARN:*)   warn "${line#WARN: }" ;;
      OK:*)     ok "${line#OK: }" ;;
      PARSE_ERROR:*) err "${line#PARSE_ERROR: }" ;;
      *)        echo "$line" ;;
    esac
  done

  # Capture python exit code
  if [[ ${PIPESTATUS[0]} -ne 0 && ${PIPESTATUS[0]} -ne 2 ]]; then
    ((errors++))
  fi
done

echo ""
if [[ $errors -gt 0 ]]; then
  echo -e "${RED}Validation failed${NC}: $errors error(s), $warnings warning(s)"
  exit 1
elif [[ $warnings -gt 0 ]]; then
  echo -e "${YELLOW}Validation passed with warnings${NC}: $warnings warning(s)"
  exit 0
else
  echo -e "${GREEN}All workflows valid${NC}"
  exit 0
fi
