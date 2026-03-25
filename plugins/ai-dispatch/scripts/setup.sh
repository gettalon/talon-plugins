#!/usr/bin/env bash
# Setup ai-dispatch — install dispatch/dcheck and create config
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$HOME/.config/ai-dispatch"
CONFIG_FILE="$CONFIG_DIR/config.json"

echo "=== AI Dispatch Setup ==="
echo ""

# 1. Install to PATH
echo "Installing dispatch and dcheck..."
if cp "$SCRIPT_DIR/dispatch.sh" /usr/local/bin/dispatch 2>/dev/null; then
  cp "$SCRIPT_DIR/check-dispatch.sh" /usr/local/bin/dcheck 2>/dev/null
  chmod +x /usr/local/bin/dispatch /usr/local/bin/dcheck
  echo "  ✓ /usr/local/bin/"
else
  mkdir -p "$HOME/bin"
  cp "$SCRIPT_DIR/dispatch.sh" "$HOME/bin/dispatch"
  cp "$SCRIPT_DIR/check-dispatch.sh" "$HOME/bin/dcheck"
  chmod +x "$HOME/bin/dispatch" "$HOME/bin/dcheck"
  echo "  ✓ ~/bin/"
fi

# 2. Config
mkdir -p "$CONFIG_DIR"

if [[ -f "$CONFIG_FILE" ]]; then
  echo ""
  echo "Config exists: $CONFIG_FILE"
  read -p "Overwrite? (y/N): " overwrite
  [[ "$overwrite" != "y" && "$overwrite" != "Y" ]] && { echo "Done."; exit 0; }
fi

echo ""
echo "Scanning for API keys..."

# Auto-detect from env and shell rc
ARK_DETECTED="${ARK_API_KEY:-}"
GLM_DETECTED="${GLM_API_KEY:-}"
OPENAI_DETECTED="${OPENAI_API_KEY:-}"
OPENROUTER_DETECTED="${OPENROUTER_API_KEY:-}"

for rc in ~/.zshrc ~/.bashrc ~/.zshenv; do
  [[ -f "$rc" ]] || continue
  [[ -z "$ARK_DETECTED" ]] && ARK_DETECTED=$(grep -oP 'ARK_API_KEY=\K[^\s"]+' "$rc" 2>/dev/null | tail -1) || true
  [[ -z "$GLM_DETECTED" ]] && GLM_DETECTED=$(grep -oP 'GLM_API_KEY=\K[^\s"]+' "$rc" 2>/dev/null | tail -1) || true
  [[ -z "$OPENROUTER_DETECTED" ]] && OPENROUTER_DETECTED=$(grep -oP 'OPENROUTER_API_KEY=\K[^\s"]+' "$rc" 2>/dev/null | tail -1) || true
done

[[ -n "$ARK_DETECTED" ]] && echo "  Found: ARK key (${ARK_DETECTED:0:8}...)"
[[ -n "$GLM_DETECTED" ]] && echo "  Found: GLM key (${GLM_DETECTED:0:8}...)"
[[ -n "$OPENROUTER_DETECTED" ]] && echo "  Found: OpenRouter key (${OPENROUTER_DETECTED:0:8}...)"

echo ""
echo "Configure backends. Press Enter to skip or use detected key."
echo ""

backends='{"backends":{}}'

