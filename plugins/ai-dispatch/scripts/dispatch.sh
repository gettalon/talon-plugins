#!/usr/bin/env bash
# AI model dispatch - run Claude Code or Codex against any backend
# Usage: dispatch.sh <backend> <tool> [args...]
#   dispatch.sh ark claude -p "implement binary search"
#   dispatch.sh ark codex "implement binary search"
#   dispatch.sh glm claude -p "translate to Chinese: hello"
#   dispatch.sh --list                # list backends
#   dispatch.sh --models <backend>    # list models for a backend

set -euo pipefail

# --- Backend configs ---
configure_backend() {
  case "$1" in
    glm)
      export ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
      export ANTHROPIC_AUTH_TOKEN=6e73e4511453444b8b24aa11519f119c.V1tZ2uCm6ThbH0sf
      export ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5
      export ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5
      export ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-4.7-air
      export CLAUDE_CODE_SUBAGENT_MODEL=glm-5
      ;;
    ark)
      export ANTHROPIC_BASE_URL=https://ark.cn-beijing.volces.com/api/coding
      export ANTHROPIC_API_KEY=68cce044-38ad-4b77-9263-ca22a0880119
      export ANTHROPIC_AUTH_TOKEN="$ANTHROPIC_API_KEY"
      export ANTHROPIC_DEFAULT_OPUS_MODEL=ark-code-latest
      export ANTHROPIC_DEFAULT_SONNET_MODEL=ark-code-latest
      export ANTHROPIC_DEFAULT_HAIKU_MODEL=ark-code-latest
      export CLAUDE_CODE_SUBAGENT_MODEL=ark-code-latest
      export OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
      export OPENAI_API_KEY="$ANTHROPIC_API_KEY"
      ;;
    ark-*)
      local model_prefix="${1#ark-}"
      export ANTHROPIC_BASE_URL=https://ark.cn-beijing.volces.com/api/coding
      export ANTHROPIC_API_KEY=68cce044-38ad-4b77-9263-ca22a0880119
      export ANTHROPIC_AUTH_TOKEN="$ANTHROPIC_API_KEY"
      export OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
      export OPENAI_API_KEY="$ANTHROPIC_API_KEY"
      # Known models on Ark coding API (not all appear in /models endpoint)
      local model_id=""
      case "$model_prefix" in
        kimi|kimi-k2.5|kimi-k2)       model_id="kimi-k2.5" ;;
        minimax|minimax-m2.5)         model_id="minimax-m2.5" ;;
        glm|glm-4.7)                  model_id="glm-4.7" ;;
        deepseek|deepseek-v3.2)       model_id="deepseek-v3.2" ;;
        seed-code|doubao-seed-code)   model_id="doubao-seed-code" ;;
        code|doubao-seed-2.0-code)    model_id="doubao-seed-2.0-code" ;;
        pro|doubao-seed-2.0-pro)      model_id="doubao-seed-2.0-pro" ;;
        lite|doubao-seed-2.0-lite)    model_id="doubao-seed-2.0-lite" ;;
        auto)                         model_id="auto" ;;
        *)
          # Fallback: resolve from Ark API
          model_id=$(curl -s https://ark.cn-beijing.volces.com/api/v3/models \
            -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
            | python3 -c "
import json,sys
prefix='$model_prefix'
d=json.load(sys.stdin)
models=[m for m in d.get('data',[]) if m.get('status') not in ('Shutdown','Retiring') and m.get('domain','') not in ('VideoGeneration','ImageGeneration','Router') and prefix in m['id']]
models.sort(key=lambda x: x['id'], reverse=True)
print(models[0]['id'] if models else '')
" 2>/dev/null)
          ;;
      esac
      [[ -z "$model_id" ]] && { echo "No Ark model matching '$model_prefix'" >&2; return 1; }
      export ANTHROPIC_DEFAULT_OPUS_MODEL="$model_id"
      export ANTHROPIC_DEFAULT_SONNET_MODEL="$model_id"
      export ANTHROPIC_DEFAULT_HAIKU_MODEL="$model_id"
      export CLAUDE_CODE_SUBAGENT_MODEL="$model_id"
      ;;
    *)
      return 1
      ;;
  esac
}

list_backends() {
  cat <<'EOF'
glm          GLM-5 via z.ai             Chinese language, translation
ark          Doubao Seed 2.0 via Ark    Coding, general tasks, fast
ark-doubao   Doubao Seed 2.0 Pro        General reasoning, fast
ark-code     Doubao Seed 2.0 Code       Code generation, optimized
ark-*        Any model via Ark           ark-glm, ark-deepseek, ark-kimi
                                         ark-minimax, ark-auto
EOF
}

list_models() {
  local backend="$1"
  case "$backend" in
    ark|ark-*)
      curl -s https://ark.cn-beijing.volces.com/api/v3/models \
        -H "Authorization: Bearer 68cce044-38ad-4b77-9263-ca22a0880119" \
        | python3 -c "
import json,sys
d=json.load(sys.stdin)
for m in sorted(d.get('data',[]), key=lambda x:x.get('name','')):
  if m.get('status') not in ('Shutdown','Retiring'):
    print(f\"{m['id']:50s} {m.get('domain',''):20s} {m.get('name','')}\")
"
      ;;
    *)
      echo "Model listing only available for ark backends"
      ;;
  esac
}

# Print exports for sourcing into current shell
print_env() {
  configure_backend "$1" || return 1
  env | grep -E '^(ANTHROPIC_|OPENAI_|CLAUDE_CODE_)' | sed 's/^/export /'
}

