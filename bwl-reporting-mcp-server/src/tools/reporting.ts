import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bwlJson } from "../auth.js";

export function registerActivityReportingTools(server: McpServer): void {
  // ── New activity API ──────────────────────────────────────────────────────
  server.registerTool(
    "bwl_list_activities",
    {
      description:
        "List account activity events using the filter-based activity API (200/hour). Requires admin.",
      inputSchema: z.object({
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ on_behalf_of }) => {
      try {
        const data = await bwlJson<unknown>("/bwl/activities", {}, on_behalf_of);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: String(e) }], isError: true };
      }
    }
  );

  // ── Legacy activity API ───────────────────────────────────────────────────
  server.registerTool(
    "bwl_get_activity_legacy",
    {
      description:
        "Fetch account activity using the legacy API. Date range max 31 days. Requires admin.",
      inputSchema: z.object({
        start_date: z
          .string()
          .describe("Start date ISO 8601 (e.g. 2025-01-01T00:00:00Z)"),
        end_date: z
          .string()
          .describe("End date ISO 8601 (max 31 days after start)"),
        types: z
          .array(z.string())
          .optional()
          .describe(
            "Activity types to filter, e.g. ['LOGINS', 'PROCESSES_VIEWED']"
          ),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ start_date, end_date, types, on_behalf_of }) => {
      try {
        const params = new URLSearchParams({
          startDate: start_date,
          endDate: end_date,
        });
        if (types && types.length > 0) {
          types.forEach((t) => params.append("type", t));
        }
        const data = await bwlJson<unknown>(
          `/scr/api/activity?${params}`,
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
