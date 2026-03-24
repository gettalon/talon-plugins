# Browser Control Plugin

Full browser control via Chrome DevTools Protocol for Claude Code.

## What it does

Gives Claude Code the ability to control Chrome:
- Navigate to URLs
- Click elements by CSS selector or text
- Fill form inputs
- Take screenshots
- Run JavaScript in the page
- Manage tabs (open, close, switch)
- Read page info, cookies, DOM content
- Monitor network requests
- Access accessibility tree

## Setup

### 1. Install the plugin

```bash
/plugin marketplace add gettalon/talon-plugins
/plugin install browser-control@gettalon-talon-plugins
```

### 2. Load the Chrome extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder from this plugin

The extension will auto-connect to the MCP server.

### 3. Use it

Ask Claude to interact with your browser:

```
Navigate to https://example.com and tell me what's on the page
Take a screenshot of the current tab
Click the "Sign In" button
Fill the email field with test@example.com
Run document.title in the browser console
```

## Available Actions

| Action | Description |
|--------|-------------|
| `navigate` | Load a URL |
| `click` | Click element by selector or text |
| `fill` | Type into input fields |
| `execute_js` | Run JavaScript in the page |
| `screenshot` | Capture page or element |
| `get_page_info` | Get URL, title, meta |
| `scroll` | Scroll page or element |
| `hover` | Hover over element |
| `type_text` | Type text character by character |
| `keyboard` | Press keyboard keys |
| `get_tabs` | List open tabs |
| `switch_tab` | Switch to a tab |
| `new_tab` | Open new tab |
| `close_tab` | Close a tab |
| `get_cookies` | Read cookies |
| `snapshot` | Accessibility tree snapshot |
| `extract` | Extract page content |
| `wait` | Wait for element/condition |
| `bulk_actions` | Run multiple actions |

## License

MIT
