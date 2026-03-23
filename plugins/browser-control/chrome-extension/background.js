// Talon Browser Control - Background Service Worker
// Uses chrome.debugger API (CDP) for DevTools-level browser control.
// Connects to Talon remote control server (preferred) or bridge on port 7899 (fallback).

const RECONNECT_DELAY_MS = 3000;
const MAX_RECENT_COMMANDS = 50;
const CDP_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
// Well-known ports to try when discovering the RC server
const RC_DISCOVERY_PORTS = [21567, 21568, 21569];

// ── WebSocket state ──
let ws = null;
let connected = false;
let reconnectTimer = null;
let recentCommands = [];
let bridgeToken = null;
// Remote control server port (discovered via storage, mDNS, or port probe)
let rcPort = null;
// Whether current connection is to the RC server
let connectedToRc = false;

// ── CDP Session Management ──
// Map<tabId, { attached: boolean, domainsEnabled: Set<string>, lastActivity: number }>
const cdpSessions = new Map();

// ── Event Buffers (per-tab) ──
// Map<tabId, { networkLog: [], consoleMessages: [], errors: [], dialogs: [] }>
const eventBuffers = new Map();
const MAX_NETWORK_LOG = 200;
const MAX_CONSOLE_LOG = 100;
const MAX_ERROR_LOG = 50;

// ── Dialog handling ──
// Map<tabId, { action: "accept"|"dismiss", text?: string }>
const dialogHandlers = new Map();

// ── Snapshot state (for CDP Accessibility Tree snapshots) ──
let snapshotVersions = {};
let snapshotRefs = {};

// ── Inactivity timer ──
let inactivityCheckTimer = null;

// ── Chat state (per-tab) ──
// Map<tabId, { convId: string|null, messages: Array<{role,text}> }>
const tabConversations = new Map();
let activeTabId = null;
let popupPorts = [];

// ── Execution-layer Security ──

// Domain blocklist: prevent navigation to dangerous URL schemes
const BLOCKED_URL_PATTERNS = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^devtools:\/\//,
  /^file:\/\//,
  /^about:/,
];

function isUrlBlocked(url) {
  if (!url) return false;
  return BLOCKED_URL_PATTERNS.some(pattern => pattern.test(url));
}

// Sensitive action keyword detection (warning, non-blocking)
const SENSITIVE_KEYWORDS = ['delete', 'remove', 'cancel subscription', 'close account', 'transfer', 'send money', 'wire', 'payment'];

function checkSensitiveAction(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const keyword of SENSITIVE_KEYWORDS) {
    if (lower.includes(keyword)) return keyword;
  }
  return null;
}

// Rate limiting: prevent runaway automation
const actionTimestamps = [];
const MAX_ACTIONS_PER_MINUTE = 60;

function checkRateLimit() {
  const now = Date.now();
  // Remove timestamps older than 1 minute
  while (actionTimestamps.length > 0 && actionTimestamps[0] < now - 60000) {
    actionTimestamps.shift();
  }
  if (actionTimestamps.length >= MAX_ACTIONS_PER_MINUTE) {
    throw new Error(`Rate limit exceeded: ${MAX_ACTIONS_PER_MINUTE} actions per minute`);
  }
  actionTimestamps.push(now);
}

function getTabConv(tabId) {
  if (!tabConversations.has(tabId)) {
    tabConversations.set(tabId, { convId: null, messages: [] });
  }
  return tabConversations.get(tabId);
}

/** Get the conversation for the currently active tab */
function getActiveConv() {
  if (!activeTabId) return { convId: null, messages: [] };
  return getTabConv(activeTabId);
}

// Accumulate streaming text for assistant messages
let streamingTextAccum = '';


// ─────────────────────────────────────────────
// Mesh JWT for relay discovery
// ─────────────────────────────────────────────

async function sha256hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64urlEncode(data) {
  const binary = String.fromCharCode(...data);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createMeshJwt(meshSecret, deviceId, ttlSeconds = 3600) {
  const meshId = await sha256hex(meshSecret);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { mesh_id: meshId, device_id: deviceId, iat: now, exp: now + ttlSeconds };

  const enc = (s) => base64urlEncode(new TextEncoder().encode(JSON.stringify(s)));
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(meshSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;
}

// ─────────────────────────────────────────────
// Relay mesh discovery (fallback when local probing fails)
// ─────────────────────────────────────────────

async function discoverViaRelay() {
  // Load mesh credentials from chrome.storage.local
  const result = await chrome.storage.local.get(['mesh_secret', 'machine_id', 'relay_base']);
  const { mesh_secret, machine_id, relay_base } = result;

  if (!mesh_secret || !machine_id) {
    console.log('[Talon] No mesh credentials for relay discovery');
    return null;
  }

  const relayUrl = relay_base || 'https://talon.aieduapp.com';
  const deviceId = 'browser-extension-' + chrome.runtime.id;

  try {
    const jwt = await createMeshJwt(mesh_secret, deviceId);
    const meshId = await sha256hex(mesh_secret);

    const resp = await fetch(`${relayUrl}/mesh/peers?mesh_id=${encodeURIComponent(meshId)}`, {
      headers: { 'Authorization': `Bearer ${jwt}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const peers = data.peers || [];
    const target = peers.find(p => p.machine_id === machine_id);

    if (!target) return null;

    const lanEndpoints = target.endpoints?.lan || [];
    console.log('[Talon] Relay discovered endpoints:', lanEndpoints);

    // Try each LAN endpoint
    for (const ep of lanEndpoints) {
      const host = ep.host || ep;
      const port = ep.port || 21567;
      try {
        const healthResp = await fetch(`http://${host}:${port}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (healthResp.ok) {
          console.log(`[Talon] Found RC server via relay at ${host}:${port}`);
          return port;
        }
      } catch {}
    }

    // If no LAN endpoint works, try the tunnel URL directly
    if (target.tunnel_url) {
      console.log('[Talon] Using relay tunnel URL:', target.tunnel_url);
      try { chrome.storage.local.set({ relay_tunnel_url: target.tunnel_url }); } catch {}
      return { type: 'tunnel', url: target.tunnel_url };
    }
  } catch (e) {
    console.warn('[Talon] Relay discovery failed:', e);
  }
  return null;
}

// ─────────────────────────────────────────────
// WebSocket Connection
// ─────────────────────────────────────────────

function getPort() {
  if (rcPort) return rcPort;
  // No known port — will be discovered by probing
  return null;
}

function addRecentCommand(cmd) {
  recentCommands.unshift({
    ...cmd,
    timestamp: Date.now(),
  });
  if (recentCommands.length > MAX_RECENT_COMMANDS) {
    recentCommands.pop();
  }
}

async function loadBridgeToken() {
  // Try to load token and rc_port from chrome.storage.local
  try {
    const result = await chrome.storage.local.get(["bridge_token", "rc_port"]);
    if (result.bridge_token) bridgeToken = result.bridge_token;
    if (result.rc_port) {
      rcPort = Number(result.rc_port);
      console.log("[Talon] Loaded RC port from storage:", rcPort);
    }
  } catch (e) {}

  // If no RC port from storage, probe well-known ports
  if (!rcPort) {
    rcPort = await discoverRcPort();
  }
}

/** Try native messaging host first for reliable discovery via local files. */
async function discoverViaNativeMessaging() {
  return new Promise((resolve) => {
    try {
      const port = chrome.runtime.connectNative("com.gettalon.mcp");
      const timeout = setTimeout(() => {
        port.disconnect();
        resolve(null);
      }, 3000);

      port.onMessage.addListener((msg) => {
        clearTimeout(timeout);
        port.disconnect();
        if (msg.status === "ok" && msg.port && msg.token) {
          console.log("[Talon] Native messaging discovered server on port", msg.port);
          bridgeToken = msg.token;
          try { chrome.storage.local.set({ rc_port: msg.port, bridge_token: msg.token }); } catch {}
          resolve(msg.port);
        } else {
          resolve(null);
        }
      });

      port.onDisconnect.addListener(() => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          console.log("[Talon] Native messaging not available:", chrome.runtime.lastError.message);
        }
        resolve(null);
      });

      port.postMessage({ type: "discover" });
    } catch (e) {
      console.log("[Talon] Native messaging failed:", e);
      resolve(null);
    }
  });
}

/** Probe well-known ports to find a running Talon RC server and get a token. */
async function discoverRcPort() {
  // Try native messaging first (reads ~/.talon/ files directly)
  const nativePort = await discoverViaNativeMessaging();
  if (nativePort) return nativePort;

  // Fall back to HTTP port probing
  const portsToTry = [...RC_DISCOVERY_PORTS];

  // No extra discovery needed here — well-known ports cover the standard case.
  // If Talon is on a dynamic port, the user can set it via the popup settings.

  // Deduplicate
  const uniquePorts = [...new Set(portsToTry)];

  for (const port of uniquePorts) {
    try {
      const resp = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (resp.ok) {
        console.log("[Talon] Discovered RC server on port", port);
        // Get a local auth token
        try {
          const authResp = await fetch(`http://localhost:${port}/auth/local`, {
            method: "POST",
            signal: AbortSignal.timeout(3000),
          });
          if (authResp.ok) {
            const authData = await authResp.json();
            if (authData.token) {
              bridgeToken = authData.token;
              console.log("[Talon] Got local auth token");
              try { chrome.storage.local.set({ rc_port: port, bridge_token: bridgeToken }); } catch {}
            }
          }
        } catch (e) {
          console.warn("[Talon] Failed to get local auth token:", e);
        }
        return port;
      }
    } catch {}
  }
  // Fall back to relay mesh discovery
  console.log('[Talon] Local probe failed, trying relay discovery...');
  const relayResult = await discoverViaRelay();
  if (relayResult) {
    // Tunnel object — no local auth needed, token comes from mesh JWT
    if (typeof relayResult === 'object' && relayResult.type === 'tunnel') {
      return relayResult;
    }
    // Got a local port via relay LAN endpoint discovery
    const port = relayResult;
    try {
      const authResp = await fetch(`http://localhost:${port}/auth/local`, { method: 'POST', signal: AbortSignal.timeout(3000) });
      if (authResp.ok) {
        const authData = await authResp.json();
        if (authData.token) {
          bridgeToken = authData.token;
          try { chrome.storage.local.set({ rc_port: port, bridge_token: bridgeToken }); } catch {}
        }
      }
    } catch {}
    return port;
  }

  console.warn("[Talon] Could not discover RC server");
  return null;
}

