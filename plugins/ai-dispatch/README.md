# AI Dispatch

Dispatch subagent tasks to multiple AI backends with a single command.

```bash
dispatch ark-code "implement binary search"
dispatch glm "translate to Chinese: hello"
dispatch ark-minimax "analyze the auth module"
```

## Install

```bash
/plugin install ai-dispatch
```

## Backends

- **ark-code** — Doubao Seed 2.0 Code (code generation)
- **ark-doubao** — Doubao Seed 2.0 Pro (general reasoning)
- **ark-minimax** — MiniMax M2.5 (analysis)
- **ark-kimi** — Kimi K2.5 (long context)
- **ark-deepseek** — DeepSeek V3.2 (complex reasoning)
- **ark-glm** — GLM-4.7 via Ark
- **glm** — GLM-5 (Chinese language)
- **ark-auto** — Smart model routing

## Check Progress

```bash
dcheck --latest    # check most recent dispatch
dcheck --list      # list all dispatches
```
