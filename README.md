# Talon Plugins for Claude Code

Give Claude Code eyes and hands in your browser. Open source, no API keys, works in 60 seconds.

## Quick Start

```bash
# Install (30 seconds)
/plugin marketplace add gettalon/talon-plugins
/plugin install browser-control@gettalon-talon-plugins
/reload-plugins

# Set up Chrome extension
/browser-control:setup

# Try it — ask Claude to browse
Navigate to https://example.com and tell me what's on the page
Take a screenshot of the current tab
Click the "Learn more" link
Fill the search box with "Claude Code" and press Enter
```

Stop there. You'll know if this is for you.

## What You Get

**15 browser tools** — not one mega-tool, each does one thing well:

| Tool | What it does |
|------|-------------|
| `browser_navigate` | Go to URLs, back/forward |
| `browser_click` | Click by selector, text, or accessibility ref |
| `browser_type` | Fill inputs, type text, keyboard shortcuts |
| `browser_read_page` | Page info, accessibility snapshot, extract content |
| `browser_screenshot` | Capture page or elements (compressed JPEG) |
| `browser_execute_js` | Run JavaScript in the page |
| `browser_tabs` | List, open, close, switch tabs |
| `browser_scroll` | Scroll, hover, drag and drop |
| `browser_network` | Monitor requests, set headers, go offline |
| `browser_console` | Read console logs and errors |
| `browser_emulate` | Device emulation, viewport, geolocation |
| `browser_performance` | Performance traces, Lighthouse audit, memory |
| `browser_form` | Fill entire forms, upload files, handle dialogs |
| `browser_inspect` | Highlight elements, box model, cookies |
| `browser_wait` | Wait for elements, network idle, page stable |

**Two-way chat** — talk to Claude from Chrome's side panel:
```bash
# Enable chat (channels research preview)
claude --dangerously-load-development-channels plugin:browser-control@gettalon-talon-plugins
```

**Real-time tool display** — see what Claude is doing in your browser, live in the side panel.

## How It Works

```
Claude Code ←stdio→ talon-mcp (Node.js) ←WebSocket→ Chrome Extension ←CDP→ Browser
```

- **MCP server** (`@gettalon/mcp`) — runs via npx, no install needed
- **Chrome extension** — bundled with the plugin, load as unpacked
- **Chrome DevTools Protocol** — real browser control, not headless
- **Session reuse** — multiple Claude Code sessions share one server, Chrome stays connected

## Also on npm

```bash
npx @gettalon/mcp
```

Use standalone as an MCP server in any tool that supports MCP.

## Compared to

| | Talon | Chrome DevTools MCP | Playwright |
|---|---|---|---|
| Real Chrome | Yes (extension) | Yes (Puppeteer) | Headless |
| Two-way chat | Yes (channels) | No | No |
| Live tool display | Yes (side panel) | No | No |
| Attachments | Screenshot, element, selection | No | No |
| Performance traces | Yes | Yes | No |
| Extension needed | Yes | No | No |
| Claude Code plugin | Yes | No | No |

## Links

- **GitHub**: https://github.com/gettalon/talon-plugins
- **npm**: https://www.npmjs.com/package/@gettalon/mcp
- **Issues**: https://github.com/gettalon/talon-plugins/issues

## License

MIT
