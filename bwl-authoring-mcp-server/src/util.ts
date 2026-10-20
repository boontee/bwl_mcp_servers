import { bwlRequest, type BwlRequest } from "./auth.js";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

/**
 * Run a BWL request and shape the response as an MCP tool result.
 * Empty and plain-text success bodies are handled (several Authoring
 * endpoints return a plain message instead of JSON).
 */
export async function run(req: BwlRequest): Promise<ToolResult> {
  try {
    const res = await bwlRequest(req);
    if (!res.ok) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `BWL API error ${res.status} on ${req.method ?? "GET"} ${req.path}: ${res.text.slice(0, 2000)}`,
          },
        ],
      };
    }
    let text = res.text.trim();
    if (!text) text = `OK (HTTP ${res.status})`;
    else {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* plain text response: return as is */
      }
    }
    return { content: [{ type: "text", text }] };
  } catch (err) {
    console.error("[bwl-authoring] request failed:", err instanceof Error ? err.message : err);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Request failed: ${err instanceof Error ? err.message : "unknown error"}`,
        },
      ],
    };
  }
}