# --- Ark ---
echo "── Ark (Doubao/MiniMax/Kimi/DeepSeek/GLM) ──"
[[ -n "$ARK_DETECTED" ]] && echo "  [detected: ${ARK_DETECTED:0:8}...]"
read -p "  API Key${ARK_DETECTED:+ [Enter=detected]}: " ARK_KEY
ARK_KEY="${ARK_KEY:-$ARK_DETECTED}"
if [[ -n "$ARK_KEY" ]]; then
  backends=$(python3 -c "
import json; d=json.loads('$backends')
d['backends']['ark']={
  'description':'Doubao Seed 2.0 via Volcengine Ark',
  'env':{'ANTHROPIC_BASE_URL':'https://ark.cn-beijing.volces.com/api/coding','ANTHROPIC_API_KEY':'$ARK_KEY','OPENAI_BASE_URL':'https://ark.cn-beijing.volces.com/api/coding/v3'},
  'models':{'opus':'ark-code-latest','sonnet':'ark-code-latest','haiku':'ark-code-latest'},
  'model_aliases':{'kimi':'kimi-k2.5','minimax':'minimax-m2.5','glm':'glm-4.7','deepseek':'deepseek-v3.2','code':'doubao-seed-2.0-code','pro':'doubao-seed-2.0-pro','lite':'doubao-seed-2.0-lite','auto':'auto'}
}
print(json.dumps(d))")
  echo "  ✓ Ark"
fi

echo ""

# --- GLM ---
echo "── GLM (Chinese language) ──"
[[ -n "$GLM_DETECTED" ]] && echo "  [detected: ${GLM_DETECTED:0:8}...]"
read -p "  Auth Token${GLM_DETECTED:+ [Enter=detected]}: " GLM_KEY
GLM_KEY="${GLM_KEY:-$GLM_DETECTED}"
if [[ -n "$GLM_KEY" ]]; then
  backends=$(python3 -c "
import json; d=json.loads('''$backends''')
d['backends']['glm']={
  'description':'GLM-5 via z.ai — Chinese language',
  'env':{'ANTHROPIC_BASE_URL':'https://api.z.ai/api/anthropic','ANTHROPIC_AUTH_TOKEN':'$GLM_KEY'},
  'models':{'opus':'glm-5','sonnet':'glm-5','haiku':'glm-4.7-air'}
}
print(json.dumps(d))")
  echo "  ✓ GLM"
fi

echo ""

# --- OpenRouter ---
echo "── OpenRouter (hundreds of models) ──"
[[ -n "$OPENROUTER_DETECTED" ]] && echo "  [detected: ${OPENROUTER_DETECTED:0:8}...]"
read -p "  API Key${OPENROUTER_DETECTED:+ [Enter=detected]}: " OR_KEY
OR_KEY="${OR_KEY:-$OPENROUTER_DETECTED}"
if [[ -n "$OR_KEY" ]]; then
  read -p "  Default model [anthropic/claude-sonnet-4]: " OR_MODEL
  OR_MODEL="${OR_MODEL:-anthropic/claude-sonnet-4}"
  backends=$(python3 -c "
import json; d=json.loads('''$backends''')
d['backends']['openrouter']={
  'description':'OpenRouter — multi-model gateway',
  'env':{'ANTHROPIC_BASE_URL':'https://openrouter.ai/api/v1','ANTHROPIC_API_KEY':'$OR_KEY','OPENAI_BASE_URL':'https://openrouter.ai/api/v1','OPENAI_API_KEY':'$OR_KEY'},
  'models':{'opus':'$OR_MODEL','sonnet':'$OR_MODEL','haiku':'$OR_MODEL'}
}
print(json.dumps(d))")
  echo "  ✓ OpenRouter"
fi

echo ""

# --- Custom ---
echo "── Custom (any OpenAI/Anthropic-compatible API) ──"
read -p "  Name (e.g. together, groq, local) or Enter to skip: " CUSTOM_NAME
if [[ -n "$CUSTOM_NAME" ]]; then
  read -p "  Base URL: " CUSTOM_URL
  read -p "  API Key: " CUSTOM_KEY
  read -p "  Model ID: " CUSTOM_MODEL
  backends=$(python3 -c "
import json; d=json.loads('''$backends''')
d['backends']['$CUSTOM_NAME']={
  'description':'Custom: $CUSTOM_NAME',
  'env':{'ANTHROPIC_BASE_URL':'$CUSTOM_URL','ANTHROPIC_API_KEY':'$CUSTOM_KEY','OPENAI_BASE_URL':'$CUSTOM_URL','OPENAI_API_KEY':'$CUSTOM_KEY'},
  'models':{'opus':'$CUSTOM_MODEL','sonnet':'$CUSTOM_MODEL','haiku':'$CUSTOM_MODEL'}
}
print(json.dumps(d))")
  echo "  ✓ $CUSTOM_NAME"
fi

# Save
count=$(python3 -c "import json; print(len(json.loads('''$backends''')['backends']))")
if [[ "$count" == "0" ]]; then
  echo "No backends configured. Copy config.example.json manually."
  cp "$SCRIPT_DIR/../config.example.json" "$CONFIG_FILE" 2>/dev/null || true
else
  python3 -c "import json; json.dump(json.loads('''$backends'''), open('$CONFIG_FILE','w'), indent=2)"
  echo ""
  echo "✓ Saved $count backend(s) to $CONFIG_FILE"
fi

echo ""
echo "Done! Try: dispatch --list"
