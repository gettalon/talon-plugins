#!/usr/bin/env node
/**
 * Talon Channels — Universal Channel Server
 *
 * A generic MCP server using the Talon Channel SDK that provides:
 * - WebSocket server for any client to connect (browser, mobile, desktop, bots)
 * - Full 23 hook event forwarding
 * - Permission relay (approve/deny tool execution from any client)
 * - Bidirectional chat via channel notifications
 * - Client mode system (chat, monitor, full, custom)
 * - Multi-client support with independent modes
 *
 * Unlike the browser-control plugin (which adds CDP tools), this is a pure
 * channel — no extra tools beyond `reply`. Any client that speaks WebSocket
 * can connect and interact with Claude Code.
 */
export {};