async function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  let port = getPort();

  // If no port known, try to discover
  if (!port) {
    port = await discoverRcPort();
    if (port) rcPort = port;
  }

  if (!port) {
    console.warn("[Talon] No RC server found, will retry...");
    scheduleReconnect();
    return;
  }

  // Build WebSocket URL — tunnel object vs local port number
  let wsUrl;
  if (typeof port === 'object' && port.type === 'tunnel') {
    // Connect via relay tunnel (wss)
    const tunnelBase = port.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const tunnelTokenParam = bridgeToken ? `?token=${encodeURIComponent(bridgeToken)}` : "";
    wsUrl = `wss://${tunnelBase}/ws${tunnelTokenParam}`;
    console.log('[Talon] Connecting via relay tunnel:', wsUrl);
  } else {
    const tokenParam = bridgeToken ? `?token=${encodeURIComponent(bridgeToken)}` : "";
    wsUrl = `ws://localhost:${port}/ws${tokenParam}`;
  }

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    console.error("[Talon] WebSocket creation failed:", e);
    rcPort = null;
    scheduleReconnect();
    return;
  }

  const connLabel = typeof port === 'object' ? `tunnel ${port.url}` : `port ${port}`;

  ws.onopen = () => {
    connected = true;
    connectedToRc = true;
    console.log(`[Talon] Connected to RC server via ${connLabel}`);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (chrome.alarms) chrome.alarms.clear("talon-reconnect");
    if (chrome.alarms) chrome.alarms.create("talon-keepalive", { periodInMinutes: 0.4 });
  };

  ws.onclose = () => {
    connected = false;
    connectedToRc = false;
    ws = null;
    console.log("[Talon] Disconnected from Talon Desktop");
    if (chrome.alarms) chrome.alarms.clear("talon-keepalive");
    // Clear cached port — server may have restarted on a different port
    rcPort = null;
    bridgeToken = null;
    // Also clear persisted port so next discovery starts fresh
    try { chrome.storage.local.remove(["rc_port", "bridge_token"]); } catch {}
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error("[Talon] WebSocket error:", err);
    if (!connected) {
      // Port may have changed, re-discover on next attempt
      rcPort = null;
    }
  };

  ws.onmessage = (event) => {
    handleMessage(event.data);
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  // Use chrome.alarms for MV3 service worker persistence — setTimeout
  // doesn't survive service worker suspension after ~30s of inactivity.
  if (typeof chrome !== "undefined" && chrome.alarms) {
    chrome.alarms.create("talon-reconnect", { delayInMinutes: RECONNECT_DELAY_MS / 60000 || 0.05 });
  } else {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  }
}

function sendResponse(requestId, result) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: "response",
    request_id: requestId,
    ...result,
  }));
}

// Send a method call to the RC server and handle the response via callback.
const rcPendingRequests = new Map();

function sendRcRequest(method, params, callback) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !connectedToRc) return;
  const id = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const msg = { type: "request", id, method, params };
  if (callback) rcPendingRequests.set(id, callback);
  ws.send(JSON.stringify(msg));
  return id;
}

// Handle chrome.alarms for reconnection and keepalive
// (survives MV3 service worker suspension after ~30s of inactivity)
if (typeof chrome !== "undefined" && chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "talon-reconnect") {
      reconnectTimer = null;
      connect();
    } else if (alarm.name === "talon-keepalive") {
      // Keepalive: just waking up the service worker is enough.
      // If connection died, reconnect.
      if (!connected) connect();
    }
  });
}

// ── Popup port communication (for streaming chat) ──
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    popupPorts.push(port);
    port.onDisconnect.addListener(() => {
      popupPorts = popupPorts.filter(p => p !== port);
    });
  }
});

function broadcastToPopup(msg) {
  for (const port of popupPorts) {
    try { port.postMessage(msg); } catch {}
  }
}

async function handleMessage(data) {
  let msg;
  try {
    msg = JSON.parse(data);
  } catch {
    console.error("[Talon] Invalid JSON:", data);
    return;
  }

  // ── RC server envelope: unwrap {seq, payload} ──
  if (connectedToRc && msg.seq !== undefined && msg.payload) {
    msg = msg.payload;
  }

  // ── Store mesh credentials if provided (for relay discovery) ──
  if (msg.mesh_secret && msg.machine_id) {
    chrome.storage.local.set({
      mesh_secret: msg.mesh_secret,
      machine_id: msg.machine_id,
      relay_base: msg.relay_base || 'https://talon.aieduapp.com',
    });
    console.log('[Talon] Stored mesh credentials for relay discovery');
  }

  // ── RC server response to our requests ──
  if (msg.type === "response" && msg.id && rcPendingRequests.has(msg.id)) {
    const cb = rcPendingRequests.get(msg.id);
    rcPendingRequests.delete(msg.id);
    if (cb) cb(msg.error ? null : msg.result, msg.error || null);
    return;
  }

  // ── RC server stream events (for chat via RC) ──
  if (msg.type === "stream" && msg.conversation_id && msg.event) {
    handleRcStreamEvent(msg.event, msg.conversation_id);
    return;
  }
  // RC server wraps events as { type: "event", event: "stream-chunk"|"agent-event", data: {...} }
  if (msg.type === "event" && msg.data) {
    const eventType = msg.event || msg.data.type;
    if (eventType === "stream-chunk") {
      // { type: "stream-chunk", content: "...", done: bool }
      if (msg.data.done) {
        broadcastToPopup({ type: "stream_end" });
        const finalText = msg.data.content || streamingTextAccum;
        if (finalText) {
          getActiveConv().messages.push({ role: "assistant", text: finalText });
        }
        streamingTextAccum = '';
      } else if (msg.data.content) {
        streamingTextAccum += msg.data.content;
        broadcastToPopup({ type: "stream_delta", text: msg.data.content });
      }
      return;
    }
    if (eventType === "agent-event" && msg.data.data) {
      handleRcStreamEvent(msg.data.data);
      return;
    }
    // Forward other events as-is
    handleRcStreamEvent(msg.data);
    return;
  }

  // ── Browser command from RC server (Talon MCP tools) ──
  if (msg.type === "browser_command" && msg.request_id && msg.action) {
    handleBrowserCommand(msg).then(result => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "browser_command_response",
          request_id: msg.request_id,
          result: result,
        }));
      }
    }).catch(err => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "browser_command_response",
          request_id: msg.request_id,
          result: { error: err.message || String(err) },
        }));
      }
    });
    return;
  }

  // ── Welcome message from bridge with RC port ──
  if (msg.type === "welcome") {
    if (msg.rc_port && !rcPort) {
      rcPort = Number(msg.rc_port);
      console.log("[Talon] Discovered RC port from bridge welcome:", rcPort);
      // Store it for future reconnects
      try { chrome.storage.local.set({ rc_port: rcPort }); } catch {}
      // Reconnect to the RC server for unified connection
      if (ws) {
        ws.close();
        // The onclose handler will trigger scheduleReconnect, which will
        // now use the RC port via getPort()
      }
    }
    return;
  }

  // ── Chat response handling from Talon backend (bridge protocol) ──
  if (msg.type === "chat_stream_delta") {
    broadcastToPopup({ type: "stream_delta", text: msg.text });
    return;
  }
  if (msg.type === "chat_stream_end") {
    broadcastToPopup({ type: "stream_end" });
    getActiveConv().messages.push({ role: "assistant", text: msg.fullText || "" });
    return;
  }
  if (msg.type === "chat_tool_use") {
    broadcastToPopup({ type: "tool_use", toolName: msg.tool_name, arguments: msg.arguments, callId: msg.call_id });
    return;
  }
  if (msg.type === "chat_tool_result") {
    broadcastToPopup({ type: "tool_result", callId: msg.call_id, output: msg.output, isError: msg.is_error });
    return;
  }
  if (msg.type === "chat_permission_request") {
    broadcastToPopup({ type: "permission_request", requestId: msg.request_id, toolName: msg.tool_name, arguments: msg.arguments });
    return;
  }
  if (msg.type === "chat_error") {
    broadcastToPopup({ type: "error", message: msg.message });
    return;
  }
  if (msg.type === "chat_conversation_id") {
    getActiveConv().convId = msg.conversation_id;
    return;
  }

  // ── Existing browser automation command handling (from bridge or RC) ──
  if (msg.type !== "command") return;

  const { request_id, action } = msg;

  addRecentCommand({ action: msg.action, request_id, status: "received" });

  try {
    const result = await executeCommand(msg);
    addRecentCommand({ action: msg.action, request_id, status: "success" });
    sendResponse(request_id, { success: true, data: result });
  } catch (err) {
    addRecentCommand({ action: msg.action, request_id, status: "error", error: err.message });
    sendResponse(request_id, { success: false, error: err.message });
  }
}

