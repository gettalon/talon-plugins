#!/usr/bin/env bash
# autoresearch.sh — Autonomous experiment loop using Claude Code or any AI agent
#
# Usage:
#   autoresearch.sh <file> "<metric_description>" "<run_command>" "<extract_command>" [options]
#
# Example:
#   autoresearch.sh train.py "minimize val_bpb" "python train.py" "grep '^val_bpb:' run.log | awk '{print \$2}'" --budget 300 --provider ark
#   autoresearch.sh src/lib.rs "minimize compile time" "cargo build --release 2>&1 | tee run.log" "grep 'Finished' run.log | awk '{print \$2}'" --budget 120
#
# Options:
#   --budget <seconds>    Time budget per experiment (default: 300)
#   --provider <name>     AI provider for Claude Code (default: ark)
#   --max-runs <n>        Max experiments (default: 0 = unlimited)
#   --branch <name>       Git branch name (default: auto-generated)

set -euo pipefail

# ── Parse arguments ──────────────────────────────────────────────────────────
TARGET_FILE="${1:?Usage: autoresearch.sh <file> <metric> <run_cmd> <extract_cmd> [options]}"
METRIC_DESC="${2:?Missing metric description}"
RUN_CMD="${3:?Missing run command}"
EXTRACT_CMD="${4:?Missing metric extraction command}"
shift 4

BUDGET=300
PROVIDER="ark"
MAX_RUNS=0
BRANCH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --budget) BUDGET="$2"; shift 2 ;;
    --provider) PROVIDER="$2"; shift 2 ;;
    --max-runs) MAX_RUNS="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Setup ────────────────────────────────────────────────────────────────────
if [[ ! -f "$TARGET_FILE" ]]; then
  echo "Error: $TARGET_FILE not found"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d-%H%M)
if [[ -z "$BRANCH" ]]; then
  BRANCH="autoresearch/$(basename "$TARGET_FILE" | sed 's/\..*//')-$TIMESTAMP"
fi

RESULTS_FILE="autoresearch-results.tsv"
LOGFILE="autoresearch-run.log"
BEST_METRIC=""
RUN_NUM=0

echo "============================================"
echo "  autoresearch — Autonomous Experiment Loop"
echo "============================================"
echo "  File:     $TARGET_FILE"
echo "  Metric:   $METRIC_DESC"
echo "  Run:      $RUN_CMD"
echo "  Budget:   ${BUDGET}s per experiment"
echo "  Provider: $PROVIDER"
echo "  Branch:   $BRANCH"
echo "============================================"

# Create branch
git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH" 2>/dev/null || true

# Initialize results file
if [[ ! -f "$RESULTS_FILE" ]]; then
  echo -e "run\tcommit\tmetric\tstatus\tdescription" > "$RESULTS_FILE"
fi

# Get provider env vars
PROVIDER_ENV=""
if [[ "$PROVIDER" != "default" && "$PROVIDER" != "none" ]]; then
  PROVIDER_ENV=$(~/.claude/scripts/switch-provider.sh "$PROVIDER" --export 2>/dev/null || echo "")
fi

# ── Baseline ─────────────────────────────────────────────────────────────────
echo ""
echo "[baseline] Running baseline experiment..."
timeout "$BUDGET" bash -c "$RUN_CMD" > "$LOGFILE" 2>&1 || true
BEST_METRIC=$(bash -c "$EXTRACT_CMD" 2>/dev/null || echo "ERROR")
COMMIT=$(git rev-parse --short HEAD)
echo -e "0\t$COMMIT\t$BEST_METRIC\tbaseline\tinitial state" >> "$RESULTS_FILE"
echo "[#000] metric=$BEST_METRIC BASELINE"
echo ""

# ── Helper: compare metrics ──────────────────────────────────────────────────
# Returns 0 if $1 is better than $2 for the given metric direction
is_better() {
  local new="$1" old="$2"
  if [[ "$new" == "ERROR" || -z "$new" ]]; then return 1; fi
  if [[ "$old" == "ERROR" || -z "$old" ]]; then return 0; fi

  # Determine direction from metric description
  if echo "$METRIC_DESC" | grep -qi "minimize\|lower\|reduce\|less\|fewer\|smaller"; then
    python3 -c "exit(0 if float('$new') < float('$old') else 1)" 2>/dev/null
  else
    python3 -c "exit(0 if float('$new') > float('$old') else 1)" 2>/dev/null
  fi
}

# ── Main Loop ────────────────────────────────────────────────────────────────
NO_IMPROVE_STREAK=0

while true; do
  RUN_NUM=$((RUN_NUM + 1))

  if [[ "$MAX_RUNS" -gt 0 && "$RUN_NUM" -gt "$MAX_RUNS" ]]; then
    echo ""
    echo "Reached max runs ($MAX_RUNS). Stopping."
    break
  fi

  # ── THINK + EDIT (via AI agent) ──────────────────────────────────────────
  CURRENT_CODE=$(cat "$TARGET_FILE")
  PAST_RESULTS=$(tail -20 "$RESULTS_FILE")

  PROMPT="You are an autonomous research agent. Your goal: $METRIC_DESC

Target file: $TARGET_FILE
Current best metric: $BEST_METRIC

Past experiments (last 20):
$PAST_RESULTS

