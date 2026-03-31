# Talon Plugins for Claude Code

Give Claude Code eyes and hands — control your browser and your computer. Open source, no API keys, works in 60 seconds.

## Quick Start

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/gettalon/talon-plugins/master/scripts/setup.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/gettalon/talon-plugins/master/scripts/setup.ps1 | iex
```

Each tool gets **MCP + Skills** automatically:

| Tool | MCP (browser) | Skills | Config |
|------|:---:|:---:|--------|
| **Codex** | Yes | `~/.agents/skills/` | `~/.codex/config.toml` |
| **Cursor** | Yes | `~/.agents/skills/` | `~/.cursor/mcp.json` |
| **Windsurf** | Yes | `~/.agents/skills/` | `~/.windsurf/mcp.json` |
| **Gemini CLI** | Yes | `~/.gemini/commands/` | `~/.gemini/settings.json` |
| **Claude Code** | Yes | Full plugin marketplace | `~/.claude/plugins/` |

**What gets installed:**
- **MCP:** `talon-browser` — Chrome DevTools Protocol, 15 browser tools
- **Skills:** gitlab-scrum, gitlab-sprint, gitlab-board, gitlab-wiki, ai-dispatch, autoresearch
- **Claude Code extra:** computer-use, plugin marketplace with all plugins

Then try it:
```
Navigate to https://example.com and tell me what's on the page
Take a screenshot of the current tab
Click the "Learn more" link
```

Stop there. You'll know if this is for you.

## What You Get

### Plugins

| Plugin | What | Install |
|--------|------|---------|
| **browser-control** | 15 MCP tools for Chrome — read, click, fill, screenshot | `/plugin install browser-control@gettalon-talon-plugins` |
| **computer-use** | macOS desktop automation — mouse, keyboard, windows | `/plugin install computer-use@gettalon-talon-plugins` |
| **ai-dispatch** | Route tasks to 7 AI backends (Doubao, DeepSeek, GLM...) | `/plugin install ai-dispatch@gettalon-talon-plugins` |
| **gitlab-scrum** | GitLab Scrum — issues, sprints, boards, wiki via glab | `/plugin install gitlab-scrum@gettalon-talon-plugins` |
| **channels** | 22 channel adapters — WebSocket, Telegram, Discord, Slack, etc. | `/plugin install hub@gettalon-talon-plugins` |
| **autoresearch** | Autonomous edit-test-measure loop | `/plugin install autoresearch@gettalon-talon-plugins` |

---

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

### AI Dispatch — Multi-backend AI routing

Route tasks to the best AI model. Doubao, DeepSeek, Kimi, MiniMax, GLM — all through one `dispatch` command.

```bash
/plugin install ai-dispatch@gettalon-talon-plugins

dispatch ark-code "review this code"       # Doubao Seed 2.0 Code
dispatch ark-minimax "analyze this"         # MiniMax M2.5
dispatch glm "translate to Chinese"         # GLM-5
dispatch ark-deepseek "complex reasoning"   # DeepSeek V3.2
dispatch ark-kimi "long context analysis"   # Kimi K2.5
```

| Backend | Model | Best for |
|---------|-------|----------|
| `ark-code` | Doubao Seed 2.0 Code | Code generation, review |
| `ark-pro` | Doubao Seed 2.0 Pro | General reasoning |
| `ark-minimax` | MiniMax M2.5 | Analysis, research |
| `ark-kimi` | Kimi K2.5 | Long context |
| `ark-deepseek` | DeepSeek V3.2 | Complex reasoning |
| `glm` | GLM-5 | Chinese language |
| `ark-auto` | Auto routing | Smart model selection |

### GitLab Scrum — Project management via glab CLI

Full Scrum/Kanban workflow for GitLab — issues, sprints, boards, wiki — all from the terminal.

```bash
/plugin install gitlab-scrum@gettalon-talon-plugins

# Sprint planning
/gitlab-sprint plan Sprint 2026-W14

# Issue management
/gitlab-scrum create issue "Implement feature X" --label "To Do"

# Board management
/gitlab-board setup

# Wiki with Mermaid diagrams
/gitlab-wiki create "Architecture" with sequence diagram
```

| Skill | What it does |
|-------|-------------|
| `/gitlab-scrum` | Issues, labels, milestones — core CRUD |
| `/gitlab-sprint` | Sprint lifecycle — create, populate, track, close |
| `/gitlab-board` | Kanban board setup and issue movement |
| `/gitlab-wiki` | Wiki pages with Mermaid diagram support |

Requires: `glab` CLI (`brew install glab`) + `glab auth login`

### Autoresearch — Autonomous research loop

Iteratively edit, test, measure, keep/discard. Autonomous optimization with any AI backend.

```bash
/plugin install autoresearch@gettalon-talon-plugins

/autoresearch src/model.py accuracy --budget 10m --provider ark
```

### Hub — 22 platform adapters

Connect Claude Code to any messaging platform. WebSocket (default) for custom integrations, or use built-in adapters for Telegram, Discord, Slack, WhatsApp, and 17 more.

```bash
/plugin install hub@gettalon-talon-plugins

# Development mode (research preview)
claude --dangerously-load-development-channels plugin:hub@gettalon-talon-plugins
```

| Channel | What it does |
|---------|-------------|
| `websocket` | Universal WebSocket server — browser, mobile, desktop clients |
| `telegram` | Telegram Bot API |
| `discord` | Discord bot |
| `slack` | Slack Bot (Socket Mode) |
| `whatsapp` | WhatsApp Business API |
| `imessage` | iMessage (macOS only) |
| `msteams` | Microsoft Teams |
| + 15 more | IRC, Matrix, Signal, LINE, Feishu, Twitch, Nostr... |

Built on [`@gettalon/channels-sdk`](https://www.npmjs.com/package/@gettalon/channels-sdk).

### Two-Way Chat — Chrome side panel channel

Talk to Claude from Chrome. See what Claude is doing in real-time.

```bash
# Enable chat (Claude Code hub, research preview)
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
| Two-way chat | Yes (22 adapters) | No | No | No |
| Live tool display | Yes (side panel) | No | No | No |
| Local machine | Yes | Yes | Yes | No (cloud VM) |
| Claude Code plugin | Yes | No | No | No |
| Extension needed | Yes | No | No | No |

## Works With

Built on MCP standard — works with any AI coding tool.

```bash
npx @gettalon/cli setup   # Auto-detects and configures all
```

| Feature | Claude Code | Codex | Cursor | Windsurf | Gemini CLI |
|---------|:-----------:|:-----:|:------:|:--------:|:----------:|
| 15 browser MCP tools | Yes | Yes | Yes | Yes | Yes |
| Chrome extension | Yes | Yes | Yes | Yes | Yes |
| Desktop automation | Yes | — | — | — | — |
| Two-way chat (channels) | Yes | — | — | — | — |
| AI Dispatch (7 backends) | Yes | — | — | — | — |
| GitLab Scrum | Yes | — | — | — | — |
| Plugin marketplace | Yes | — | — | — | — |

Manual config (if you prefer):
```bash
# Any MCP client — just point to:
npx -y @gettalon/mcp@2
```

## Links

- **GitHub**: https://github.com/gettalon/talon-plugins
- **npm**: https://www.npmjs.com/package/@gettalon/mcp
- **Issues**: https://github.com/gettalon/talon-plugins/issues

## License

MIT
