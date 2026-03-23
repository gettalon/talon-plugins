import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const DEFAULT_PORT = 21567;
const COMMAND_TIMEOUT_MS = 30_000;
const TALON_DIR = join(homedir(), ".talon");
export class BrowserBridgeServer {
    client = null;
    pending = new Map();
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
                    if (msg.type === "browser_command_response" && msg.request_id) {
                        const p = this.pending.get(msg.request_id);
                        if (p) {
                            clearTimeout(p.timer);
                            this.pending.delete(msg.request_id);
                            p.resolve(msg.result);
                        }
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
    get isConnected() {
        return this.client !== null && this.client.readyState === WebSocket.OPEN;
    }
}
//# sourceMappingURL=ws-server.js.map