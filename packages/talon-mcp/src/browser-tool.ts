import sharp from "sharp";
import type { McpToolDef } from "./types.js";
import type { BrowserBridgeServer } from "./ws-server.js";

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 60;

export const BROWSER_TOOL: McpToolDef = {
  name: "browser_control",
  description:
    "Control a Chrome browser via DevTools Protocol. " +
    "Actions: navigate, click, fill, execute_js, screenshot, get_page_info, " +
    "scroll, hover, type_text, keyboard, select, wait, get_tabs, switch_tab, " +
    "new_tab, close_tab, get_cookies, snapshot, get_console, get_errors, " +
    "set_viewport, extract, bulk_actions, and more.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "The browser action to perform",
        enum: [
          "navigate", "click", "fill", "execute_js", "screenshot",
          "get_page_info", "scroll", "hover", "type_text", "keyboard",
          "select", "wait", "wait_for_network", "wait_for_stable",
          "get_tabs", "switch_tab", "new_tab", "close_tab",
          "get_cookies", "set_viewport", "snapshot",
          "get_console", "get_errors", "highlight_element",
          "get_box_model", "bulk_actions", "extract",
          "network_enable", "get_network_log",
          "set_headers", "set_offline",
          "set_input_files", "handle_dialog",
          "emulate_device", "emulate_media",
          "set_geolocation", "get_metrics", "drag_drop",
        ],
      },
      url: { type: "string", description: "URL to navigate to (navigate)" },
      selector: { type: "string", description: "CSS selector for targeting elements" },
      text: { type: "string", description: "Text content to match (click) or text to type (type_text)" },
      value: { type: "string", description: "Value for fill/select actions" },
      code: { type: "string", description: "JavaScript code to execute (execute_js)" },
      direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Scroll direction" },
      amount: { type: "number", description: "Scroll amount in pixels" },
      keys: { type: "string", description: "Key or combo: 'Enter', 'Control+a', 'Shift+Tab' (keyboard)" },
      ref: { type: "string", description: "Element ref from snapshot, e.g. '1:e5' (click)" },
      tab_id: { type: "number", description: "Tab ID for tab operations" },
      width: { type: "number", description: "Viewport width (set_viewport, emulate_device)" },
      height: { type: "number", description: "Viewport height (set_viewport, emulate_device)" },
      timeout: { type: "number", description: "Timeout in ms for wait actions" },
      latitude: { type: "number", description: "Latitude for set_geolocation" },
      longitude: { type: "number", description: "Longitude for set_geolocation" },
      accuracy: { type: "number", description: "Accuracy in meters for set_geolocation" },
      source: { type: "string", description: "Source CSS selector (drag_drop)" },
      target: { type: "string", description: "Target CSS selector (drag_drop)" },
      headers: { type: "object", description: "Headers object for set_headers, e.g. {\"X-Custom\": \"value\"}" },
      clear: { type: "boolean", description: "Clear input before typing (type_text)" },
      mobile: { type: "boolean", description: "Emulate mobile device (emulate_device)" },
      deviceScaleFactor: { type: "number", description: "Device scale factor (emulate_device)" },
      full_page: { type: "boolean", description: "Capture full page screenshot" },
      format: { type: "string", enum: ["png", "jpeg"], description: "Screenshot format" },
      quality: { type: "number", description: "JPEG quality 0-100 (screenshot)" },
      actions: {
        type: "array",
        description: "Array of action objects for bulk_actions, each with {action, ...params}",
        items: { type: "object" },
      },
    },
    required: ["action"],
  },
};

async function compressScreenshot(base64Data: string): Promise<{ data: string; mimeType: string }> {
  const buf = Buffer.from(base64Data, "base64");
  const compressed = await sharp(buf)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return {
    data: compressed.toString("base64"),
    mimeType: "image/jpeg",
  };
}

export async function executeBrowserTool(
  server: BrowserBridgeServer,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean }> {
  const action = args.action as string;
  if (!action) {
    return { content: [{ type: "text", text: "Missing required parameter: action" }], isError: true };
  }

  try {
    const { action: _, ...params } = args;
    const result = await server.sendCommand(action, params);
    const resultObj = result as Record<string, unknown>;

    // Handle screenshot: compress and return as image
    if (action === "screenshot") {
      const b64 = (resultObj?.screenshot_base64 || resultObj?.data) as string | undefined;
      if (b64 && typeof b64 === "string") {
        const clean = b64.startsWith("data:image/")
          ? b64.replace(/^data:image\/\w+;base64,/, "")
          : b64;
        const { data, mimeType } = await compressScreenshot(clean);
        return { content: [{ type: "image", data, mimeType }] };
      }
    }

    // Handle errors from extension
    if (resultObj?.error) {
      return { content: [{ type: "text", text: `Browser error: ${resultObj.error}` }], isError: true };
    }

    // Normal result
    const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return { content: [{ type: "text", text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}
