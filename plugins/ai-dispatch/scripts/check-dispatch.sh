#!/usr/bin/env bash
# Check status of ark dispatches
# Usage:
#   dcheck --list              # list all dispatches
#   dcheck --latest            # check most recent
#   dcheck <output-file>       # check specific output file

set -euo pipefail

REGISTRY="/tmp/ark-dispatches.jsonl"

if [[ "${1:-}" == "--list" ]]; then
  [[ ! -f "$REGISTRY" ]] && { echo "No dispatches yet"; exit 0; }
  echo "ID                    Backend        Status   Prompt"
  echo "─────────────────────────────────────────────────────────────────"
  while IFS= read -r line; do
    python3 -c "
import json, os
d = json.loads('''$line''')
pid = d.get('pid', 0)
try:
    os.kill(pid, 0)
    status = '⏳'
except:
    status = '✅'
print(f\"{d.get('id','?'):<22s} {d.get('backend','?'):<14s} {status:<8s} {d.get('prompt','')[:50]}\")
" 2>/dev/null || true
  done < "$REGISTRY"
  exit 0
fi

if [[ "${1:-}" == "--latest" ]]; then
  OUTPUT=$(ls -t /private/tmp/claude-*/*/tasks/*.output 2>/dev/null | head -1)
  [[ -z "$OUTPUT" ]] && { echo "No dispatch output files found"; exit 1; }
else
  OUTPUT="${1:?Usage: dcheck <output-file|--list|--latest>}"
fi

[[ ! -f "$OUTPUT" ]] && { echo "File not found: $OUTPUT"; exit 1; }

# Extract task ID from path
TASK_ID=$(basename "$OUTPUT" .output)

python3 - "$OUTPUT" << 'PYEOF'
import json, sys, os

events = []
for line in open(sys.argv[1]):
    line = line.strip()
    if not line: continue
    try:
        events.append(json.loads(line))
    except: pass

# Session info
session_id = ""
for e in events:
    if e.get('type') == 'system' and 'session_id' in e:
        session_id = e['session_id'][:12]
        break

# Count stats
tool_calls = sum(1 for e in events if e.get('type')=='assistant'
    and any(c.get('type')=='tool_use' for c in e.get('message',{}).get('content',[])))
results = [e for e in events if e.get('type') == 'result']
is_running = not bool(results)

# Status
status = "⏳ Running" if is_running else "✅ Complete"

print(f"┌─ Dispatch {status}")
if session_id:
    print(f"│  Session: {session_id}…")
print(f"│  Events: {len(events)}  Tools: {tool_calls}")

# Show last few tool calls
recent_tools = []
for e in events:
    if e.get('type') == 'assistant':
        for c in e.get('message',{}).get('content',[]):
            if c.get('type') == 'tool_use':
                recent_tools.append(c.get('name', c.get('tool_name', '?')))

if recent_tools:
    shown = recent_tools[-5:]
    print(f"│  Recent: {' → '.join(shown)}")

# Result
if results:
    r = results[-1].get('result', '')
    try:
        d = json.loads(r) if isinstance(r, str) else r
        if isinstance(d, dict):
            print(f"├─ Summary")
            print(f"│  {d.get('summary','N/A')}")
            files = d.get('changed_files', [])
            if files:
                print(f"├─ Changed: {', '.join(files)}")
            findings = d.get('findings', [])
            if findings:
                print(f"├─ Findings")
                for f in findings[:5]:
                    print(f"│  • {f[:80]}")
        else:
            print(f"├─ Result")
            print(f"│  {str(r)[:200]}")
    except:
        # Plain text result
        print(f"├─ Result")
        for line in str(r).split('\n')[:5]:
            print(f"│  {line[:80]}")
else:
    # Show latest text from assistant
    for e in reversed(events):
        if e.get('type') == 'assistant':
            for c in e.get('message',{}).get('content',[]):
                if c.get('type') == 'text' and c.get('text','').strip():
                    print(f"├─ Latest")
                    print(f"│  {c['text'][:120]}")
                    break
            break

print(f"└─")
PYEOF
