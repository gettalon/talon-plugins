# Browser Control Plugin

Full browser control via Chrome DevTools Protocol + two-way chat for Claude Code.

## What it does

**Browser Control** — 40 CDP actions:
- Navigate, click, fill forms, type text, keyboard shortcuts
- Screenshots (compressed JPEG), execute JavaScript
- Manage tabs, read pages, accessibility tree snapshots
- Network monitoring, console/error logs, cookies
- Device emulation, geolocation, viewport, offline mode

**Two-Way Chat** — Claude Code channel (research preview):
- Chat with Claude from Chrome's side panel
- See Claude's browser actions in real-time
- Send messages with page context (URL, title, selected text)

## Quick Start

### 1. Install the plugin

```bash
/plugin marketplace add gettalon/talon-plugins
/plugin install browser-control@gettalon-talon-plugins
/reload-plugins
```

### 2. Set up Chrome extension

Run the setup skill — it copies the extension to Downloads and guides you:

```
/browser-control:setup
```

Or manually:
1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked**
4. Select `~/Downloads/talon-browser-control`

### 3. Use browser control

```
Navigate to https://example.com and tell me what's on the page
Take a screenshot of the current tab
Click the "Sign In" button
Fill the email field with test@example.com
```

### 4. Enable chat (optional)

Chat uses Claude Code's **channels** feature (research preview, v2.1.80+):

```bash
claude --dangerously-load-development-channels plugin:browser-control@gettalon-talon-plugins
```

Then open the extension's side panel to chat with Claude.

## Available Actions

| Action | Description |
|--------|-------------|
| `navigate` | Load a URL |
| `click` | Click by selector, text, or accessibility ref |
| `fill` | Fill input fields |
| `type_text` | Type character by character |
| `keyboard` | Press keys/combos (Enter, Control+a) |
| `execute_js` | Run JavaScript in the page |
| `screenshot` | Capture page (JPEG compressed) |
| `get_page_info` | Get URL, title, links, forms |
| `snapshot` | Accessibility tree with clickable refs |
| `extract` | Extract HTML/text content |
| `scroll` | Scroll page or element |
| `hover` | Hover over element |
| `get_tabs` | List open tabs |
| `switch_tab` | Switch to a tab |
| `new_tab` / `close_tab` | Tab management |
| `get_cookies` | Read cookies |
| `set_viewport` | Set viewport size |
| `emulate_device` | Emulate mobile device |
| `set_geolocation` | Override geolocation |
| `network_enable` | Start network monitoring |
| `get_network_log` | Get captured requests |
| `set_headers` | Set custom HTTP headers |
| `set_offline` | Toggle offline mode |
| `wait` / `wait_for_network` / `wait_for_stable` | Wait conditions |
| `get_console` / `get_errors` | Console/error logs |
| `highlight_element` / `get_box_model` | Element inspection |
| `get_metrics` | Performance metrics |
| `emulate_media` | Print/screen emulation |
| `handle_dialog` | Handle alerts/confirms |
| `drag_drop` | Drag and drop elements |
| `bulk_actions` | Run multiple actions at once |

## npm

The MCP server is also available standalone:

```bash
npx @gettalon/mcp
```

## License

MIT
