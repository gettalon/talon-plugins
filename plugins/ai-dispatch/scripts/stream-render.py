#!/usr/bin/env python3
"""Render dispatch output.
Foreground: collapsed SubAgentCard with last 5 tools.
Background: all tools, no colors."""
import json, sys, os

tools = []
texts = []
result_data = None
has_error = False

# No ANSI colors in file output
is_tty = sys.stdout.isatty()
if is_tty:
    DIM, BOLD, GREEN, YELLOW, RED, RESET = "\033[2m", "\033[1m", "\033[32m", "\033[33m", "\033[31m", "\033[0m"
else:
    DIM = BOLD = GREEN = YELLOW = RED = RESET = ""

SHOW_LAST = 5

def trunc(s, n=80):
    s = str(s).replace("\n", " ").strip()
    return s[:n] + "…" if len(s) > n else s

def fmt_tool(name, args):
    if not isinstance(args, dict):
        return f"{name}({trunc(str(args), 60)})"
    for key in ["command", "file_path", "pattern", "prompt", "query", "skill"]:
        if key in args:
            if key == "pattern":
                s = f'"{trunc(args[key], 40)}"'
                if "path" in args: s += f', {args["path"]}'
                return f"{name}({s})"
            return f"{name}({trunc(str(args[key]), 60)})"
    keys = list(args.keys())[:2]
    if keys:
        return f"{name}({', '.join(f'{k}: {trunc(str(args[k]),30)}' for k in keys)})"
    return f"{name}()"

for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try: e = json.loads(line)
    except: continue

    t = e.get("type", "")

    if t == "system":
        sub = e.get("subtype", "")
        if sub == "api_retry":
            n, d = e.get("attempt", "?"), e.get("retry_delay_ms", 0) / 1000
            print(f"  ⟳ retry #{n} ({d:.0f}s)", flush=True)

    elif t == "error":
        msg = e.get("error", {}).get("message", e.get("message", str(e)))
        has_error = True
        result_data = {"summary": f"Error: {msg}"}

    elif t == "assistant":
        for c in e.get("message", {}).get("content", []):
            if c.get("type") == "tool_use":
                name = c.get("name", c.get("tool_name", "?"))
                tools.append(fmt_tool(name, c.get("input", {})))
                pass  # no live counter — Bash tool doesn't support \r
            elif c.get("type") == "text":
                text = c.get("text", "").strip()
                if text: texts.append(text)

    elif t == "result":
        r = e.get("result", "")
        try:
            result_data = json.loads(r) if isinstance(r, str) else r
            if not isinstance(result_data, dict):
                result_data = {"summary": str(r)[:200]}
        except:
            result_data = {"summary": str(r)[:200]}


# --- Output ---

title = ""
if result_data and isinstance(result_data, dict):
    title = result_data.get("summary", "")
if not title and texts:
    title = trunc(texts[0].split("\n")[0], 80)
title = title or "Dispatch"

status = "failed" if has_error else "done"

if is_tty:
    # Foreground: collapsed, last 5 tools
    print(f"  {BOLD}{title}{RESET}")
    if tools:
        shown = tools[-SHOW_LAST:]
        skipped = len(tools) - SHOW_LAST
        if skipped > 0:
            print(f"  ⎿  {DIM}+{skipped} earlier tool uses{RESET}")
        for t in shown:
            print(f"  ⎿  {t}")
    if result_data and isinstance(result_data, dict):
        files = result_data.get("changed_files", [])
        if files:
            print(f"  {GREEN}Changed: {', '.join(files)}{RESET}")
    print(f"  {DIM}{len(tools)} tools · {status}{RESET}")
else:
    # Background file: all tools, no colors
    print(f"  {title}")
    print(f"  ---")
    for t in tools:
        print(f"  ● {t}")
    if result_data and isinstance(result_data, dict):
        files = result_data.get("changed_files", [])
        if files:
            print(f"  Changed: {', '.join(files)}")
        for f in result_data.get("findings", [])[:5]:
            print(f"  • {trunc(f, 100)}")
    print(f"  ---")
    print(f"  {len(tools)} tools · {status}")

if has_error:
    sys.exit(1)
