import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import type { BrowserBridgeServer } from "./ws-server.js";
import { BROWSER_TOOL, executeBrowserTool } from "./browser-tool.js";

const SERVER_INFO = {
  name: "talon-mcp",
  version: "1.0.0",
};

export class McpHandler {
  constructor(private server: BrowserBridgeServer) {}

  async handle(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    switch (req.method) {
      case "initialize":
        return this.respond(req.id!, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });

      case "initialized":
        return null;

      case "tools/list":
        return this.respond(req.id!, { tools: [BROWSER_TOOL] });

      case "tools/call": {
        const params = req.params as { name: string; arguments?: Record<string, unknown> } | undefined;
        if (!params?.name) {
          return this.error(req.id!, -32602, "Missing tool name");
        }
        if (params.name !== "browser_control") {
          return this.error(req.id!, -32602, `Unknown tool: ${params.name}`);
        }
        const result = await executeBrowserTool(this.server, params.arguments ?? {});
        return this.respond(req.id!, result);
      }

      case "notifications/cancelled":
        return null;

      case "ping":
        return this.respond(req.id!, {});

      default:
        return this.error(req.id!, -32601, `Method not found: ${req.method}`);
    }
  }

  private respond(id: number | string, result: unknown): JsonRpcResponse {
    return { jsonrpc: "2.0", id, result };
  }

  private error(id: number | string | undefined, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: "2.0", id: id ?? 0, error: { code, message } };
  }
}