// Handle RC server stream events (mapped to the same popup broadcast format)
function handleRcStreamEvent(event, conversationId) {
  const type = event.type || "";

  // Find the tab that owns this conversation (for message storage)
  function getConvForStream() {
    if (conversationId) {
      for (const [tabId, conv] of tabConversations) {
        if (conv.convId === conversationId) return conv;
      }
    }
    return getActiveConv();
  }

  // Turn lifecycle
  if (type === "turn_started") {
    broadcastToPopup({ type: "turn_started" });
    return;
  }

  // Text streaming
  if (type === "text_delta") {
    streamingTextAccum += (event.text || '');
    broadcastToPopup({ type: "stream_delta", text: event.text });
    return;
  }
  if (type === "stream_end" || type === "message_complete") {
    broadcastToPopup({ type: "stream_end" });
    const finalText = event.fullText || streamingTextAccum;
    if (finalText) {
      getConvForStream().messages.push({ role: "assistant", text: finalText });
    }
    streamingTextAccum = '';
    return;
  }

  // Tool lifecycle
  if (type === "tool_call_start" || type === "tool_use") {
    broadcastToPopup({ type: "tool_use", toolName: event.tool_name, arguments: event.arguments, callId: event.call_id });
    return;
  }
  if (type === "tool_result") {
    broadcastToPopup({ type: "tool_result", callId: event.call_id, toolName: event.tool_name, output: event.output, isError: event.is_error });
    return;
  }
  if (type === "tool_progress") {
    broadcastToPopup({ type: "tool_progress", callId: event.tool_use_id, toolName: event.tool_name, elapsed: event.elapsed_secs });
    return;
  }

  // Thinking
  if (type === "thinking_start" || type === "thinking_delta" || type === "thinking_end") {
    broadcastToPopup({ type, content: event.content });
    return;
  }

  // Permission
  if (type === "permission_request") {
    broadcastToPopup({ type: "permission_request", requestId: event.request_id, toolName: event.tool_name, arguments: event.arguments });
    return;
  }
  if (type === "permission_cancelled") {
    broadcastToPopup({ type: "permission_cancelled" });
    return;
  }

  // Status / cost / suggestions
  if (type === "status") {
    broadcastToPopup({ type: "status", message: event.message });
    return;
  }
  if (type === "cost_update") {
    broadcastToPopup({ type: "cost_update", totalCost: event.total_cost_usd, inputTokens: event.input_tokens, outputTokens: event.output_tokens });
    return;
  }
  if (type === "prompt_suggestion") {
    broadcastToPopup({ type: "prompt_suggestion", suggestion: event.suggestion });
    return;
  }
  if (type === "rate_limit") {
    broadcastToPopup({ type: "rate_limit", message: event.message, retryAfter: event.retry_after_secs });
    return;
  }

  // Task events
  if (type === "task_started" || type === "task_progress" || type === "task_notification") {
    broadcastToPopup(event);
    return;
  }

  // Agent/subagent progress
  if (type === "agent_progress") {
    broadcastToPopup({ type: "agent_progress", message: event.message, is_sidechain: event.is_sidechain, parent_uuid: event.parent_uuid });
    return;
  }

  // Error
  if (type === "error") {
    broadcastToPopup({ type: "error", message: event.message });
    return;
  }

  // Forward any unhandled events as-is for future extensibility
  broadcastToPopup(event);
}

// ─────────────────────────────────────────────
// CDP Session Management
// ─────────────────────────────────────────────

async function ensureCdpAttached(tabId) {
  const session = cdpSessions.get(tabId);
  if (session && session.attached) {
    session.lastActivity = Date.now();
    return;
  }

  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (err) {
    // May already be attached
    if (!err.message?.includes("Already attached")) {
      throw new Error(`Failed to attach debugger to tab ${tabId}: ${err.message}`);
    }
  }

  const newSession = {
    attached: true,
    domainsEnabled: new Set(),
    lastActivity: Date.now(),
  };
  cdpSessions.set(tabId, newSession);

  // Initialize event buffer for this tab
  if (!eventBuffers.has(tabId)) {
    eventBuffers.set(tabId, {
      networkLog: [],
      consoleMessages: [],
      errors: [],
      dialogs: [],
    });
  }

  // Enable core domains
  await enableCdpDomain(tabId, "Page");
  await enableCdpDomain(tabId, "Runtime");

  startInactivityCheck();
}

async function enableCdpDomain(tabId, domain) {
  const session = cdpSessions.get(tabId);
  if (!session || !session.attached) return;
  if (session.domainsEnabled.has(domain)) return;

  try {
    await chrome.debugger.sendCommand({ tabId }, `${domain}.enable`);
    session.domainsEnabled.add(domain);
  } catch (err) {
    console.warn(`[Talon] Failed to enable ${domain} on tab ${tabId}:`, err.message);
  }
}

async function cdpSend(tabId, method, params) {
  await ensureCdpAttached(tabId);
  const session = cdpSessions.get(tabId);
  if (session) session.lastActivity = Date.now();
  return await chrome.debugger.sendCommand({ tabId }, method, params || undefined);
}

async function detachCdp(tabId) {
  const session = cdpSessions.get(tabId);
  if (!session) return;

  cdpSessions.delete(tabId);
  eventBuffers.delete(tabId);
  dialogHandlers.delete(tabId);

  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // May already be detached
  }
}

function cleanupInactiveSessions() {
  const now = Date.now();
  for (const [tabId, session] of cdpSessions.entries()) {
    if (session.attached && (now - session.lastActivity) > CDP_INACTIVITY_TIMEOUT_MS) {
      console.log(`[Talon] Auto-detaching inactive CDP session for tab ${tabId}`);
      detachCdp(tabId);
    }
  }

  if (cdpSessions.size === 0 && inactivityCheckTimer) {
    clearInterval(inactivityCheckTimer);
    inactivityCheckTimer = null;
  }
}

function startInactivityCheck() {
  if (inactivityCheckTimer) return;
  inactivityCheckTimer = setInterval(cleanupInactiveSessions, 60000);
}

// ── CDP Event Handling ──

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!tabId) return;
  const buf = eventBuffers.get(tabId);
  if (!buf) return;

  // Network events
  if (method === "Network.requestWillBeSent") {
    buf.networkLog.push({
      type: "request",
      url: params.request?.url,
      method: params.request?.method,
      resourceType: params.type,
      requestId: params.requestId,
      timestamp: params.timestamp,
    });
    if (buf.networkLog.length > MAX_NETWORK_LOG) buf.networkLog.shift();
  }

  if (method === "Network.responseReceived") {
    // Find matching request and merge
    const existing = buf.networkLog.find(
      (e) => e.requestId === params.requestId && e.type === "request"
    );
    if (existing) {
      existing.type = "complete";
      existing.status = params.response?.status;
      existing.statusText = params.response?.statusText;
      existing.mimeType = params.response?.mimeType;
      existing.responseTimestamp = params.timestamp;
    } else {
      buf.networkLog.push({
        type: "response",
        url: params.response?.url,
        status: params.response?.status,
        statusText: params.response?.statusText,
        mimeType: params.response?.mimeType,
        requestId: params.requestId,
        timestamp: params.timestamp,
      });
      if (buf.networkLog.length > MAX_NETWORK_LOG) buf.networkLog.shift();
    }
  }

  // Console events
  if (method === "Runtime.consoleAPICalled") {
    buf.consoleMessages.push({
      type: params.type,
      args: (params.args || []).map((a) => a.value ?? a.description ?? a.type).slice(0, 5),
      timestamp: params.timestamp,
    });
    if (buf.consoleMessages.length > MAX_CONSOLE_LOG) buf.consoleMessages.shift();
  }

  // Error events
  if (method === "Runtime.exceptionThrown") {
    buf.errors.push({
      text: params.exceptionDetails?.text || "Unknown error",
      description: params.exceptionDetails?.exception?.description,
      url: params.exceptionDetails?.url,
      lineNumber: params.exceptionDetails?.lineNumber,
      columnNumber: params.exceptionDetails?.columnNumber,
      timestamp: params.timestamp,
    });
    if (buf.errors.length > MAX_ERROR_LOG) buf.errors.shift();
  }

  // Dialog events
  if (method === "Page.javascriptDialogOpening") {
    const handler = dialogHandlers.get(tabId);
    if (handler) {
      // Auto-handle dialog
      chrome.debugger.sendCommand(
        { tabId },
        "Page.handleJavaScriptDialog",
        { accept: handler.action === "accept", promptText: handler.text || "" }
      ).catch((err) => console.warn("[Talon] Failed to handle dialog:", err.message));
      dialogHandlers.delete(tabId);
    } else {
      buf.dialogs.push({
        type: params.type,
        message: params.message,
        url: params.url,
        defaultPrompt: params.defaultPrompt,
        timestamp: Date.now(),
      });
    }
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  if (!tabId) return;
  console.log(`[Talon] Debugger detached from tab ${tabId}: ${reason}`);
  cdpSessions.delete(tabId);
  eventBuffers.delete(tabId);
  dialogHandlers.delete(tabId);
});

// Track active tab for per-tab conversations
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  activeTabId = activeInfo.tabId;
  // Auto-capture page context
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const tabConv = getTabConv(activeInfo.tabId);
    tabConv.pageContext = {
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl,
    };
    broadcastToPopup({
      type: 'tab_changed',
      tabId: activeInfo.tabId,
      pageContext: tabConv.pageContext,
    });
  } catch {}
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  cdpSessions.delete(tabId);
  eventBuffers.delete(tabId);
  dialogHandlers.delete(tabId);
  tabConversations.delete(tabId);
  delete snapshotVersions[tabId];
  delete snapshotRefs[tabId];
});

// ─────────────────────────────────────────────
// Helper: get active tab
// ─────────────────────────────────────────────

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
    // Fall back to most recent non-chrome tab
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const validTab = allTabs
      .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
    if (validTab) return validTab;
  }
  if (!tab) throw new Error("No active tab found");
  return tab;
}

// ─────────────────────────────────────────────
// Helper: resolve element coordinates via CDP
// ─────────────────────────────────────────────

