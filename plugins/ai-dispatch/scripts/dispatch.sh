#!/usr/bin/env bash
# AI model dispatch — run Claude Code or Codex against any backend
# Config: ~/.config/ai-dispatch/config.json
#
# Usage:
#   dispatch <backend> "prompt"                    # simple mode
#   dispatch <backend> --yolo "prompt"             # simple mode (skip permissions)
#   dispatch <backend> claude [args...] "prompt"   # explicit mode
#   dispatch <backend> codex "prompt"              # codex mode
#   dispatch --list                                # list backends
#   dispatch --models <backend>                    # list models

set -euo pipefail

CONFIG_FILE="${AI_DISPATCH_CONFIG:-$HOME/.config/ai-dispatch/config.json}"
DISPATCH_REGISTRY="/tmp/ark-dispatches.jsonl"
SCHEMA='{"type":"object","properties":{"summary":{"type":"string"},"changed_files":{"type":"array","items":{"type":"string"}},"findings":{"type":"array","items":{"type":"string"}}},"required":["summary","changed_files","findings"]}'

# --- Config reader (uses python3 for JSON parsing) ---

read_config() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "Config not found: $CONFIG_FILE" >&2
    echo "Copy config.example.json to ~/.config/ai-dispatch/config.json and add your credentials." >&2
    return 1
  fi
}

configure_backend() {
  read_config || return 1
  local backend="$1"

  # Check for ark-<model> pattern
  local base_backend="$backend"
  local model_alias=""
  if [[ "$backend" == *-* ]]; then
    base_backend="${backend%%-*}"
    # Try exact match first, then fall back to base + alias
    if ! python3 -c "import json; d=json.load(open('$CONFIG_FILE')); assert '$backend' in d['backends']" 2>/dev/null; then
      model_alias="${backend#*-}"
      # Check if base backend exists
      python3 -c "import json; d=json.load(open('$CONFIG_FILE')); assert '$base_backend' in d['backends']" 2>/dev/null || {
        echo "Unknown backend: $backend" >&2
        return 1
      }
    else
      base_backend="$backend"
      model_alias=""
    fi
  fi

  # Export env vars from config
  eval "$(python3 -c "
import json, os
cfg = json.load(open('$CONFIG_FILE'))
backend = cfg['backends'].get('$base_backend', {})
env = backend.get('env', {})
models = backend.get('models', {})
aliases = backend.get('model_aliases', {})

# Export all env vars
for k, v in env.items():
    print(f'export {k}=\"{v}\"')

# Set ANTHROPIC_AUTH_TOKEN from API_KEY if not set
if 'ANTHROPIC_AUTH_TOKEN' not in env and 'ANTHROPIC_API_KEY' in env:
    print(f'export ANTHROPIC_AUTH_TOKEN=\"{env[\"ANTHROPIC_API_KEY\"]}\"')

# Set OPENAI_API_KEY from ANTHROPIC_API_KEY if OPENAI_BASE_URL is set
if 'OPENAI_BASE_URL' in env and 'OPENAI_API_KEY' not in env and 'ANTHROPIC_API_KEY' in env:
    print(f'export OPENAI_API_KEY=\"{env[\"ANTHROPIC_API_KEY\"]}\"')

# Resolve model
alias = '$model_alias'
if alias and alias in aliases:
    model = aliases[alias]
    print(f'export ANTHROPIC_DEFAULT_OPUS_MODEL=\"{model}\"')
    print(f'export ANTHROPIC_DEFAULT_SONNET_MODEL=\"{model}\"')
    print(f'export ANTHROPIC_DEFAULT_HAIKU_MODEL=\"{model}\"')
    print(f'export CLAUDE_CODE_SUBAGENT_MODEL=\"{model}\"')
elif not alias:
    print(f'export ANTHROPIC_DEFAULT_OPUS_MODEL=\"{models.get(\"opus\", \"\")}\"')
    print(f'export ANTHROPIC_DEFAULT_SONNET_MODEL=\"{models.get(\"sonnet\", \"\")}\"')
    print(f'export ANTHROPIC_DEFAULT_HAIKU_MODEL=\"{models.get(\"haiku\", \"\")}\"')
    print(f'export CLAUDE_CODE_SUBAGENT_MODEL=\"{models.get(\"opus\", \"\")}\"')
else:
    # Unknown alias — use as model ID directly
    print(f'export ANTHROPIC_DEFAULT_OPUS_MODEL=\"{alias}\"')
    print(f'export ANTHROPIC_DEFAULT_SONNET_MODEL=\"{alias}\"')
    print(f'export ANTHROPIC_DEFAULT_HAIKU_MODEL=\"{alias}\"')
    print(f'export CLAUDE_CODE_SUBAGENT_MODEL=\"{alias}\"')

# Check disable_mcp_tools flag
if backend.get('disable_mcp_tools', False):
    print('export DISPATCH_DISABLE_MCP=1')
" 2>/dev/null)" || return 1
}

list_backends() {
  read_config || return 1
  python3 -c "
import json
cfg = json.load(open('$CONFIG_FILE'))
for name, b in cfg['backends'].items():
    desc = b.get('description', '')
    aliases = ', '.join(b.get('model_aliases', {}).keys())
    print(f'{name:<14s} {desc}')
    if aliases:
        print(f'  {name}-*{\" \":8s} Aliases: {aliases}')
"
}

list_models() {
  local backend="$1"
  read_config || return 1
  python3 -c "
import json
cfg = json.load(open('$CONFIG_FILE'))
b = cfg['backends'].get('$backend', {})
models = b.get('models', {})
aliases = b.get('model_aliases', {})
print('Default models:')
for tier, model in models.items():
    print(f'  {tier:<8s} {model}')
if aliases:
    print('Aliases (use as ${backend}-<alias>):')
    for alias, model in aliases.items():
        print(f'  {alias:<20s} → {model}')
"
}

