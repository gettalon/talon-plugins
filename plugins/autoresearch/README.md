# autoresearch

Autonomous experiment loop inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch).

Iteratively modify a target file, run an experiment, measure a metric, and keep improvements or discard failures. Runs forever until stopped.

## Usage

### As Claude Code slash command

```
/autoresearch train.py "minimize val_bpb" --budget 5m --provider ark
/autoresearch src/lib.rs "minimize compile time" --budget 2m
/autoresearch index.tsx "minimize bundle size" --budget 1m --max-runs 50
```

### As standalone script

```bash
# ML training (Karpathy-style)
autoresearch.sh train.py "minimize val_bpb" \
  "python train.py" \
  "grep '^val_bpb:' run.log | awk '{print \$2}'" \
  --budget 300 --provider ark

# Rust compile time
autoresearch.sh src/lib.rs "minimize compile time" \
  "cargo build --release 2>&1 | tee autoresearch-run.log" \
  "grep 'Finished' autoresearch-run.log | awk '{print \$2}'" \
  --budget 120

# JS bundle size
autoresearch.sh src/index.tsx "minimize bundle size" \
  "npm run build 2>&1 | tee autoresearch-run.log" \
  "grep 'gzipped' autoresearch-run.log | awk '{print \$NF}'" \
  --budget 60 --provider glm

# Test coverage
autoresearch.sh src/lib.rs "maximize test coverage" \
  "cargo tarpaulin --out json 2>&1 | tee autoresearch-run.log" \
  "python3 -c \"import json; print(json.load(open('tarpaulin-report.json'))['coverage'])\"" \
  --budget 180
```

## How it works

```
while true:
  1. AI agent reads current code + past results
  2. Proposes ONE focused change
  3. git commit
  4. Run experiment (fixed time budget)
  5. Measure metric
  6. Better? keep. Worse? git reset.
  7. Log to autoresearch-results.tsv
  8. Repeat (human might be asleep)
```

## Providers

Works with any Claude Code-compatible provider:

| Provider | Command | Cost |
|----------|---------|------|
| Default (Anthropic) | `--provider default` | $$$ |
| Ark (Volcengine) | `--provider ark` | $ |
| GLM (Zhipu) | `--provider glm` | $ |
| NIM (NVIDIA) | `--provider nim` | Free |

## Files

- `skills/autoresearch/SKILL.md` — Claude Code slash command definition
- `scripts/autoresearch.sh` — Standalone shell script
