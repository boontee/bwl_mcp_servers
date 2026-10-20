import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { run } from "../util.js";

export function registerGlossaryTools(server: McpServer): void {
  server.registerTool(
    "bwl_upsert_glossary_values",
    {
      description:
        "Create or update glossary values in a category (30/hour; requires glossary manager role). Supply id to update, or name to create/match. Categories: participant-businessowner-expert, externalparticipant, system, supplier-customer, input-output, problem, kpi, businessunit, or a custom property name. 'tag' and 'goal' are unsupported.",
      inputSchema: z.object({
        category: z.string().min(1),
        values: z
          .array(
            z.object({
              id: z.string().optional(),
              name: z.string().optional(),
              description: z.string().optional(),
              visibility: z.string().optional(),
              type: z.string().optional(),
              "type-link": z.string().optional(),
              content: z.string().optional(),
              "glossary-references": z.array(z.unknown()).optional(),
              "hyperlink-references": z.array(z.unknown()).optional(),
            })
          )
          .min(1),
      }),
    },
    async ({ category, values }) =>
      run({
        method: "PUT",
        path: `/bwl/glossary-values/${encodeURIComponent(category)}`,
        headers: { "X-IBM-API-Version": "1.0.0" },
        json: values, // API expects a bare JSON array
      })
  );

  server.registerTool(
    "bwl_delete_glossary_value",
    {
      description:
        "DESTRUCTIVE: delete a glossary value (requires glossary manager + admin). Returns 409 if in use unless force=true.",
      inputSchema: z.object({
        value_id: z.string().min(1),
        force: z.boolean().optional(),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ value_id, force }) =>
      run({
        method: "DELETE",
        path: `/bwl/glossary-values/${encodeURIComponent(value_id)}`,
        query: { force: force ? true : undefined },
      })
  );
}