# --- Task Registry ---

register_dispatch() {
  local backend="$1" tool="$2" prompt="$3"
  local id="ark-$(date +%s)-$$"
  local ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '{"id":"%s","backend":"%s","tool":"%s","ts":"%s","pid":%d,"prompt":"%s"}\n' \
    "$id" "$backend" "$tool" "$ts" "$$" \
    "$(echo "$prompt" | head -c 100 | tr '"' "'" | tr '\n' ' ')" \
    >> "$DISPATCH_REGISTRY"
  echo "$id"
}

# --- Main ---
YOLO=false
case "${1:-}" in
  --list)
    list_backends
    exit 0
    ;;
  --dispatches)
    [[ ! -f "$DISPATCH_REGISTRY" ]] && { echo "No dispatches yet"; exit 0; }
    while IFS= read -r line; do echo "$line"; done < "$DISPATCH_REGISTRY"
    exit 0
    ;;
  --models)
    list_models "${2:?Usage: dispatch --models <backend>}"
    exit 0
    ;;
  --env)
    configure_backend "${2:?Usage: dispatch --env <backend>}" || exit 1
    env | grep -E '^(ANTHROPIC_|OPENAI_|CLAUDE_CODE_)' | sed 's/^/export /'
    exit $?
    ;;
  --yolo)
    YOLO=true
    shift
    ;;
  "")
    echo "Usage: dispatch <backend> \"prompt\""
    echo "       dispatch <backend> --yolo \"prompt\""
    echo "       dispatch <backend> claude [args...]"
    echo "       dispatch --list"
    echo "       dispatch --models <backend>"
    exit 1
    ;;
esac

BACKEND="$1"
shift 1

configure_backend "$BACKEND" || {
  echo "Unknown backend: $BACKEND" >&2
  echo "Run: dispatch --list" >&2
  exit 1
}

# Detect mode: if first arg is a tool name, use explicit mode; otherwise treat as prompt
TOOL="${1:-}"
case "$TOOL" in
  claude|codex|claude-interactive)
    shift
    ;;
  *)
    # Simple mode: dispatch <backend> "prompt"
    PROMPT="$*"
    if [[ -z "$PROMPT" ]]; then
      echo "Usage: dispatch <backend> \"prompt\"" >&2
      exit 1
    fi
    DISPATCH_ID=$(register_dispatch "$BACKEND" "claude" "$PROMPT")
    echo "[dispatch] $DISPATCH_ID ($BACKEND)" >&2

    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    RENDERER="$SCRIPT_DIR/stream-render.py"
    RAW_LOG="/tmp/ark-dispatch-$$.jsonl"

    # Build command args
    CMD_ARGS=(-p --output-format stream-json --verbose --json-schema "$SCHEMA")
    if $YOLO; then
      CMD_ARGS=(--dangerously-skip-permissions "${CMD_ARGS[@]}")
    fi
    if [[ "${DISPATCH_DISABLE_MCP:-}" == "1" ]]; then
      EMPTY_MCP="/tmp/dispatch-empty-mcp.json"
      echo '{"mcpServers":{}}' > "$EMPTY_MCP"
      CMD_ARGS+=(--bare --strict-mcp-config --mcp-config "$EMPTY_MCP")
    fi
    CMD_ARGS+=(-- "$PROMPT")

    if [[ -f "$RENDERER" ]]; then
      claude "${CMD_ARGS[@]}" 2>&1 | tee "$RAW_LOG" | python3 "$RENDERER"
      exit "${PIPESTATUS[0]}"
    else
      exec claude "${CMD_ARGS[@]}"
    fi
    ;;
esac

# Explicit tool mode
DISPATCH_ID=$(register_dispatch "$BACKEND" "$TOOL" "${*:-}")
echo "[dispatch] $DISPATCH_ID ($BACKEND/$TOOL)" >&2

case "$TOOL" in
  claude)
    if $YOLO; then
      exec claude --dangerously-skip-permissions "$@"
    else
      exec claude "$@"
    fi
    ;;
  claude-interactive)
    PIPE_DIR="/tmp/ark-pipes"
    mkdir -p "$PIPE_DIR"
    PIPE_ID="$$-$(date +%s)"
    PIPE_IN="$PIPE_DIR/in-$PIPE_ID"
    PIPE_OUT="$PIPE_DIR/out-$PIPE_ID"
    mkfifo "$PIPE_IN"
    touch "$PIPE_OUT"
    ( sleep 86400 > "$PIPE_IN" ) &
    KEEP_OPEN_PID=$!
    claude --dangerously-skip-permissions \
      --output-format stream-json \
      --input-format stream-json \
      "$@" < "$PIPE_IN" > "$PIPE_OUT" 2>&1 &
    CLAUDE_PID=$!
    trap "kill $KEEP_OPEN_PID $CLAUDE_PID 2>/dev/null; rm -f '$PIPE_IN' '$PIPE_OUT'" EXIT
    echo "{\"pipe\":\"$PIPE_IN\",\"output\":\"$PIPE_OUT\",\"pid\":$CLAUDE_PID}"
    wait $CLAUDE_PID 2>/dev/null
    kill $KEEP_OPEN_PID 2>/dev/null
    ;;
  codex)
    if $YOLO; then
      exec codex --dangerously-bypass-approvals-and-sandbox --model "$ANTHROPIC_DEFAULT_OPUS_MODEL" "$@"
    else
      exec codex --model "$ANTHROPIC_DEFAULT_OPUS_MODEL" "$@"
    fi
    ;;
  *)
    echo "Unknown tool: $TOOL (use 'claude', 'claude-interactive', or 'codex')" >&2
    exit 1
    ;;
esac
