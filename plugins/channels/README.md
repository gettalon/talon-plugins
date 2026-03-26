# Talon Channels

Universal channel plugin for Claude Code. Connect **any** client — via the built-in WebSocket server or through 21 platform-specific adapters including Telegram, Discord, Slack, WhatsApp, and more.

Built on the [`@gettalon/channels-sdk`](https://www.npmjs.com/package/@gettalon/channels-sdk).

## Install

```bash
/plugin install channels@gettalon-talon-plugins
```

During research preview (channels require dev mode):

```bash
claude --dangerously-load-development-channels plugin:channels@gettalon-talon-plugins
```

## Features

- **22 channel adapters** — WebSocket (default) + 21 platform-specific channels
- **Bidirectional chat** — Send messages to Claude, receive replies
- **All 23 hook events** — See everything Claude does in real-time
- **Permission relay** — Approve/deny tool execution from any connected client
- **Multi-client** — Multiple clients connected simultaneously with independent modes
- **Client modes** — `chat`, `monitor`, `full`, or `custom` with category filtering

## Supported Channels

| Channel | Adapter | Description |
|---------|---------|-------------|
| `websocket` | Built-in (default) | Universal WebSocket server — any client can connect |
| `telegram` | @gettalon/channels-sdk | Telegram Bot API |
| `discord` | @gettalon/channels-sdk | Discord bot via discord.js |
| `slack` | @gettalon/channels-sdk | Slack Bot (Socket Mode / Events API) |
| `whatsapp` | @gettalon/channels-sdk | WhatsApp Business API |
| `signal` | @gettalon/channels-sdk | Signal Messenger via signal-cli |
| `imessage` | @gettalon/channels-sdk | iMessage (macOS only) |
| `irc` | @gettalon/channels-sdk | IRC networks |
| `googlechat` | @gettalon/channels-sdk | Google Chat (Workspace) |
| `line` | @gettalon/channels-sdk | LINE Messaging API |
| `feishu` | @gettalon/channels-sdk | Feishu / Lark |
| `matrix` | @gettalon/channels-sdk | Matrix protocol (Element, etc.) |
| `mattermost` | @gettalon/channels-sdk | Mattermost |
| `msteams` | @gettalon/channels-sdk | Microsoft Teams |
| `bluebubbles` | @gettalon/channels-sdk | BlueBubbles (iMessage bridge) |
| `nostr` | @gettalon/channels-sdk | Nostr protocol |
| `nextcloud-talk` | @gettalon/channels-sdk | Nextcloud Talk |
| `synology-chat` | @gettalon/channels-sdk | Synology Chat |
| `tlon` | @gettalon/channels-sdk | Tlon (Urbit) |
| `twitch` | @gettalon/channels-sdk | Twitch chat |
| `zalo` | @gettalon/channels-sdk | Zalo Official Account API |
| `zalouser` | @gettalon/channels-sdk | Zalo User API |

## Choosing a Channel

Set the `TALON_CHANNEL` environment variable to pick which adapter to use. The default is `websocket`.

### In your MCP config (`.mcp.json`):

```json
{
  "channels": {
    "command": "npx",
    "args": ["-y", "-p", "@gettalon/channels-sdk", "channels"],
    "env": {
      "TALON_CHANNEL": "telegram"
    }
  }
}
```

### Or set it in your shell:

```bash
export TALON_CHANNEL=discord
```

Each platform adapter has its own required environment variables (API tokens, bot tokens, etc.). See the `@gettalon/channels-sdk` docs for per-channel configuration.

## WebSocket Mode (Default)

When `TALON_CHANNEL=websocket` (or unset), the plugin runs a local WebSocket server.

### Connecting

```
ws://localhost:21568/ws?token=TOKEN&mode=full&name=my-client
```

Get your token:
```bash
cat ~/.talon/channels_token
# or
curl -s -X POST http://localhost:21568/auth/local
```

### Protocol

#### Receive events

```json
{"seq": 1, "payload": {"type": "event", "event": "hook_event", "data": {"type": "hook_event", "hook_event_name": "PreToolUse", "data": {...}}}}
```

#### Send chat messages

```json
{"type": "chat_message", "text": "Hello!", "chat_id": "my-chat"}
```

#### Permission verdicts

```json
{"type": "permission_verdict", "request_id": "req-123", "behavior": "allow"}
```

#### Switch modes

```json
{"type": "set_mode", "mode": "custom", "categories": ["tools", "permissions"]}
```

### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status |
| `/auth/local` | POST | Get auth token |
| `/clients` | GET | List connected clients |

## Platform Adapter Mode

When `TALON_CHANNEL` is set to a platform name (e.g., `telegram`, `discord`), the plugin uses the corresponding adapter from `@gettalon/channels-sdk`. The WebSocket server is not started — instead, the adapter connects directly to the platform's API.

Each adapter handles:
- Authentication with the platform
- Receiving messages and forwarding them to Claude Code
- Sending Claude's replies back to the platform
- Hook event forwarding (where supported)
- Permission relay (where supported)

Refer to the [`@gettalon/channels-sdk` documentation](https://www.npmjs.com/package/@gettalon/channels-sdk) for per-adapter setup instructions and required environment variables.