# --- Task Registry ---
DISPATCH_REGISTRY="/tmp/ark-dispatches.jsonl"

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

list_dispatches() {
  [[ ! -f "$DISPATCH_REGISTRY" ]] && { echo "No dispatches yet"; return; }
  echo "ID                    Backend        Status   Prompt"
  echo "----                  -------        ------   ------"
  while IFS= read -r line; do
    id=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['id'])" 2>/dev/null)
    backend=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['backend'])" 2>/dev/null)
    pid=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['pid'])" 2>/dev/null)
    prompt=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['prompt'][:60])" 2>/dev/null)
    if kill -0 "$pid" 2>/dev/null; then status="running"; else status="done"; fi
    printf "%-22s %-14s %-8s %s\n" "$id" "$backend" "$status" "$prompt"
  done < "$DISPATCH_REGISTRY"
}

# --- Main ---
case "${1:-}" in
  --list)
    list_backends
    exit 0
    ;;
  --dispatches)
    list_dispatches
    exit 0
    ;;
  --models)
    list_models "${2:?Usage: dispatch.sh --models <backend>}"
    exit 0
    ;;
  --env)
    print_env "${2:?Usage: dispatch.sh --env <backend>}"
    exit $?
    ;;
  "")
    echo "Usage: dispatch.sh <backend> <tool> [args...]"
    echo "       dispatch.sh --list"
    echo "       dispatch.sh --models <backend>"
    exit 1
    ;;
esac

BACKEND="$1"
shift 1

configure_backend "$BACKEND" || {
  echo "Unknown backend: $BACKEND" >&2
  echo "Run: dispatch.sh --list" >&2
  exit 1
}

SCHEMA='{"type":"object","properties":{"summary":{"type":"string"},"changed_files":{"type":"array","items":{"type":"string"}},"findings":{"type":"array","items":{"type":"string"}}},"required":["summary","changed_files","findings"]}'

# Detect mode: if first arg is a tool name, use explicit mode; otherwise treat as prompt
TOOL="${1:-}"
case "$TOOL" in
  claude|codex|claude-interactive)
    shift
    ;;
  *)
    # Simple mode: dispatch.sh <backend> "prompt"
    # All remaining args are the prompt
    PROMPT="$*"
    if [[ -z "$PROMPT" ]]; then
      echo "Usage: dispatch.sh <backend> \"prompt\"" >&2
      echo "       dispatch.sh <backend> claude [args...]" >&2
      exit 1
    fi
    DISPATCH_ID=$(register_dispatch "$BACKEND" "claude" "$PROMPT")
    echo "[dispatch] $DISPATCH_ID ($BACKEND)" >&2
    exec claude -p --dangerously-skip-permissions \
      --output-format stream-json --verbose \
      --json-schema "$SCHEMA" \
      "$PROMPT"
    ;;
esac

# Explicit tool mode
DISPATCH_ID=$(register_dispatch "$BACKEND" "$TOOL" "${*:-}")
echo "[dispatch] $DISPATCH_ID ($BACKEND/$TOOL)" >&2

case "$TOOL" in
  claude)
    exec claude "$@"
    ;;
  claude-interactive)
    # Interactive mode: creates a named pipe so you can send follow-up messages.
    # Usage: dispatch.sh <backend> claude-interactive [claude args...]
    # Returns: pipe path. Write JSON lines to it, read output from stdout.
    #
    # Start:  PIPE=$(dispatch.sh ark claude-interactive --output-format stream-json ...)
    # Send:   echo '{"type":"user","message":{"role":"user","content":"hello"}}' > $PIPE
    # Follow: echo '{"type":"user","message":{"role":"user","content":"also X"}}' > $PIPE
    # Stop:   echo '{"type":"stop"}' > $PIPE
    PIPE_DIR="/tmp/ark-pipes"
    mkdir -p "$PIPE_DIR"
    PIPE_ID="$$-$(date +%s)"
    PIPE_IN="$PIPE_DIR/in-$PIPE_ID"
    PIPE_OUT="$PIPE_DIR/out-$PIPE_ID"
    mkfifo "$PIPE_IN"
    touch "$PIPE_OUT"

    # Keep the pipe open with a background cat (otherwise first write closes it)
    ( sleep 86400 > "$PIPE_IN" ) &
    KEEP_OPEN_PID=$!

    # Run claude reading from the pipe, writing to output file
    claude --dangerously-skip-permissions \
      --output-format stream-json \
      --input-format stream-json \
      "$@" < "$PIPE_IN" > "$PIPE_OUT" 2>&1 &
    CLAUDE_PID=$!

    # Cleanup on exit
    trap "kill $KEEP_OPEN_PID $CLAUDE_PID 2>/dev/null; rm -f '$PIPE_IN' '$PIPE_OUT'" EXIT

    # Return pipe path and PID so caller can send messages and read output
    echo "{\"pipe\":\"$PIPE_IN\",\"output\":\"$PIPE_OUT\",\"pid\":$CLAUDE_PID}"

    # Wait for claude to finish
    wait $CLAUDE_PID 2>/dev/null
    kill $KEEP_OPEN_PID 2>/dev/null
    ;;
  codex)
    exec codex --model "$ANTHROPIC_DEFAULT_OPUS_MODEL" "$@"
    ;;
  *)
    echo "Unknown tool: $TOOL (use 'claude', 'claude-interactive', or 'codex')" >&2
    exit 1
    ;;
esac
