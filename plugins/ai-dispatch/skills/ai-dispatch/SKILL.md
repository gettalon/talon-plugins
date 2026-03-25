---
name: ai-dispatch
description: "Dispatch subagents to multiple AI backends. Usage: dispatch <backend> \"prompt\". Backends: ark-code, ark-minimax, ark-kimi, ark-deepseek, glm, ark-doubao, ark-auto"
user-invocable: true
---

# AI Dispatch

Dispatch tasks to different AI backends. The script handles all env vars, flags, and output formatting.

## Usage

```bash
# Simple — just backend + prompt
dispatch ark-code "implement binary search"
dispatch glm "translate to Chinese: hello world"
dispatch ark-minimax "analyze this codebase"

# Check progress
dcheck --latest
dcheck --list

# List backends
dispatch --list
```

## Available Backends

| Command | Model | Best for |
|---------|-------|----------|
| `ark-code` | Doubao Seed 2.0 Code | Code generation |
| `ark-doubao` | Doubao Seed 2.0 Pro | General reasoning |
| `ark-minimax` | MiniMax M2.5 | Analysis, research |
| `ark-kimi` | Kimi K2.5 | Long context |
| `ark-deepseek` | DeepSeek V3.2 | Complex reasoning |
| `ark-glm` | GLM-4.7 | Chinese via Ark |
| `ark-auto` | Auto routing | Smart selection |
| `glm` | GLM-5 | Chinese language |
| `ark` | Doubao Seed 2.0 | Default |

## Orchestrator Mode

When invoked via slash commands, Claude acts as orchestrator:
1. Interprets the user's intent (handles typos, shorthand)
2. Gathers codebase context (reads files, greps)
3. Crafts a detailed prompt
4. Dispatches with structured JSON output
5. Reports results (summary, changed files, findings)

## Output

Simple mode auto-applies `--json-schema` for structured output:
```json
{"summary": "...", "changed_files": ["..."], "findings": ["..."]}
```

## Advanced

```bash
# Explicit mode (full control over claude flags)
dispatch ark claude -p --dangerously-skip-permissions "prompt"

# Interactive (named pipe for follow-ups)
dispatch ark claude-interactive

# Resume previous session
dispatch ark claude -p --resume <SESSION_ID> "follow up"

# Codex
dispatch ark codex "prompt"
```

## Setup

The plugin installs `dispatch` and `dcheck` to your PATH. Credentials are stored in the dispatch script — edit `scripts/dispatch.sh` to add or modify backends.
