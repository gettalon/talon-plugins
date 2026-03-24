# Talon Plugins for Claude Code

Give Claude Code eyes and hands — control your browser and your computer. Open source, no API keys, works in 60 seconds.

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

### Browser Control — 15 MCP tools for Chrome

Claude sees your browser, reads pages, fills forms, clicks buttons, takes screenshots — through real Chrome DevTools Protocol. Not headless, not simulated. Your actual Chrome.

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

### Computer Use — Desktop automation

Claude controls your Mac — move mouse, click, type, press keys, take screenshots, manage windows. Native Quartz events, not accessibility hacks.

- **Mouse** — move, click, double-click, right-click, drag
- **Keyboard** — type text, press keys, keyboard shortcuts
- **Screenshots** — capture screen, specific windows, or regions
- **Windows** — list, focus, resize, move windows
- **Clipboard** — read and write clipboard content
- **System** — display info, process list, volume control

### Two-Way Chat — Chrome side panel channel

Talk to Claude from Chrome. See what Claude is doing in real-time.

```bash
# Enable chat (Claude Code channels, research preview)
claude --dangerously-load-development-channels plugin:browser-control@gettalon-talon-plugins
```

- Chat with Claude from Chrome's side panel
- See tool actions as they happen (navigate, click, screenshot...)
- Send screenshots, selected text, picked elements as context
- Claude replies back in the side panel

## How It Works

```
Claude Code ←stdio→ talon-mcp ←WebSocket→ Chrome Extension ←CDP→ Browser
                                                                    ↓
Claude Code ←stdio→ talon-computer ←native events→ macOS Desktop
```

- **MCP server** — `npx @gettalon/mcp`, auto-starts with the plugin
- **Chrome extension** — bundled, load as unpacked in 30 seconds
- **Session reuse** — multiple Claude Code sessions share one server
- **Port stable** — Chrome extension stays connected across sessions

## Use Cases

**QA & Testing**
```
Open staging.myapp.com, fill the login form, submit, screenshot the dashboard
```

**Web Scraping**
```
Navigate to the pricing page, extract all plan names and prices into a table
```

**Form Automation**
```
Fill out the entire registration form with test data and submit
```

**Performance Audit**
```
Run a Lighthouse audit on my homepage and tell me the key metrics
```

**Desktop Automation**
```
Open Terminal, type "npm test", screenshot the results
```

**Live Debugging**
```
Open the browser console, navigate to my app, and show me any JavaScript errors
```

## Compared to

| | Talon | Chrome DevTools MCP | Playwright | Claude Computer Use |
|---|---|---|---|---|
| Real Chrome | Yes (extension) | Yes (Puppeteer) | Headless | No |
| Desktop control | Yes (native) | No | No | Yes (cloud) |
| Two-way chat | Yes (channels) | No | No | No |
| Live tool display | Yes (side panel) | No | No | No |
| Local machine | Yes | Yes | Yes | No (cloud VM) |
| Claude Code plugin | Yes | No | No | No |
| Extension needed | Yes | No | No | No |

## Links

- **GitHub**: https://github.com/gettalon/talon-plugins
- **npm**: https://www.npmjs.com/package/@gettalon/mcp
- **Issues**: https://github.com/gettalon/talon-plugins/issues

## License

MIT
