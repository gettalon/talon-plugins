# adversarial-coding

GAN-style multi-agent coding system inspired by [Anthropic's research](https://www.anthropic.com/research).

Three agents work in adversarial loop:
- **Planner** — Expands requirements into detailed specs
- **Generator** — Implements features, spawns parallel workers
- **Evaluator** — Tests with Playwright + AI review, catches bugs

## The Problem It Solves

AI coding agents have two fatal flaws:
1. **Rush to finish** — Context window fills up, model rushes to end
2. **Self-praise blindness** — Model evaluates own work and says "looks great!" even when broken

## The Solution

Adversarial separation of concerns:
- Planner never touches code
- Generator never evaluates quality
- Evaluator only criticizes, never builds

This GAN-like tension produces higher quality output.

## Usage

```
/adversarial-coding "build a retro game editor"
/adversarial-coding "create a browser-based DAW" --budget 100
/adversarial-coding "build REST API" --no-playwright
```

## How It Works

```
while not done:
    1. Planner: Refine spec based on feedback
    2. Generator: Implement next feature
    3. Evaluator: Test + review, report bugs
    4. Check: Stuck? Over budget? Done?
    5. Loop or pause for user input
```

## Checkpoint System

Auto-pauses for human review when:
- Stuck on same bug 3+ times
- Cost exceeds budget (default: $50)
- All features complete
- Planner wants to expand scope

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--budget` | 50 | Max cost in dollars before pause |
| `--max-iterations` | 20 | Max Planner→Generator→Evaluator cycles |
| `--quality-threshold` | 7 | Minimum score (1-10) to ship |
| `--no-playwright` | false | Disable browser testing |

## Files Created

```
.adversarial/
├── spec.md           # Full specification
├── tasks.json        # Feature checklist
├── evaluator-log.md  # Test results + reviews
├── checkpoint.json   # Run state
└── screenshots/      # Playwright failure screenshots
```

## Inspired By

- [Anthropic's multi-agent coding research](https://www.anthropic.com/research)
- Karpathy's autoresearch concept
- GAN (Generative Adversarial Network) architecture
