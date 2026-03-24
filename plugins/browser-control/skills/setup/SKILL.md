---
description: Guide users through Chrome extension setup for browser control. Use when user asks about setup, installing the extension, connecting Chrome, or when browser_control tools return "No browser connected".
disable-model-invocation: false
---

# Browser Control Setup Guide

Help the user set up the Talon Browser Control Chrome extension so Claude Code can control their browser.

## Steps

### 1. Find the Chrome Extension

The extension is bundled with this plugin. Tell the user:

> The Chrome extension is included with the browser-control plugin. You need to load it as an unpacked extension in Chrome.
>
> The extension files are at:
> `~/.claude/plugins/cache/gettalon-talon-plugins/browser-control/*/chrome-extension/`

Use the Bash tool to find the exact path:
```bash
ls -d ~/.claude/plugins/cache/gettalon-talon-plugins/browser-control/*/chrome-extension/
```

### 2. Load in Chrome

Guide the user through these steps:

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (toggle in the top right)
3. Click **"Load unpacked"**
4. Select the `chrome-extension` folder from the path above
5. The extension icon should appear in the Chrome toolbar

### 3. Verify Connection

Once loaded, the extension will auto-connect to the MCP server. Verify by running:

```
browser_control with action: "get_tabs"
```

If it returns tabs, the connection is working.

### 4. Troubleshooting

**"No browser connected"**: The extension isn't connected. Check:
- Is the extension loaded and enabled in `chrome://extensions`?
- Is Chrome running?
- Try reloading the extension (click the reload icon in `chrome://extensions`)

**"Cannot access a chrome:// URL"**: The active tab is a Chrome internal page. Switch to a regular tab first using `switch_tab`.

**"Debugger is not attached"**: The CDP debugger needs to attach. Navigate to a URL first — the debugger attaches automatically.

### 5. What You Can Do

Once connected, Claude can:
- **Navigate** — load any URL
- **Click** — click elements by CSS selector, text, or accessibility ref
- **Fill forms** — type into input fields
- **Screenshot** — capture pages with compression
- **Execute JS** — run JavaScript in the page
- **Manage tabs** — open, close, switch tabs
- **Read pages** — get page info, extract content, accessibility tree
- **Monitor** — network requests, console logs, errors
- And 30+ more actions

### 6. Chat from Chrome

Users can also chat with Claude from the Chrome extension's side panel:
1. Click the extension icon or right-click → "Open side panel"
2. Type a message — it arrives in Claude Code as a channel notification
3. Claude can reply back to the side panel

**Note**: Chat requires starting Claude Code with:
```
claude --dangerously-load-development-channels plugin:browser-control@gettalon-talon-plugins
```