Current code:
\`\`\`
$CURRENT_CODE
\`\`\`

Make ONE specific, focused change to the code to improve the metric.
- Keep it simple. Small changes are better.
- Don't repeat changes that were already discarded.
- Output ONLY the complete modified file content, no explanations.
- If you have no more ideas, output the code unchanged."

  # Write prompt to temp file (avoids shell escaping issues)
  PROMPT_FILE=$(mktemp)
  echo "$PROMPT" > "$PROMPT_FILE"

  # Run AI agent to get modified code
  if [[ -n "$PROVIDER_ENV" ]]; then
    MODIFIED=$(env $PROVIDER_ENV claude -p "$(cat "$PROMPT_FILE")" --max-turns 1 --output-format text 2>/dev/null || cat "$TARGET_FILE")
  else
    MODIFIED=$(claude -p "$(cat "$PROMPT_FILE")" --max-turns 1 --output-format text 2>/dev/null || cat "$TARGET_FILE")
  fi
  rm -f "$PROMPT_FILE"

  # Extract code block if wrapped in markdown
  if echo "$MODIFIED" | grep -q '```'; then
    MODIFIED=$(echo "$MODIFIED" | sed -n '/^```/,/^```$/p' | sed '1d;$d')
  fi

  # Skip if no change
  if [[ "$MODIFIED" == "$CURRENT_CODE" ]]; then
    echo "[#$(printf '%03d' $RUN_NUM)] NO CHANGE — agent has no more ideas"
    NO_IMPROVE_STREAK=$((NO_IMPROVE_STREAK + 1))
    if [[ "$NO_IMPROVE_STREAK" -ge 20 ]]; then
      echo "No improvement in 20 consecutive runs. Consider stopping."
    fi
    sleep 2
    continue
  fi

  # Write modified code
  echo "$MODIFIED" > "$TARGET_FILE"

  # Get a brief description of the change
  DIFF_DESC=$(git diff --stat "$TARGET_FILE" 2>/dev/null | head -1)
  CHANGE_DESC=$(git diff "$TARGET_FILE" 2>/dev/null | head -20 | grep "^[+-]" | grep -v "^[+-][+-][+-]" | head -3 | tr '\n' ' ' | cut -c1-80)

  # Commit
  git add "$TARGET_FILE"
  git commit -m "autoresearch: experiment #$RUN_NUM" --no-verify -q 2>/dev/null || true
  COMMIT=$(git rev-parse --short HEAD)

  # ── RUN ──────────────────────────────────────────────────────────────────
  RUN_OK=true
  timeout "$BUDGET" bash -c "$RUN_CMD" > "$LOGFILE" 2>&1 || RUN_OK=false

  # ── MEASURE ──────────────────────────────────────────────────────────────
  NEW_METRIC=$(bash -c "$EXTRACT_CMD" 2>/dev/null || echo "ERROR")

  if [[ "$NEW_METRIC" == "ERROR" || -z "$NEW_METRIC" ]] && [[ "$RUN_OK" == "false" ]]; then
    # CRASH
    echo "[#$(printf '%03d' $RUN_NUM)] metric=ERROR CRASH — $CHANGE_DESC"
    echo -e "$RUN_NUM\t$COMMIT\tERROR\tcrash\t$CHANGE_DESC" >> "$RESULTS_FILE"
    git reset --hard HEAD~1 -q 2>/dev/null
    NO_IMPROVE_STREAK=$((NO_IMPROVE_STREAK + 1))
    continue
  fi

  # ── DECIDE ───────────────────────────────────────────────────────────────
  if is_better "$NEW_METRIC" "$BEST_METRIC"; then
    # KEEP
    DELTA=$(python3 -c "print(f'{float(\"$NEW_METRIC\") - float(\"$BEST_METRIC\"):+.6f}')" 2>/dev/null || echo "?")
    BEST_METRIC="$NEW_METRIC"
    echo "[#$(printf '%03d' $RUN_NUM)] metric=$NEW_METRIC (delta=$DELTA) KEEP — $CHANGE_DESC"
    echo -e "$RUN_NUM\t$COMMIT\t$NEW_METRIC\tkeep\t$CHANGE_DESC" >> "$RESULTS_FILE"
    NO_IMPROVE_STREAK=0
  else
    # DISCARD
    DELTA=$(python3 -c "print(f'{float(\"$NEW_METRIC\") - float(\"$BEST_METRIC\"):+.6f}')" 2>/dev/null || echo "?")
    echo "[#$(printf '%03d' $RUN_NUM)] metric=$NEW_METRIC (delta=$DELTA) DISCARD — $CHANGE_DESC"
    echo -e "$RUN_NUM\t$COMMIT\t$NEW_METRIC\tdiscard\t$CHANGE_DESC" >> "$RESULTS_FILE"
    git reset --hard HEAD~1 -q 2>/dev/null
    NO_IMPROVE_STREAK=$((NO_IMPROVE_STREAK + 1))
  fi

  if [[ "$NO_IMPROVE_STREAK" -ge 20 ]]; then
    echo ""
    echo "No improvement in 20 consecutive runs. Consider stopping (Ctrl+C)."
    echo "Continuing anyway..."
  fi
done

echo ""
echo "============================================"
echo "  autoresearch complete"
echo "  Best metric: $BEST_METRIC"
echo "  Total runs: $RUN_NUM"
echo "  Results: $RESULTS_FILE"
echo "  Branch: $BRANCH"
echo "============================================"
