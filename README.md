# Talon Claude Plugins

Official Talon plugins for Claude Code. Open-source marketplace for browser control, automation, and more.

## Quick Start

```bash
# Add the marketplace
/plugin marketplace add gettalon/talon-plugins

# Install browser control
/plugin install browser-control@gettalon-talon-plugins

# Reload plugins
/reload-plugins
```

## Plugins

### browser-control

Full browser control via Chrome DevTools Protocol. Gives Claude Code the ability to:

- **Navigate** — load URLs, go back/forward
- **Click** — click elements by CSS selector or text
- **Fill** — type into input fields
- **Screenshot** — capture the page or specific elements
- **Execute JS** — run JavaScript in the page
- **Read page** — get page info, DOM content, accessibility tree
- **Manage tabs** — open, close, switch tabs
- **And more** — cookies, network monitoring, viewport, etc.

#### Setup

1. Install the plugin (see Quick Start above)
2. Open Chrome → `chrome://extensions` → Enable Developer Mode
3. Click "Load unpacked" → select the `chrome-extension` folder from the installed plugin
4. The Chrome extension will auto-connect to the MCP server

#### Usage

Just ask Claude to interact with your browser:

```
Navigate to https://example.com and tell me what's on the page
Take a screenshot of the current tab
Click the "Sign In" button
Fill the email field with test@example.com
```

## License

MIT
