# AI Dispatch

Dispatch subagent tasks to multiple AI backends with a single command.

```bash
dispatch ark-code "implement binary search"
dispatch glm "translate to Chinese: hello"
dispatch ark-minimax "analyze the auth module"
```

## Setup

```bash
# 1. Install plugin
/plugin install ai-dispatch

# 2. Run setup (installs dispatch/dcheck, creates config)
bash ~/.claude/plugins/cache/gettalon-talon-plugins/ai-dispatch/*/scripts/setup.sh

# 3. Edit config with your API keys
nano ~/.config/ai-dispatch/config.json
```

### Manual Setup

If you prefer manual setup:

```bash
# Copy config template
mkdir -p ~/.config/ai-dispatch
cp config.example.json ~/.config/ai-dispatch/config.json

# Edit with your keys
nano ~/.config/ai-dispatch/config.json

# Install to PATH
cp scripts/dispatch.sh /usr/local/bin/dispatch
cp scripts/check-dispatch.sh /usr/local/bin/dcheck
chmod +x /usr/local/bin/dispatch /usr/local/bin/dcheck
```

## Config

Config lives at `~/.config/ai-dispatch/config.json`. Add your own backends:

```json
{
  "backends": {
    "my-backend": {
      "description": "My custom backend",
      "env": {
        "ANTHROPIC_BASE_URL": "https://my-api.example.com",
        "ANTHROPIC_API_KEY": "sk-..."
      },
      "models": {
        "opus": "my-model-large",
        "sonnet": "my-model-medium",
        "haiku": "my-model-small"
      },
      "model_aliases": {
        "fast": "my-model-small",
        "smart": "my-model-large"
      }
    }
  }
}
```

Then use: `dispatch my-backend "prompt"` or `dispatch my-backend-fast "prompt"`

## Backends (Default)

| Command | Model | Best for |
|---------|-------|----------|
| `ark-code` | Doubao Seed 2.0 Code | Code generation |
| `ark-pro` | Doubao Seed 2.0 Pro | General reasoning |
| `ark-minimax` | MiniMax M2.5 | Analysis, research |
| `ark-kimi` | Kimi K2.5 | Long context |
| `ark-deepseek` | DeepSeek V3.2 | Complex reasoning |
| `ark-glm` | GLM-4.7 | Chinese via Ark |
| `ark-auto` | Auto routing | Smart selection |
| `glm` | GLM-5 | Chinese language |

## Usage

```bash
# Simple — backend + prompt
dispatch ark-code "fix the login bug"

# Check progress
dcheck --latest

# List all dispatches
dcheck --list

# List backends
dispatch --list

# List models for a backend
dispatch --models ark

# Explicit mode (full control)
dispatch ark claude -p --dangerously-skip-permissions "prompt"

# Interactive (named pipe for follow-ups)
dispatch ark claude-interactive

# Codex
dispatch ark codex "prompt"
```

## Environment Variable Override

```bash
# Use a different config file
AI_DISPATCH_CONFIG=/path/to/config.json dispatch ark "prompt"
```
