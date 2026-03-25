#!/usr/bin/env bash
# Setup ai-dispatch — install dispatch/dcheck to PATH and create config
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$HOME/.config/ai-dispatch"
CONFIG_FILE="$CONFIG_DIR/config.json"

echo "=== AI Dispatch Setup ==="

# 1. Install dispatch and dcheck to PATH
echo "Installing dispatch and dcheck to /usr/local/bin..."
cp "$SCRIPT_DIR/dispatch.sh" /usr/local/bin/dispatch 2>/dev/null || {
  mkdir -p "$HOME/bin"
  cp "$SCRIPT_DIR/dispatch.sh" "$HOME/bin/dispatch"
  echo "  Installed to ~/bin/dispatch (add ~/bin to PATH if needed)"
}
cp "$SCRIPT_DIR/check-dispatch.sh" /usr/local/bin/dcheck 2>/dev/null || {
  cp "$SCRIPT_DIR/check-dispatch.sh" "$HOME/bin/dcheck"
}
chmod +x /usr/local/bin/dispatch /usr/local/bin/dcheck 2>/dev/null || chmod +x "$HOME/bin/dispatch" "$HOME/bin/dcheck" 2>/dev/null

# 2. Create config if not exists
if [[ -f "$CONFIG_FILE" ]]; then
  echo "Config already exists: $CONFIG_FILE"
else
  mkdir -p "$CONFIG_DIR"

  # Check for existing env vars
  ARK_KEY="${ANTHROPIC_API_KEY:-}"
  GLM_TOKEN="${ANTHROPIC_AUTH_TOKEN:-}"

  if [[ -n "$ARK_KEY" || -n "$GLM_TOKEN" ]]; then
    echo "Found existing credentials in environment, creating config..."
  else
    echo ""
    echo "No credentials found. You can configure backends now or edit config.json later."
    echo ""
    read -p "Ark API key (or press Enter to skip): " ARK_KEY
    read -p "GLM auth token (or press Enter to skip): " GLM_TOKEN
  fi

  cat > "$CONFIG_FILE" << CONF
{
  "backends": {
    "glm": {
      "description": "GLM-5 via z.ai — Chinese language, translation",
      "env": {
        "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "${GLM_TOKEN:-YOUR_TOKEN_HERE}"
      },
      "models": {
        "opus": "glm-5",
        "sonnet": "glm-5",
        "haiku": "glm-4.7-air"
      }
    },
    "ark": {
      "description": "Doubao Seed 2.0 via Volcengine Ark — Coding, fast",
      "env": {
        "ANTHROPIC_BASE_URL": "https://ark.cn-beijing.volces.com/api/coding",
        "ANTHROPIC_API_KEY": "${ARK_KEY:-YOUR_API_KEY_HERE}",
        "OPENAI_BASE_URL": "https://ark.cn-beijing.volces.com/api/coding/v3"
      },
      "models": {
        "opus": "ark-code-latest",
        "sonnet": "ark-code-latest",
        "haiku": "ark-code-latest"
      },
      "model_aliases": {
        "kimi": "kimi-k2.5",
        "minimax": "minimax-m2.5",
        "glm": "glm-4.7",
        "deepseek": "deepseek-v3.2",
        "code": "doubao-seed-2.0-code",
        "pro": "doubao-seed-2.0-pro",
        "lite": "doubao-seed-2.0-lite",
        "auto": "auto"
      }
    }
  }
}
CONF
  echo "Created: $CONFIG_FILE"
fi

echo ""
echo "Setup complete! Try:"
echo "  dispatch --list"
echo "  dispatch ark-code \"hello world\""