async function getElementCenter(tabId, selector) {
  const result = await cdpSend(tabId, "Runtime.evaluate", {
    expression: `(function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return JSON.stringify({ error: "Element not found: ${selector.replace(/"/g, '\\"')}" });
      const rect = el.getBoundingClientRect();
      return JSON.stringify({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        tagName: el.tagName,
        text: (el.innerText || "").substring(0, 200)
      });
    })()`,
    returnByValue: true,
  });
  const val = JSON.parse(result.result.value);
  if (val.error) throw new Error(val.error);
  return val;
}

// Helper: Playwright-style actionability checks before interacting with an element.
// Verifies the element is visible, enabled, stable (not animating), and receives
// pointer events (not covered by an overlay).  Retries until `timeout` ms elapse.
async function ensureActionable(tabId, selector, timeout = 5000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const check = await cdpEvaluate(tabId, `(function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return JSON.stringify({ ready: false, reason: 'not_found' });

      const rect = el.getBoundingClientRect();

      // Visible check
      if (rect.width === 0 || rect.height === 0) return JSON.stringify({ ready: false, reason: 'zero_size' });
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden') return JSON.stringify({ ready: false, reason: 'hidden' });
      if (style.display === 'none') return JSON.stringify({ ready: false, reason: 'display_none' });

      // Enabled check
      if (el.disabled) return JSON.stringify({ ready: false, reason: 'disabled' });
      if (el.getAttribute('aria-disabled') === 'true') return JSON.stringify({ ready: false, reason: 'aria_disabled' });

      // Receives events check (hit test)
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const topEl = document.elementFromPoint(cx, cy);
      const receivesEvents = topEl === el || el.contains(topEl) || (topEl && topEl.closest && topEl.closest(${JSON.stringify(selector)}) === el);
      if (!receivesEvents) return JSON.stringify({ ready: false, reason: 'covered', coveringElement: topEl?.tagName });

      return JSON.stringify({
        ready: true,
        x: cx, y: cy,
        width: rect.width, height: rect.height,
        tagName: el.tagName,
        text: (el.textContent || '').trim().substring(0, 100)
      });
    })()`);

    const result = JSON.parse(check);
    if (!result.ready) {
      // Not ready yet — wait and retry
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    // Stability check: verify the element has the same bounding box after ~1 animation frame
    await new Promise(r => setTimeout(r, 50));

    const check2 = await cdpEvaluate(tabId, `(function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return JSON.stringify({ ready: false, reason: 'not_found' });
      const rect = el.getBoundingClientRect();
      return JSON.stringify({
        ready: true,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        tagName: el.tagName,
        text: (el.textContent || '').trim().substring(0, 100)
      });
    })()`);

    const result2 = JSON.parse(check2);
    if (!result2.ready) {
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    // Compare positions — if they differ the element is still animating
    if (result.x !== result2.x || result.y !== result2.y || result.width !== result2.width || result.height !== result2.height) {
      // Not stable, retry
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    // All checks passed — return the confirmed position
    return result2;
  }

  throw new Error(`Element not actionable within ${timeout}ms: ${selector}`);
}

// Helper: CDP Runtime.evaluate with JSON return
async function cdpEvaluate(tabId, expression, returnByValue = true) {
  const result = await cdpSend(tabId, "Runtime.evaluate", {
    expression,
    returnByValue,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    const desc = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "JS error";
    throw new Error(desc);
  }
  return result.result?.value;
}

// ─────────────────────────────────────────────
// Key mapping for Input.dispatchKeyEvent
// ─────────────────────────────────────────────

const KEY_DEFINITIONS = {
  Enter: { keyCode: 13, code: "Enter", key: "Enter" },
  Tab: { keyCode: 9, code: "Tab", key: "Tab" },
  Backspace: { keyCode: 8, code: "Backspace", key: "Backspace" },
  Delete: { keyCode: 46, code: "Delete", key: "Delete" },
  Escape: { keyCode: 27, code: "Escape", key: "Escape" },
  ArrowUp: { keyCode: 38, code: "ArrowUp", key: "ArrowUp" },
  ArrowDown: { keyCode: 40, code: "ArrowDown", key: "ArrowDown" },
  ArrowLeft: { keyCode: 37, code: "ArrowLeft", key: "ArrowLeft" },
  ArrowRight: { keyCode: 39, code: "ArrowRight", key: "ArrowRight" },
  Home: { keyCode: 36, code: "Home", key: "Home" },
  End: { keyCode: 35, code: "End", key: "End" },
  PageUp: { keyCode: 33, code: "PageUp", key: "PageUp" },
  PageDown: { keyCode: 34, code: "PageDown", key: "PageDown" },
  Space: { keyCode: 32, code: "Space", key: " " },
  F1: { keyCode: 112, code: "F1", key: "F1" },
  F2: { keyCode: 113, code: "F2", key: "F2" },
  F3: { keyCode: 114, code: "F3", key: "F3" },
  F4: { keyCode: 115, code: "F4", key: "F4" },
  F5: { keyCode: 116, code: "F5", key: "F5" },
  F6: { keyCode: 117, code: "F6", key: "F6" },
  F7: { keyCode: 118, code: "F7", key: "F7" },
  F8: { keyCode: 119, code: "F8", key: "F8" },
  F9: { keyCode: 120, code: "F9", key: "F9" },
  F10: { keyCode: 121, code: "F10", key: "F10" },
  F11: { keyCode: 122, code: "F11", key: "F11" },
  F12: { keyCode: 123, code: "F12", key: "F12" },
};

// ─────────────────────────────────────────────
// Command Execution
// ─────────────────────────────────────────────

/** Handle browser commands from RC server (Talon MCP tools). */
async function handleBrowserCommand(msg) {
  try {
    const result = await executeCommand(msg);
    return result || { ok: true };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

async function executeCommand(msg) {
  const { action } = msg;

  // Rate limit check — prevent runaway automation
  checkRateLimit();

  switch (action) {

    // ── EXISTING ACTIONS (rewritten with CDP) ──

    case "navigate": {
      const { url } = msg;
      if (!url) throw new Error("url is required for navigate");
      if (isUrlBlocked(url)) throw new Error(`Navigation blocked: URL matches a restricted pattern (${url})`);
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Page");

      // Use Page.navigate for CDP-level navigation
      const navResult = await cdpSend(tab.id, "Page.navigate", { url });
      if (navResult.errorText) {
        throw new Error(`Navigation failed: ${navResult.errorText}`);
      }

      // Wait for load event
      await waitForPageLoad(tab.id, msg.timeout || 30000);

      // Get page info after navigation
      const pageInfo = await cdpEvaluate(tab.id, `(function() {
        return JSON.stringify({
          title: document.title,
          url: window.location.href,
          text: (document.querySelector("article") || document.querySelector("main") || document.body)?.innerText?.substring(0, 50000) || ""
        });
      })()`);
      return JSON.parse(pageInfo);
    }

    case "click": {
      const { selector, ref, text: clickText } = msg;
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Input");

      let pos2;
      let resolvedSelector = selector;
      let clickedLabel = selector;

      if (ref) {
        // ── Ref-based click using backendDOMNodeId from snapshot ──
        // Parse versioned ref: "1:e5" -> version=1, ref="e5"
        const colonIdx = ref.indexOf(':');
        let refVersion, refKey;
        if (colonIdx !== -1) {
          refVersion = parseInt(ref.substring(0, colonIdx), 10);
          refKey = ref.substring(colonIdx + 1);
        } else {
          // Unversioned ref (backward compat)
          refKey = ref;
          refVersion = null;
        }

        const tabRefs = snapshotRefs[tab.id];
        if (!tabRefs) {
          throw new Error(`No snapshot refs available for tab ${tab.id}. Take a snapshot first.`);
        }

        // Verify version matches if provided
        if (refVersion !== null && tabRefs.version !== refVersion) {
          throw new Error(`Snapshot version mismatch: ref version ${refVersion} but current snapshot is version ${tabRefs.version}. Take a new snapshot.`);
        }

        const elementInfo = tabRefs.elements[refKey];
        if (!elementInfo) {
          throw new Error(`Element ref "${refKey}" not found in snapshot. Available refs: ${Object.keys(tabRefs.elements).slice(0, 10).join(', ')}...`);
        }

        const backendNodeId = elementInfo.backendDOMNodeId;
        await enableCdpDomain(tab.id, "DOM");

        // Resolve the backend node to a RemoteObject
        const resolveResult = await cdpSend(tab.id, "DOM.resolveNode", {
          backendNodeId,
        });
        if (!resolveResult.object) {
          throw new Error(`Could not resolve DOM node for ref "${ref}" (backendNodeId=${backendNodeId}). The page may have changed.`);
        }
        const objectId = resolveResult.object.objectId;

        // Scroll into view and get bounding rect via Runtime.callFunctionOn
        const posResult = await cdpSend(tab.id, "Runtime.callFunctionOn", {
          objectId,
          functionDeclaration: `function() {
            this.scrollIntoView({ block: "center", behavior: "instant" });
            const rect = this.getBoundingClientRect();
            return JSON.stringify({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              width: rect.width,
              height: rect.height,
              tagName: this.tagName,
              text: (this.innerText || "").substring(0, 200)
            });
          }`,
          returnByValue: true,
          awaitPromise: false,
        });

        if (posResult.exceptionDetails) {
          throw new Error(`Failed to get element position for ref "${ref}": ${posResult.exceptionDetails.text || 'unknown error'}`);
        }

        // Small delay for scroll to settle
        await new Promise((r) => setTimeout(r, 50));

        // Re-get position after scroll
        const pos2Result = await cdpSend(tab.id, "Runtime.callFunctionOn", {
          objectId,
          functionDeclaration: `function() {
            const rect = this.getBoundingClientRect();
            return JSON.stringify({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              width: rect.width,
              height: rect.height,
              tagName: this.tagName,
              text: (this.innerText || "").substring(0, 200)
            });
          }`,
          returnByValue: true,
          awaitPromise: false,
        });

        pos2 = JSON.parse(pos2Result.result.value);
        clickedLabel = `ref=${ref} (${elementInfo.role}: "${elementInfo.name}")`;

        // Release the object
        try { await cdpSend(tab.id, "Runtime.releaseObject", { objectId }); } catch {}

      } else if (clickText) {
        // ── Text-based click (backward compatible) ──
        // Remove any previous click-target markers
        await cdpEvaluate(tab.id, `(function() {
          document.querySelectorAll('[data-talon-click-target]').forEach(function(e) { delete e.dataset.talonClickTarget; });
        })()`);
        // Find element by text content using XPath
        await cdpEvaluate(tab.id, `(function() {
          var xpath = document.evaluate(
            "//*[contains(text(), " + ${JSON.stringify(JSON.stringify(clickText))} + ")]",
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
          );
          var el = xpath.singleNodeValue;
          if (el) el.dataset.talonClickTarget = "true";
          else throw new Error("No element found with text: " + ${JSON.stringify(clickText)});
        })()`);
        resolvedSelector = '[data-talon-click-target="true"]';
        clickedLabel = resolvedSelector;

        // Scroll and get position with actionability checks
        await cdpEvaluate(tab.id, `document.querySelector(${JSON.stringify(resolvedSelector)}).scrollIntoView({ block: "center", behavior: "instant" })`);
        await new Promise((r) => setTimeout(r, 50));
        pos2 = await ensureActionable(tab.id, resolvedSelector, msg.timeout || 5000);

      } else if (selector) {
        // ── CSS selector-based click (backward compatible) ──
        await cdpEvaluate(tab.id, `document.querySelector(${JSON.stringify(resolvedSelector)}).scrollIntoView({ block: "center", behavior: "instant" })`);
        await new Promise((r) => setTimeout(r, 50));
        pos2 = await ensureActionable(tab.id, resolvedSelector, msg.timeout || 5000);
      } else {
        throw new Error("One of selector, ref, or text is required for click");
      }

      // Dispatch mouse events via CDP Input domain
      await cdpSend(tab.id, "Input.dispatchMouseEvent", {
        type: "mouseMoved", x: pos2.x, y: pos2.y,
      });
      await cdpSend(tab.id, "Input.dispatchMouseEvent", {
        type: "mousePressed", x: pos2.x, y: pos2.y, button: "left", clickCount: 1,
      });
      await cdpSend(tab.id, "Input.dispatchMouseEvent", {
        type: "mouseReleased", x: pos2.x, y: pos2.y, button: "left", clickCount: 1,
      });

      // Clean up temporary click-target marker
      if (clickText) {
        await cdpEvaluate(tab.id, `(function() {
          document.querySelectorAll('[data-talon-click-target]').forEach(function(e) { delete e.dataset.talonClickTarget; });
        })()`);
      }

      const clickResult = { clicked: clickedLabel, tagName: pos2.tagName, text: pos2.text };
      const sensitiveClick = checkSensitiveAction(pos2.text) || checkSensitiveAction(clickText);
      if (sensitiveClick) clickResult.warning = `Action involves sensitive keyword: '${sensitiveClick}'`;
      return clickResult;
    }

    case "fill": {
      const { selector, value } = msg;
      if (!selector) throw new Error("selector is required for fill");
      if (value === undefined) throw new Error("value is required for fill");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);

      // Focus element, clear, then use Input.insertText for realistic input
      await cdpEvaluate(tab.id, `(function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("Element not found: ${selector.replace(/"/g, '\\"')}");
        el.focus();
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);

      await enableCdpDomain(tab.id, "Input");
      await cdpSend(tab.id, "Input.insertText", { text: value });

      // Fire change event
      await cdpEvaluate(tab.id, `(function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) el.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);

      const fillResult = { filled: selector, value };
      const sensitiveFill = checkSensitiveAction(value);
      if (sensitiveFill) fillResult.warning = `Action involves sensitive keyword: '${sensitiveFill}'`;
      return fillResult;
    }

    case "screenshot": {
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);

      const format = msg.format || "png";
      const quality = format === "jpeg" ? (msg.quality || 80) : undefined;
      const captureParams = { format };
      if (quality !== undefined) captureParams.quality = quality;

      // Support full-page screenshots
      if (msg.full_page) {
        // Get full page dimensions
        const metrics = await cdpEvaluate(tab.id, `JSON.stringify({
          width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
          deviceScaleFactor: window.devicePixelRatio
        })`);
        const dims = JSON.parse(metrics);
        await enableCdpDomain(tab.id, "Emulation");
        await cdpSend(tab.id, "Emulation.setDeviceMetricsOverride", {
          width: dims.width,
          height: dims.height,
          deviceScaleFactor: dims.deviceScaleFactor,
          mobile: false,
        });
        const result = await cdpSend(tab.id, "Page.captureScreenshot", captureParams);
        // Reset metrics
        await cdpSend(tab.id, "Emulation.clearDeviceMetricsOverride");
        return { screenshot_base64: result.data, format };
      }

      // Support element screenshot via clip
      if (msg.selector) {
        const pos = await getElementCenter(tab.id, msg.selector);
        captureParams.clip = {
          x: pos.x - pos.width / 2,
          y: pos.y - pos.height / 2,
          width: pos.width,
          height: pos.height,
          scale: 1,
        };
      }

      const result = await cdpSend(tab.id, "Page.captureScreenshot", captureParams);
      return { screenshot_base64: result.data, format };
    }

    case "extract": {
      const { selector } = msg;
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);

      const extracted = await cdpEvaluate(tab.id, `(function() {
        if (${JSON.stringify(selector || null)}) {
          const elements = document.querySelectorAll(${JSON.stringify(selector)});
          return JSON.stringify(Array.from(elements).map(el => ({
            tag: el.tagName,
            text: el.innerText?.substring(0, 1000),
            html: el.outerHTML?.substring(0, 2000),
            attributes: Object.fromEntries(
              Array.from(el.attributes).map(a => [a.name, a.value])
            ),
          })));
        }
        const main = document.querySelector("article") || document.querySelector("main") || document.body;
        return JSON.stringify([{
          tag: main.tagName,
          text: main.innerText?.substring(0, 50000),
        }]);
      })()`);
      return { elements: JSON.parse(extracted) };
    }

    case "execute_js": {
      const { code } = msg;
      if (!code) throw new Error("code is required for execute_js");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);

      const trimmed = code.trim();
      const hasReturn = /\breturn\b/.test(trimmed);
      const hasAwait = /\bawait\b/.test(trimmed);
      const isMultiStatement = trimmed.includes(';') && trimmed.replace(/;$/, '').includes(';');

      let expression;
      if (hasReturn || isMultiStatement) {
        expression = `(async () => { ${code} })()`;
      } else if (hasAwait) {
        expression = `(async () => { return ${code} })()`;
      } else {
        expression = `(${code})`;
      }

      const result = await cdpSend(tab.id, "Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "JS execution error");
      }
      return { result: result.result?.value };
    }

    case "get_page_info": {
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);

      const info = await cdpEvaluate(tab.id, `(function() {
        return JSON.stringify({
          title: document.title,
          url: window.location.href,
          links: Array.from(document.querySelectorAll("a[href]"))
            .slice(0, 50)
            .map(a => ({ text: a.innerText?.trim().substring(0, 100), href: a.href }))
            .filter(l => l.text && l.href.startsWith("http")),
          forms: Array.from(document.querySelectorAll("form")).map(f => ({
            action: f.action,
            method: f.method,
            inputs: Array.from(f.querySelectorAll("input, select, textarea")).map(i => ({
              type: i.type,
              name: i.name,
              id: i.id,
              placeholder: i.placeholder,
            })),
          })),
        });
      })()`);
      return JSON.parse(info);
    }

    case "scroll": {
      const { direction, amount } = msg;
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);

      const scrollResult = await cdpEvaluate(tab.id, `(function() {
        const pixels = ${amount || 500};
        switch (${JSON.stringify(direction || "down")}) {
          case "up": window.scrollBy(0, -pixels); break;
          case "down": window.scrollBy(0, pixels); break;
          case "top": window.scrollTo(0, 0); break;
          case "bottom": window.scrollTo(0, document.body.scrollHeight); break;
          default: window.scrollBy(0, pixels); break;
        }
        return JSON.stringify({
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          viewportHeight: window.innerHeight,
        });
      })()`);
      return JSON.parse(scrollResult);
    }

    case "wait": {
      const { selector, timeout } = msg;
      if (!selector) throw new Error("selector is required for wait");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      const waitTimeout = timeout || 10000;

      const waitResult = await cdpEvaluate(tab.id, `(async function() {
        const sel = ${JSON.stringify(selector)};
        const ms = ${waitTimeout};
        const start = Date.now();
        while (Date.now() - start < ms) {
          const el = document.querySelector(sel);
          if (el) return JSON.stringify({ found: true, selector: sel, elapsed: Date.now() - start });
          await new Promise(r => setTimeout(r, 100));
        }
        return JSON.stringify({ found: false, selector: sel, elapsed: ms });
      })()`);
      return JSON.parse(waitResult);
    }

    case "hover": {
      const { selector } = msg;
      if (!selector) throw new Error("selector is required for hover");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Input");

      // Scroll into view and get position
      await cdpEvaluate(tab.id, `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center", behavior: "instant" })`);
      await new Promise((r) => setTimeout(r, 50));
      const pos = await getElementCenter(tab.id, selector);

      // Dispatch mouseMoved via CDP for real hover
      await cdpSend(tab.id, "Input.dispatchMouseEvent", {
        type: "mouseMoved", x: pos.x, y: pos.y,
      });

      return { hovered: true, tagName: pos.tagName, text: pos.text };
    }

    case "select": {
      const { selector, value } = msg;
      if (!selector) throw new Error("selector is required for select");
      if (value === undefined) throw new Error("value is required for select");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);

      const selectResult = await cdpEvaluate(tab.id, `(function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("Element not found: " + ${JSON.stringify(selector)});

        const tagName = el.tagName.toLowerCase();

        // Native select - use direct value assignment
        if (tagName === 'select') {
          el.value = ${JSON.stringify(value)};
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return JSON.stringify({ selected: true, value: el.value, method: "native" });
        }

        // Custom component - click to open, then find and click option by text
        el.click();
        return JSON.stringify({ selected: false, method: "custom_needs_click", tagName });
      })()`);

      const parsed = JSON.parse(selectResult);

      if (parsed.method === "custom_needs_click") {
        // Wait for dropdown to appear
        await new Promise(r => setTimeout(r, 300));

        // Find and click option by text value
        await cdpEvaluate(tab.id, `(function() {
          const value = ${JSON.stringify(value)};
          // Try common option patterns for various UI frameworks
          const selectors = [
            'mat-option', '.mat-option', '.mdc-list-item',
            '[role="option"]', '[role="listbox"] [role="option"]',
            '.dropdown-item', '.select-option', 'li[data-value]',
            '.ant-select-item', '.el-select-dropdown__item',
            'option', '.option'
          ];

          for (const sel of selectors) {
            const options = document.querySelectorAll(sel);
            for (const opt of options) {
              if (opt.textContent.trim().includes(value) ||
                  opt.getAttribute('value') === value ||
                  opt.dataset.value === value) {
                opt.click();
                return;
              }
            }
          }
          throw new Error("Could not find option with value: " + value);
        })()`);

        return { selected: true, value, method: "custom_click" };
      }

      return parsed;
    }

    case "keyboard": {
      const { keys } = msg;
      if (!keys) throw new Error("keys is required for keyboard");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Input");

      const parts = keys.split("+");
      const key = parts[parts.length - 1];
      const modifiers =
        (parts.includes("Control") ? 2 : 0) |
        (parts.includes("Alt") ? 1 : 0) |
        (parts.includes("Shift") ? 8 : 0) |
        (parts.includes("Meta") ? 4 : 0);

      const keyDef = KEY_DEFINITIONS[key] || {
        keyCode: key.charCodeAt(0),
        code: `Key${key.toUpperCase()}`,
        key: key,
      };

      await cdpSend(tab.id, "Input.dispatchKeyEvent", {
        type: "keyDown",
        modifiers,
        key: keyDef.key,
        code: keyDef.code,
        windowsVirtualKeyCode: keyDef.keyCode,
        nativeVirtualKeyCode: keyDef.keyCode,
      });
      await cdpSend(tab.id, "Input.dispatchKeyEvent", {
        type: "keyUp",
        modifiers,
        key: keyDef.key,
        code: keyDef.code,
        windowsVirtualKeyCode: keyDef.keyCode,
        nativeVirtualKeyCode: keyDef.keyCode,
      });

      return { pressed: keys };
    }

    case "type_text": {
      const { selector, text, clear } = msg;
      if (!selector) throw new Error("selector is required for type_text");
      if (!text && text !== "") throw new Error("text is required for type_text");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Input");

      // Focus and optionally clear
      await cdpEvaluate(tab.id, `(function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("Element not found: ${selector.replace(/"/g, '\\"')}");
        el.focus();
        ${clear ? 'el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true }));' : ''}
      })()`);

      // Use Input.insertText for realistic typing
      await cdpSend(tab.id, "Input.insertText", { text });

      // Fire change event
      await cdpEvaluate(tab.id, `(function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) el.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);

      return { typed: true, length: text.length };
    }

    case "drag_drop": {
      const { source, target: targetSel } = msg;
      if (!source) throw new Error("source is required for drag_drop");
      if (!targetSel) throw new Error("target is required for drag_drop");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Input");

      const srcPos = await getElementCenter(tab.id, source);
      const tgtPos = await getElementCenter(tab.id, targetSel);

      // Simulate drag via CDP mouse events
      await cdpSend(tab.id, "Input.dispatchMouseEvent", {
        type: "mouseMoved", x: srcPos.x, y: srcPos.y,
      });
      await cdpSend(tab.id, "Input.dispatchMouseEvent", {
        type: "mousePressed", x: srcPos.x, y: srcPos.y, button: "left", clickCount: 1,
      });
      // Move to target
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        const ratio = i / steps;
        await cdpSend(tab.id, "Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: srcPos.x + (tgtPos.x - srcPos.x) * ratio,
          y: srcPos.y + (tgtPos.y - srcPos.y) * ratio,
        });
      }
      await cdpSend(tab.id, "Input.dispatchMouseEvent", {
        type: "mouseReleased", x: tgtPos.x, y: tgtPos.y, button: "left", clickCount: 1,
      });

      return { dragged: true, source, target: targetSel };
    }

    case "get_tabs": {
      const tabs = await chrome.tabs.query({});
      return {
        tabs: tabs.map((t) => ({
          id: t.id,
          title: t.title,
          url: t.url,
          active: t.active,
        })),
      };
    }

    case "switch_tab": {
      const { tab_id } = msg;
      if (tab_id === undefined) throw new Error("tab_id is required for switch_tab");
      await chrome.tabs.update(tab_id, { active: true });
      return { switched: true, tab_id };
    }

    case "close_tab": {
      const { tab_id } = msg;
      if (tab_id === undefined) throw new Error("tab_id is required for close_tab");
      detachCdp(tab_id); // Clean up CDP session if attached
      await chrome.tabs.remove(tab_id);
      return { closed: true, tab_id };
    }

    case "new_tab": {
      const { url } = msg;
      const tab = await chrome.tabs.create({ url: url || "about:blank" });
      return { tab_id: tab.id, url: tab.url || url || "about:blank" };
    }

    case "wait_for_network": {
      const { timeout } = msg;
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      const waitMs = timeout || 5000;

      const waitResult = await cdpEvaluate(tab.id, `(async function() {
        const ms = ${waitMs};
        const start = Date.now();
        const idleThreshold = 500;
        let lastActivity = Date.now();
        const observer = new PerformanceObserver((list) => {
          if (list.getEntries().length > 0) lastActivity = Date.now();
        });
        observer.observe({ entryTypes: ["resource"] });
        while (Date.now() - start < ms) {
          if (Date.now() - lastActivity >= idleThreshold) {
            observer.disconnect();
            return JSON.stringify({ idle: true, elapsed: Date.now() - start });
          }
          await new Promise(r => setTimeout(r, 100));
        }
        observer.disconnect();
        return JSON.stringify({ idle: false, elapsed: ms, timedOut: true });
      })()`);
      return JSON.parse(waitResult);
    }

    case "wait_for_stable": {
      const { timeout } = msg;
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      const waitMs = timeout || 5000;

      const result = await cdpEvaluate(tab.id, `(async function() {
        const ms = ${waitMs};
        const stableThreshold = 500;
        let lastChange = Date.now();

        // Monitor DOM mutations
        const mutObs = new MutationObserver(() => { lastChange = Date.now(); });
        mutObs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });

        // Monitor network
        const perfObs = new PerformanceObserver((list) => {
          if (list.getEntries().length > 0) lastChange = Date.now();
        });
        try { perfObs.observe({ entryTypes: ["resource"] }); } catch(e) {}

        // Helper: check if main thread is idle
        function isIdle() {
          return new Promise(resolve => {
            if (typeof requestIdleCallback === 'function') {
              requestIdleCallback(() => resolve(true), { timeout: 100 });
            } else {
              setTimeout(() => resolve(true), 50);
            }
          });
        }

        // Helper: wait one animation frame
        function nextFrame() {
          return new Promise(resolve => requestAnimationFrame(resolve));
        }

        const start = Date.now();
        while (Date.now() - start < ms) {
          const timeSinceLastChange = Date.now() - lastChange;
          if (timeSinceLastChange >= stableThreshold) {
            // DOM + network are quiet, now verify main thread idle + animation settled
            await nextFrame();
            await nextFrame(); // Two frames for stability (Playwright approach)
            await isIdle();

            // Re-check that nothing changed during our frame waits
            if (Date.now() - lastChange >= stableThreshold) {
              mutObs.disconnect();
              perfObs.disconnect();
              return JSON.stringify({ stable: true, elapsed: Date.now() - start });
            }
          }
          await new Promise(r => setTimeout(r, 100));
        }

        mutObs.disconnect();
        perfObs.disconnect();
        return JSON.stringify({ stable: false, elapsed: ms, timedOut: true });
      })()`);

      return JSON.parse(result);
    }

    case "get_cookies": {
      const { url } = msg;
      let cookieUrl = url;
      if (!cookieUrl) {
        const tab = await getActiveTab();
        cookieUrl = tab.url;
      }
      const cookies = await chrome.cookies.getAll({ url: cookieUrl });
      return {
        cookies: cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          expirationDate: c.expirationDate,
        })),
      };
    }

    case "set_viewport": {
      const { width, height } = msg;
      if (!width || !height) throw new Error("width and height are required for set_viewport");
      const tab = await getActiveTab();
      await chrome.windows.update(tab.windowId, { width, height });
      return { resized: true, width, height };
    }

    // ── NEW CDP-POWERED ACTIONS ──

    case "network_enable": {
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Network");
      return { enabled: true, tabId: tab.id };
    }

    case "get_network_log": {
      const tab = await getActiveTab();
      const buf = eventBuffers.get(tab.id);
      return { log: buf?.networkLog || [], count: buf?.networkLog?.length || 0 };
    }

    case "set_headers": {
      const { headers } = msg;
      if (!headers || typeof headers !== "object") throw new Error("headers object is required");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Network");
      await cdpSend(tab.id, "Network.setExtraHTTPHeaders", { headers });
      return { set: true, headers };
    }

    case "set_offline": {
      const { offline } = msg;
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Network");
      await cdpSend(tab.id, "Network.emulateNetworkConditions", {
        offline: !!offline,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      return { offline: !!offline };
    }

    case "snapshot": {
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);

      // Enable Accessibility domain if not already
      await enableCdpDomain(tab.id, "Accessibility");
      await enableCdpDomain(tab.id, "DOM");

      // Get the full accessibility tree
      const axResult = await cdpSend(tab.id, "Accessibility.getFullAXTree", {});
      const axNodes = axResult.nodes || [];

      // Get page info
      const pageInfo = await cdpEvaluate(tab.id, `JSON.stringify({ title: document.title, url: location.href })`);
      const { title: pageTitle, url: pageUrl } = JSON.parse(pageInfo);

      // Increment snapshot version
      if (!snapshotVersions[tab.id]) snapshotVersions[tab.id] = 0;
      snapshotVersions[tab.id]++;
      const snapshotVersion = snapshotVersions[tab.id];

      // Store backendDOMNodeId mapping for later interaction
      snapshotRefs[tab.id] = { version: snapshotVersion, elements: {} };

      // Filter to interesting/interactive roles
      const interactiveRoles = new Set([
        'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
        'listbox', 'option', 'menuitem', 'menu', 'menubar', 'tab',
        'tablist', 'switch', 'slider', 'spinbutton', 'searchbox',
        'treeitem', 'gridcell', 'row', 'columnheader', 'rowheader'
      ]);
      const contentRoles = new Set([
        'heading', 'img', 'alert', 'status', 'dialog', 'alertdialog',
        'navigation', 'main', 'complementary', 'banner', 'contentinfo',
        'form', 'search', 'region', 'article'
      ]);

      let refIndex = 0;
      const interactiveElements = [];
      const headings = [];

      for (const node of axNodes) {
        if (node.ignored) continue;

        const role = node.role?.value;
        const name = node.name?.value || '';
        if (!role) continue;

        // Skip generic/unnamed structural nodes
        if (role === 'generic' || role === 'none' || role === 'presentation') continue;
        if (role === 'StaticText' || role === 'InlineTextBox') continue;

        const isInteractive = interactiveRoles.has(role);
        const isContent = contentRoles.has(role);

        if (!isInteractive && !isContent) continue;
        if (!isInteractive && !name) continue; // Skip unnamed content nodes

        const ref = `e${refIndex}`;
        const versionedRef = `${snapshotVersion}:${ref}`;

        const element = { ref: versionedRef, role };
        if (name) element.name = name.substring(0, 200);

        // Extract properties
        if (node.properties) {
          for (const prop of node.properties) {
            const pName = prop.name;
            const pValue = prop.value?.value;
            if (pValue === undefined || pValue === null) continue;
            if (pName === 'disabled' && pValue) element.disabled = true;
            if (pName === 'checked') element.checked = pValue;
            if (pName === 'expanded') element.expanded = pValue;
            if (pName === 'selected' && pValue) element.selected = true;
            if (pName === 'required' && pValue) element.required = true;
            if (pName === 'focused' && pValue) element.focused = true;
            if (pName === 'level') element.level = pValue;
          }
        }

        // Extract value
        if (node.value?.value) element.value = String(node.value.value).substring(0, 200);

        // Store backendDOMNodeId for interaction
        if (node.backendDOMNodeId) {
          snapshotRefs[tab.id].elements[ref] = {
            backendDOMNodeId: node.backendDOMNodeId,
            role,
            name
          };
        }

        if (role === 'heading') {
          headings.push(element);
        }
        if (isInteractive) {
          interactiveElements.push(element);
        }

        refIndex++;
      }

      // Build compact text representation
      let snapshotText = '';
      if (headings.length > 0) {
        snapshotText += 'Headings:\n';
        for (const h of headings) {
          snapshotText += `  - heading "${h.name}" [level=${h.level || 1}]\n`;
        }
        snapshotText += '\n';
      }

      snapshotText += 'Interactive elements:\n';
      for (const el of interactiveElements) {
        let line = `  - ${el.role} "${el.name || ''}" [ref=${el.ref}]`;
        const attrs = [];
        if (el.disabled) attrs.push('disabled');
        if (el.checked !== undefined) attrs.push(`checked=${el.checked}`);
        if (el.expanded !== undefined) attrs.push(`expanded=${el.expanded}`);
        if (el.selected) attrs.push('selected');
        if (el.focused) attrs.push('focused');
        if (el.value) attrs.push(`value="${el.value}"`);
        if (attrs.length) line += ` {${attrs.join(', ')}}`;
        snapshotText += line + '\n';
      }

      const snapshotResult = {
        version: snapshotVersion,
        pageTitle,
        pageUrl,
        snapshot: snapshotText,
        interactiveElements,
        headings,
        elementCount: interactiveElements.length,
      };

      // Apply max_length if specified
      if (msg.max_length && snapshotText.length > msg.max_length) {
        snapshotResult.snapshot = snapshotText.substring(0, msg.max_length) + '\n[truncated]';
        snapshotResult.truncated = true;
      }

      return snapshotResult;
    }

    case "set_input_files": {
      const { selector } = msg;
      if (!selector) throw new Error("selector is required for set_input_files");
      // Note: actual file upload requires injected FileList which is limited.
      // This sets the file input programmatically as much as CDP allows.
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "DOM");

      // Get the DOM node for the file input
      const doc = await cdpSend(tab.id, "DOM.getDocument");
      const nodeResult = await cdpSend(tab.id, "DOM.querySelector", {
        nodeId: doc.root.nodeId,
        selector,
      });
      if (!nodeResult.nodeId) throw new Error(`Element not found: ${selector}`);

      await cdpSend(tab.id, "DOM.setFileInputFiles", {
        files: msg.files || [],
        nodeId: nodeResult.nodeId,
      });

      return { set: true, selector, fileCount: (msg.files || []).length };
    }

    case "handle_dialog": {
      const { action: dialogAction, text: dialogText } = msg;
      if (!dialogAction) throw new Error("action is required (accept or dismiss)");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Page");

      // Arm the handler for the next dialog
      dialogHandlers.set(tab.id, { action: dialogAction, text: dialogText });

      return { armed: true, action: dialogAction };
    }

    case "get_console": {
      const tab = await getActiveTab();
      const buf = eventBuffers.get(tab.id);
      return { messages: buf?.consoleMessages || [], count: buf?.consoleMessages?.length || 0 };
    }

    case "get_errors": {
      const tab = await getActiveTab();
      const buf = eventBuffers.get(tab.id);
      return { errors: buf?.errors || [], count: buf?.errors?.length || 0 };
    }

    case "emulate_device": {
      const { width, height, deviceScaleFactor, mobile } = msg;
      if (!width || !height) throw new Error("width and height are required");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Emulation");

      await cdpSend(tab.id, "Emulation.setDeviceMetricsOverride", {
        width: Math.floor(width),
        height: Math.floor(height),
        deviceScaleFactor: deviceScaleFactor || 1,
        mobile: !!mobile,
      });

      return { emulated: true, width, height, deviceScaleFactor: deviceScaleFactor || 1, mobile: !!mobile };
    }

    case "emulate_media": {
      const { media, features } = msg;
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Emulation");

      const params = {};
      if (media) params.media = media;
      if (features && Array.isArray(features)) params.features = features;

      await cdpSend(tab.id, "Emulation.setEmulatedMedia", params);
      return { emulated: true, media, features };
    }

    case "set_geolocation": {
      const { latitude, longitude, accuracy } = msg;
      if (latitude === undefined || longitude === undefined) {
        throw new Error("latitude and longitude are required");
      }
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Emulation");

      await cdpSend(tab.id, "Emulation.setGeolocationOverride", {
        latitude,
        longitude,
        accuracy: accuracy || 1,
      });

      return { set: true, latitude, longitude, accuracy: accuracy || 1 };
    }

    case "get_metrics": {
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "Performance");

      const result = await cdpSend(tab.id, "Performance.getMetrics");
      const metrics = {};
      for (const m of (result.metrics || [])) {
        metrics[m.name] = m.value;
      }
      return { metrics };
    }

    case "highlight_element": {
      const { selector } = msg;
      if (!selector) throw new Error("selector is required for highlight_element");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "DOM");
      await enableCdpDomain(tab.id, "Overlay");

      const doc = await cdpSend(tab.id, "DOM.getDocument");
      const nodeResult = await cdpSend(tab.id, "DOM.querySelector", {
        nodeId: doc.root.nodeId,
        selector,
      });
      if (!nodeResult.nodeId) throw new Error(`Element not found: ${selector}`);

      await cdpSend(tab.id, "Overlay.highlightNode", {
        highlightConfig: {
          showInfo: true,
          contentColor: { r: 111, g: 168, b: 220, a: 0.66 },
          paddingColor: { r: 147, g: 196, b: 125, a: 0.55 },
          borderColor: { r: 255, g: 229, b: 153, a: 0.66 },
          marginColor: { r: 246, g: 178, b: 107, a: 0.66 },
        },
        nodeId: nodeResult.nodeId,
      });

      // Auto-hide after 2 seconds
      setTimeout(() => {
        cdpSend(tab.id, "Overlay.hideHighlight").catch(() => {});
      }, 2000);

      return { highlighted: true, selector };
    }

    case "get_box_model": {
      const { selector } = msg;
      if (!selector) throw new Error("selector is required for get_box_model");
      const tab = await getActiveTab();
      await ensureCdpAttached(tab.id);
      await enableCdpDomain(tab.id, "DOM");

      const doc = await cdpSend(tab.id, "DOM.getDocument");
      const nodeResult = await cdpSend(tab.id, "DOM.querySelector", {
        nodeId: doc.root.nodeId,
        selector,
      });
      if (!nodeResult.nodeId) throw new Error(`Element not found: ${selector}`);

      const boxModel = await cdpSend(tab.id, "DOM.getBoxModel", {
        nodeId: nodeResult.nodeId,
      });

      return { model: boxModel.model };
    }

    case "bulk_actions": {
      const { actions } = msg;
      if (!Array.isArray(actions) || actions.length === 0) {
        throw new Error("bulk_actions requires a non-empty 'actions' array");
      }

      const results = [];
      for (const action of actions) {
        try {
          // Each action is like a mini-command: { action: "click", selector: "..." }
          const result = await executeCommand(action);
          results.push({ action: action.action, success: true, result });

          // Small delay between actions for page to react
          if (action.delay_ms) {
            await new Promise(r => setTimeout(r, action.delay_ms));
          }
        } catch (err) {
          results.push({ action: action.action, success: false, error: err.message });
          // If action has continue_on_error: false (default), stop
          if (!action.continue_on_error) break;
        }
      }

      return { results, completed: results.length, total: actions.length };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ─────────────────────────────────────────────
// Wait for page load via CDP Page.loadEventFired
// ─────────────────────────────────────────────

function waitForPageLoad(tabId, timeout) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(); // Resolve on timeout (page may be partially loaded)
    }, timeout);

    // Listen for load event via the tab updated status
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        // Small delay for JS to finish executing
        setTimeout(resolve, 500);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ─────────────────────────────────────────────
// Expose state to popup
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get_status") {
    const attachedTabs = [];
    for (const [tabId, session] of cdpSessions.entries()) {
      if (session.attached) attachedTabs.push(tabId);
    }
    sendResponse({
      connected,
      port: getPort(),
      recentCommands: recentCommands.slice(0, 20),
      cdpAttachedTabs: attachedTabs,
    });
    return true;
  }
  if (msg.type === "reconnect") {
    if (ws) {
      ws.close();
    } else {
      connect();
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "chat_send") {
    // Forward chat message to Talon backend via WebSocket
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      sendResponse({ error: "Not connected to Talon" });
      return true;
    }
    const conv = getActiveConv();
    const isNewConv = !conv.convId;
    if (!conv.convId) conv.convId = 'tab-' + activeTabId + '-' + Date.now();
    // Auto-apply last used provider to new conversations
    if (isNewConv) {
      try {
        chrome.storage.local.get(["last_provider"], (stored) => {
          if (stored.last_provider) {
            sendRcRequest("set_conversation_provider_override", {
              conversation_id: conv.convId,
              provider: stored.last_provider,
            });
          }
        });
      } catch {}
    }
    let fullMessage = msg.text;
    // Auto-include page context on first message for a tab
    if (conv.messages.length === 0 && conv.pageContext) {
      fullMessage = `[Current page: ${conv.pageContext.title} (${conv.pageContext.url})]\n\n` + fullMessage;
    }
    if (connectedToRc) {
      // Use RC server protocol: send_message method
      // Build message with page context if available
      if (msg.context) {
        const ctx = msg.context;
        const parts = [];
        if (ctx.url) parts.push(`[Current page: ${ctx.url}]`);
        if (ctx.title) parts.push(`[Title: ${ctx.title}]`);
        if (ctx.selection) parts.push(`[Selected text: ${ctx.selection}]`);
        if (ctx.text) parts.push(`[Page content (truncated): ${ctx.text.substring(0, 2000)}]`);
        if (parts.length) fullMessage = parts.join('\n') + '\n\n' + msg.text;
      }
      sendRcRequest("send_message", {
        conversation_id: conv.convId,
        message: fullMessage,
        channel: "browser-extension",
      });
    } else {
      // Bridge protocol
      const chatMsg = {
        type: "chat_message",
        text: msg.text,
        conversation_id: conv.convId,
        context: msg.context || null,
      };
      ws.send(JSON.stringify(chatMsg));
    }
    conv.messages.push({ role: "user", text: msg.text });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "send_to_subagent") {
    sendRcRequest("send_to_subagent", {
      conversation_id: getActiveConv().convId,
      tool_use_id: msg.toolUseId,
      message: msg.message,
    }, (result, error) => {
      sendResponse(error ? { error } : result);
    });
    return true;
  }
  if (msg.type === "list_subagents") {
    sendRcRequest("list_active_subagents", {
      conversation_id: getActiveConv().convId,
    }, (result, error) => {
      sendResponse(error ? { error } : result);
    });
    return true;
  }
  if (msg.type === "chat_history") {
    const conv = getActiveConv();
    if (conv.convId && connectedToRc) {
      sendRcRequest("get_messages", { conversation_id: conv.convId }, (result, error) => {
        if (result && Array.isArray(result)) {
          sendResponse(result.map(m => ({ role: m.role, text: m.content, id: m.id })));
        } else {
          sendResponse(conv.messages);
        }
      });
      return true;
    }
    sendResponse(conv.messages);
    return true;
  }
  if (msg.type === "chat_new") {
    const conv = getActiveConv();
    conv.messages = [];
    conv.convId = null;
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "permission_response") {
    // Forward permission response to Talon backend
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (connectedToRc) {
        sendRcRequest("answer_permission_request", {
          request_id: msg.requestId,
          allowed: msg.allowed,
        });
      } else {
        ws.send(JSON.stringify({
          type: "permission_response",
          request_id: msg.requestId,
          allowed: msg.allowed,
        }));
      }
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "list_conversations") {
    sendRcRequest("list_conversations", {}, (result, error) => {
      if (error) sendResponse({ error });
      else sendResponse(result);
    });
    return true;
  }
  if (msg.type === "switch_conversation") {
    const conv = getActiveConv();
    conv.convId = msg.conversationId;
    sendRcRequest("get_messages", { conversation_id: msg.conversationId }, (result, error) => {
      if (result && Array.isArray(result)) {
        conv.messages = result.map(m => ({ role: m.role, text: m.content, id: m.id }));
        sendResponse({ messages: conv.messages });
      } else {
        sendResponse({ messages: [] });
      }
    });
    return true;
  }
  if (msg.type === "list_slash_commands") {
    sendRcRequest("list_slash_commands", {}, (result, error) => {
      sendResponse(error ? [] : (Array.isArray(result) ? result : []));
    });
    return true;
  }
  if (msg.type === "list_models") {
    sendRcRequest("list_models", {}, (result, error) => {
      sendResponse(error ? { error } : { models: result });
    });
    return true;
  }
  if (msg.type === "set_model") {
    const conv = getActiveConv();
    if (conv.convId) {
      sendRcRequest("set_model", {
        conversation_id: conv.convId,
        model: msg.model,
      }, (result, error) => {
        sendResponse(error ? { error } : result);
      });
    } else {
      sendResponse({ ok: true }); // No conversation yet, model will be set on first message
    }
    return true;
  }
  if (msg.type === "list_providers") {
    sendRcRequest("list_providers", {}, (result, error) => {
      sendResponse(error ? { providers: [] } : { providers: result });
    });
    return true;
  }
  if (msg.type === "set_provider") {
    const conv = getActiveConv();
    // Persist as default for new conversations
    try { chrome.storage.local.set({ last_provider: msg.provider }); } catch {}
    if (conv.convId) {
      sendRcRequest("set_conversation_provider_override", {
        conversation_id: conv.convId,
        provider: msg.provider,
      }, (result, error) => {
        sendResponse(error ? { error } : result);
      });
    } else {
      sendResponse({ ok: true });
    }
    return true;
  }
  if (msg.type === "set_cli_runtime") {
    const conv = getActiveConv();
    // Save as default for new conversations
    try { chrome.storage.local.set({ last_cli_runtime: msg.runtime }); } catch {}
    if (conv.convId) {
      sendRcRequest("set_conversation_cli_runtime", {
        conversation_id: conv.convId,
        cli_runtime: msg.runtime,
      }, (result, error) => {
        sendResponse(error ? { error } : result);
      });
    } else {
      sendResponse({ ok: true });
    }
    return true;
  }
  if (msg.type === "detect_cli_agents") {
    sendRcRequest("detect_cli_agents", {}, (result, error) => {
      sendResponse(error ? [] : (Array.isArray(result) ? result : []));
    });
    return true;
  }
  if (msg.type === "chat_stop") {
    sendRcRequest("interrupt", { conversation_id: getActiveConv().convId }, (result, error) => {
      if (error) sendResponse({ error });
      else sendResponse(result);
    });
    return true;
  }
  if (msg.type === "get_conversation_scope") {
    sendRcRequest("get_conversation_scope", { conversation_id: msg.conversationId }, (result, error) => {
      if (error) sendResponse({ error });
      else sendResponse(result);
    });
    return true;
  }
  if (msg.type === "set_permission_mode") {
    sendRcRequest("set_conversation_setting", {
      conversation_id: msg.conversationId,
      key: "permission_mode",
      value: msg.mode,
    }, (result, error) => {
      if (error) sendResponse({ error });
      else sendResponse(result);
    });
    return true;
  }
  if (msg.type === "set_folder") {
    sendRcRequest("set_conversation_setting", {
      conversation_id: msg.conversationId,
      key: "folder",
      value: msg.folder,
    }, (result, error) => {
      if (error) sendResponse({ error });
      else sendResponse(result);
    });
    return true;
  }
  if (msg.type === "start_element_picker") {
    // Inject element picker content script into the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ error: "No active tab" });
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ["element-picker.js"],
      }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true });
        }
      });
    });
    return true;
  }
  if (msg.type === "element_picked" || msg.type === "element_picker_cancelled") {
    // Forward element picker results to the side panel
    broadcastToPopup(msg);
    sendResponse({ ok: true });
    return true;
  }
});

// ─────────────────────────────────────────────
// Side panel: open on extension icon click
// ─────────────────────────────────────────────
if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// ─────────────────────────────────────────────
// Start connection on load
// ─────────────────────────────────────────────
loadBridgeToken().then(() => connect());
