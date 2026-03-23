#!/usr/bin/env node
import { createInterface } from "node:readline";
import { BrowserBridgeServer } from "./ws-server.js";
import { McpHandler } from "./mcp-handler.js";
const PORT = parseInt(process.env.TALON_MCP_PORT ?? "21567", 10);
async function main() {
    const server = new BrowserBridgeServer(PORT);
    await server.start();
    const handler = new McpHandler(server);
    const rl = createInterface({ input: process.stdin });
    rl.on("line", async (line) => {
        if (!line.trim())
            return;
        let req;
        try {
            req = JSON.parse(line);
        }
        catch {
            const err = { jsonrpc: "2.0", id: 0, error: { code: -32700, message: "Parse error" } };
            process.stdout.write(JSON.stringify(err) + "\n");
            return;
        }
        try {
            const response = await handler.handle(req);
            if (response) {
                process.stdout.write(JSON.stringify(response) + "\n");
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            process.stderr.write(`[talon-mcp] Error handling ${req.method}: ${message}\n`);
            if (req.id !== undefined) {
                const errResp = { jsonrpc: "2.0", id: req.id, error: { code: -32603, message } };
                process.stdout.write(JSON.stringify(errResp) + "\n");
            }
        }
    });
    rl.on("close", () => {
        process.stderr.write("[talon-mcp] stdin closed, shutting down\n");
        process.exit(0);
    });
    process.on("SIGTERM", () => {
        process.stderr.write("[talon-mcp] SIGTERM received, shutting down\n");
        process.exit(0);
    });
    process.on("SIGINT", () => {
        process.stderr.write("[talon-mcp] SIGINT received, shutting down\n");
        process.exit(0);
    });
    process.stderr.write(`[talon-mcp] MCP server ready (port ${PORT})\n`);
}
main().catch((err) => {
    process.stderr.write(`[talon-mcp] Fatal: ${err}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map