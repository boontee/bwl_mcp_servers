import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bwlJson } from "../auth.js";

export function registerGlossaryTools(server: McpServer): void {
  // ── List glossary categories ──────────────────────────────────────────────
  server.registerTool(
    "bwl_list_glossary_categories",
    {
      description:
        "List all glossary categories (participants, systems, problems, custom text properties, etc.). Requires admin.",
      inputSchema: z.object({
        show_all: z
          .boolean()
          .optional()
          .describe("Include disabled categories"),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ show_all, on_behalf_of }) => {
      try {
        const qs = show_all ? "?showAll=true" : "";
        const data = await bwlJson<unknown>(
          `/bwl/glossary-values/categories${qs}`,
          {},
          on_behalf_of
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: String(e) }], isError: true };
      }
    }
  );

  // ── List glossary values ──────────────────────────────────────────────────
  server.registerTool(
    "bwl_list_glossary_values",
    {
      description: "List all glossary values for a specific category.",
      inputSchema: z.object({
        category: z
          .string()
          .describe(
            "Category name, e.g. participant-businessowner-expert, system, problem, supplier-customer, or a custom category ID"
          ),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ category, on_behalf_of }) => {
      try {
        const data = await bwlJson<unknown>(
          `/bwl/glossary-values?category=${encodeURIComponent(category)}`,
          {},
          on_behalf_of
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: String(e) }], isError: true };
      }
    }
  );

  // ── Upsert glossary values ────────────────────────────────────────────────
  server.registerTool(
    "bwl_upsert_glossary_values",
    {
      description:
        "Add or update glossary values for a category (30/hour). Requires Glossary Manager role. Categories 'tag' and 'goal' are not supported.",
      inputSchema: z.object({
        category: z.string().describe("Category name"),
        values: z
          .array(
            z.object({
              name: z.string().describe("Display name of the value"),
              id: z.string().optional().describe("Existing ID to update"),
            })
          )
          .describe("Array of glossary values to add/update"),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ category, values, on_behalf_of }) => {
      try {
        const data = await bwlJson<unknown>(
          `/bwl/glossary-values/${encodeURIComponent(category)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ values }),
          },
          on_behalf_of
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: String(e) }], isError: true };
      }
    }
  );

  // ── Get glossary value usage ──────────────────────────────────────────────
  server.registerTool(
    "bwl_get_glossary_value_usage",
    {
      description: "Get where a glossary value is used across blueprints.",
      inputSchema: z.object({
        value_id: z.string().describe("Glossary value ID"),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ value_id, on_behalf_of }) => {
      try {
        const data = await bwlJson<unknown>(
          `/bwl/glossary-values/${value_id}/usage`,
          {},
          on_behalf_of
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: String(e) }], isError: true };
      }
    }
  );
}
