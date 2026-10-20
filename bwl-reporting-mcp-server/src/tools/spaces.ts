import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bwlJson } from "../auth.js";

export function registerSpaceTools(server: McpServer): void {
  // ── List spaces ──────────────────────────────────────────────────────────
  server.registerTool(
    "bwl_list_spaces",
    {
      description:
        "Find spaces in the Blueworks Live account by name. The API requires a name filter; it cannot list all spaces. Use bwl_get_space with include_subspaces for a space's children.",
      inputSchema: z.object({
        name: z.string().optional().describe("Filter by space name"),
        on_behalf_of: z
          .string()
          .optional()
          .describe("BWL username to act on behalf of (Service ID only)"),
      }),
    },
    async ({ name, on_behalf_of }) => {
      try {
        const params = new URLSearchParams();
        if (name) params.set("name", name);
        const qs = params.toString() ? `?${params}` : "";
        const data = await bwlJson<unknown>(`/bwl/spaces${qs}`, {}, on_behalf_of);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: String(e) }],
          isError: true,
        };
      }
    }
  );

  // ── Get space by ID ───────────────────────────────────────────────────────
  server.registerTool(
    "bwl_get_space",
    {
      description: "Get details of a specific Blueworks Live space by ID.",
      inputSchema: z.object({
        space_id: z.string().describe("Space ID"),
        include_subspaces: z.boolean().optional(),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ space_id, include_subspaces, on_behalf_of }) => {
      try {
        const qs = include_subspaces ? "?include-subspaces=true" : "";
        const data = await bwlJson<unknown>(
          `/bwl/spaces/${space_id}${qs}`,
          {},
          on_behalf_of
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: String(e) }],
          isError: true,
        };
      }
    }
  );

  // ── Create space ──────────────────────────────────────────────────────────
  server.registerTool(
    "bwl_create_space",
    {
      description: "Create a new space in Blueworks Live (500/hour limit).",
      inputSchema: z.object({
        name: z.string().describe("Space name"),
        parent_space_id: z.string().optional().describe("Parent space ID"),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ name, parent_space_id, on_behalf_of }) => {
      try {
        const body: Record<string, unknown> = { name };
        if (parent_space_id) body["parent-space-id"] = parent_space_id;
        const data = await bwlJson<unknown>(
          "/bwl/spaces",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
          on_behalf_of
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: String(e) }],
          isError: true,
        };
      }
    }
  );
}
