#!/usr/bin/env node
// Lightweight MCP server for persistent agents.
// Connects to hub via Unix socket only — no server, no health monitor,
// no file watcher, no Telegram, no auto-sync.
import { createAgentMcpServer } from "@gettalon/channels-sdk";
await createAgentMcpServer();
