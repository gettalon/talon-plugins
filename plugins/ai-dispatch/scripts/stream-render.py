#!/usr/bin/env python3
"""Render stream-json output in real-time, human-readable format.
Formats tool_use, tool_result, text, thinking, and result events."""
import json, sys, os

tool_count = 0
text_count = 0
pending_tools = {}  # call_id → tool_name
start_time = None

# Colors (ANSI)
DIM = "\033[2m"
BOLD = "\033[1m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
CYAN = "\033[36m"
RESET = "\033[0m"

# Disable colors if not a tty
if not sys.stderr.isatty():
    DIM = BOLD = GREEN = YELLOW = RED = CYAN = RESET = ""

def truncate(s, n=120):
    s = s.replace("\n", " ")
    return s[:n] + "…" if len(s) > n else s

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        e = json.loads(line)
    except:
        continue

    t = e.get("type", "")

    if t == "system":
        sub = e.get("subtype", "")
        if sub == "init":
            sid = e.get("session_id", "")[:12]
            model = e.get("model", "")
            print(f"┌─ {BOLD}Dispatch{RESET} {DIM}session={sid}…{RESET}", flush=True)
        elif sub == "hook_started":
            pass  # skip hooks

    elif t == "assistant":
        content = e.get("message", {}).get("content", [])
        for c in content:
            ct = c.get("type", "")
            if ct == "text":
                text = c.get("text", "").strip()
                if text:
                    text_count += 1
                    lines = text.split("\n")
                    for tl in lines[:8]:
                        print(f"│  {tl}", flush=True)
                    if len(lines) > 8:
                        print(f"│  {DIM}… +{len(lines)-8} lines{RESET}", flush=True)

            elif ct == "tool_use":
                tool_count += 1
                name = c.get("name", c.get("tool_name", "?"))
                call_id = c.get("id", c.get("call_id", ""))
                args = c.get("input", {})
                pending_tools[call_id] = name

                # Format args summary
                arg_summary = ""
                if isinstance(args, dict):
                    if "command" in args:
                        arg_summary = truncate(args["command"], 80)
                    elif "file_path" in args:
                        arg_summary = args["file_path"]
                    elif "pattern" in args:
                        arg_summary = f'"{args["pattern"]}"'
                        if "path" in args:
                            arg_summary += f' in {args["path"]}'
                    elif "old_string" in args:
                        arg_summary = truncate(args["old_string"], 60)
                    elif "content" in args and "file_path" in args:
                        arg_summary = args["file_path"]
                    else:
                        keys = list(args.keys())[:3]
                        arg_summary = ", ".join(f"{k}={truncate(str(args[k]),30)}" for k in keys)

                print(f"│  {GREEN}●{RESET} {BOLD}{name}{RESET}{DIM}({arg_summary}){RESET}", flush=True)

            elif ct == "thinking":
                text = c.get("thinking", "").strip()
                if text:
                    first_line = text.split("\n")[0][:100]
                    print(f"│  {CYAN}▸ Thinking{RESET} {DIM}{first_line}{RESET}", flush=True)

    elif t == "user":
        # Tool results
        content = e.get("message", {}).get("content", [])
        if isinstance(content, list):
            for c in content:
                if isinstance(c, dict) and c.get("type") == "tool_result":
                    call_id = c.get("tool_use_id", "")
                    tool_name = pending_tools.pop(call_id, "?")
                    output = str(c.get("content", ""))
                    is_error = c.get("is_error", False)

                    if is_error:
                        print(f"│    {RED}✗ {truncate(output, 100)}{RESET}", flush=True)
                    elif len(output) > 200:
                        print(f"│    {DIM}↳ {len(output)} chars{RESET}", flush=True)
                    elif output.strip():
                        lines = output.strip().split("\n")
                        print(f"│    {DIM}↳ {truncate(lines[0], 100)}{RESET}", flush=True)

    elif t == "result":
        r = e.get("result", "")
        print(f"├─ {BOLD}Result{RESET}", flush=True)
        try:
            d = json.loads(r) if isinstance(r, str) else r
            if isinstance(d, dict):
                print(f"│  {d.get('summary', 'Done')}", flush=True)
                files = d.get("changed_files", [])
                if files:
                    print(f"│  {GREEN}Changed: {', '.join(files)}{RESET}", flush=True)
                for f in d.get("findings", [])[:5]:
                    print(f"│  • {f[:100]}", flush=True)
            else:
                for tl in str(r).split("\n")[:5]:
                    print(f"│  {tl[:100]}", flush=True)
        except:
            for tl in str(r).split("\n")[:5]:
                print(f"│  {tl[:100]}", flush=True)
        print(f"└─ {tool_count} tools · {text_count} text blocks", flush=True)
