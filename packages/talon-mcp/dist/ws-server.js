import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const DEFAULT_PORT = 21567;
const COMMAND_TIMEOUT_MS = 30_000;
const TALON_DIR = join(homedir(), ".talon");
export class BrowserBridgeServer {
    client = null;
    pending = new Map();
    chatHandler = null;
    authToken;
    port;
    constructor(port) {
        this.port = port ?? DEFAULT_PORT;
        this.authToken = randomUUID();
    }
    async start() {
        const httpServer = createServer((req, res) => this.handleHttp(req, res));
        const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
        wss.on("connection", (ws, req) => {
            const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);
            const token = url.searchParams.get("token");
            if (token !== this.authToken) {
                ws.close(4001, "Invalid token");
                return;
            }
            this.client = ws;
            process.stderr.write(`[talon-mcp] Chrome extension connected\n`);
            ws.on("message", (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    // Browser command response
                    if (msg.type === "browser_command_response" && msg.request_id) {
                        const p = this.pending.get(msg.request_id);
                        if (p) {
                            clearTimeout(p.timer);
                            this.pending.delete(msg.request_id);
                            p.resolve(msg.result);
                        }
                        return;
                    }
                    // RC protocol request (send_message) from extension
                    if (msg.type === "request" && msg.method === "send_message" && msg.params && this.chatHandler) {
                        const chatId = msg.params.conversation_id || `chat-${Date.now()}`;
                        const text = msg.params.message || "";
                        this.chatHandler(chatId, text, {});
                        // Send response back to extension so it knows message was received
                        if (this.client && msg.id) {
                            this.client.send(JSON.stringify({
                                type: "response",
                                id: msg.id,
                                result: { ok: true },
                            }));
                        }
                        return;
                    }
                    // Bridge protocol chat message from extension (fallback)
                    if (msg.type === "chat_message" && msg.text && this.chatHandler) {
                        const chatId = msg.conversation_id || `chat-${Date.now()}`;
                        const context = {};
                        if (msg.context?.url)
                            context.url = msg.context.url;
                        if (msg.context?.title)
                            context.title = msg.context.title;
                        if (msg.context?.selectedText)
                            context.selectedText = msg.context.selectedText;
                        this.chatHandler(chatId, msg.text, context);
                        return;
                    }
                }
                catch {
                    // ignore malformed messages
                }
            });
            ws.on("close", () => {
                if (this.client === ws) {
                    this.client = null;
                    process.stderr.write(`[talon-mcp] Chrome extension disconnected\n`);
                }
            });
            ws.on("error", (err) => {
                process.stderr.write(`[talon-mcp] WebSocket error: ${err.message}\n`);
            });
        });
        return new Promise((resolve) => {
            httpServer.listen(this.port, () => {
                this.writeDiscoveryFiles();
                process.stderr.write(`[talon-mcp] Server listening on port ${this.port}\n`);
                resolve();
            });
        });
    }
    writeDiscoveryFiles() {
        try {
            mkdirSync(TALON_DIR, { recursive: true });
            writeFileSync(join(TALON_DIR, "rc_port"), String(this.port));
            writeFileSync(join(TALON_DIR, "browser_bridge_token"), this.authToken);
            process.stderr.write(`[talon-mcp] Discovery files written to ${TALON_DIR}\n`);
        }
        catch (err) {
            process.stderr.write(`[talon-mcp] Warning: could not write discovery files: ${err}\n`);
        }
        this.installNativeMessagingHost();
    }
    installNativeMessagingHost() {
        try {
            // Determine native messaging hosts directory
            const home = homedir();
            let hostsDir;
            if (platform() === "darwin") {
                hostsDir = join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
            }
            else if (platform() === "linux") {
                hostsDir = join(home, ".config", "google-chrome", "NativeMessagingHosts");
            }
            else {
                // Windows: HKCU registry — skip auto-install
                return;
            }
            mkdirSync(hostsDir, { recursive: true });
            // Find the native host script path
            const thisFile = fileURLToPath(import.meta.url);
            const hostScript = join(dirname(thisFile), "..", "native-host", "talon-native-host.js");
            if (!existsSync(hostScript)) {
                process.stderr.write(`[talon-mcp] Native host script not found at ${hostScript}\n`);
                return;
            }
            // Find installed extension ID by scanning Chrome extensions dir
            const extId = this.findExtensionId();
            const manifest = {
                name: "com.gettalon.mcp",
                description: "Talon MCP native messaging host for browser discovery",
                path: hostScript,
                type: "stdio",
                allowed_origins: extId
                    ? [`chrome-extension://${extId}/`]
                    : ["chrome-extension://*/"], // allow any if ID unknown
            };
            const manifestPath = join(hostsDir, "com.gettalon.mcp.json");
            writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            process.stderr.write(`[talon-mcp] Native messaging host installed at ${manifestPath}\n`);
        }
        catch (err) {
            process.stderr.write(`[talon-mcp] Warning: could not install native messaging host: ${err}\n`);
        }
    }
    findExtensionId() {
        // Try to find the Talon Browser Control extension ID from Chrome's Extensions dir
        try {
            const home = homedir();
            let extDir;
            if (platform() === "darwin") {
                extDir = join(home, "Library", "Application Support", "Google", "Chrome", "Default", "Extensions");
            }
            else {
                extDir = join(home, ".config", "google-chrome", "Default", "Extensions");
            }
            if (!existsSync(extDir))
                return null;
            // Scan extension dirs for one containing our manifest name
            for (const id of readdirSync(extDir)) {
                try {
                    const versions = readdirSync(join(extDir, id));
                    for (const ver of versions) {
                        const mf = join(extDir, id, ver, "manifest.json");
                        if (existsSync(mf)) {
                            const raw = readFileSync(mf, "utf-8");
                            const content = JSON.parse(raw);
                            if (content.name === "Talon Browser Control") {
                                return id;
                            }
                        }
                    }
                }
                catch {
                    continue;
                }
            }
        }
        catch { }
        return null;
    }
    cleanupDiscoveryFiles() {
        try {
            unlinkSync(join(TALON_DIR, "rc_port"));
            unlinkSync(join(TALON_DIR, "browser_bridge_token"));
        }
        catch {
            // ignore
        }
    }
    handleHttp(req, res) {
        if (req.url === "/health" && req.method === "GET") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", service: "talon-mcp" }));
            return;
        }
        if (req.url === "/auth/local" && req.method === "POST") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ token: this.authToken }));
            return;
        }
        res.writeHead(404);
        res.end("Not Found");
    }
    async sendCommand(action, params) {
        if (!this.client || this.client.readyState !== WebSocket.OPEN) {
            throw new Error("No browser connected. Load the Chrome extension and open Chrome.");
        }
        const requestId = randomUUID();
        const cmd = {
            type: "browser_command",
            request_id: requestId,
            action,
            ...params,
        };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error("Browser command timed out after 30 seconds"));
            }, COMMAND_TIMEOUT_MS);
            this.pending.set(requestId, { resolve, reject, timer });
            this.client.send(JSON.stringify(cmd));
        });
    }
    onChatMessage(handler) {
        this.chatHandler = handler;
    }
    sendChatReply(chatId, text) {
        if (!this.client || this.client.readyState !== WebSocket.OPEN) {
            process.stderr.write("[talon-mcp] Cannot send reply: no browser connected\n");
            return;
        }
        // Send as RC event format (what extension expects when connectedToRc=true)
        this.client.send(JSON.stringify({
            type: "event",
            event: "text_delta",
            data: { type: "text_delta", text },
        }));
        this.client.send(JSON.stringify({
            type: "event",
            event: "stream_end",
            data: { type: "stream_end", fullText: text },
        }));
    }
    get isConnected() {
        return this.client !== null && this.client.readyState === WebSocket.OPEN;
    }
}
//# sourceMappingURL=ws-server.js.map