import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bwlJson, bwlFetch } from "../auth.js";

export function registerBlueprintTools(server: McpServer): void {
  // ── List blueprints ───────────────────────────────────────────────────────
  server.registerTool(
    "bwl_list_blueprints",
    {
      description:
        "List blueprints (processes) in Blueworks Live. Use exactly one of name or tag to filter.",
      inputSchema: z.object({
        name: z.string().optional().describe("Filter by blueprint name"),
        tag: z.string().optional().describe("Filter by tag (mutually exclusive with name)"),
        space_id: z.string().optional().describe("Filter by space ID"),
        space_name: z.string().optional().describe("Filter by space name"),
        archived_state: z
          .enum(["active", "archived", "all"])
          .optional()
          .describe("Filter by archived state"),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ name, tag, space_id, space_name, archived_state, on_behalf_of }) => {
      try {
        const params = new URLSearchParams();
        if (name) params.set("name", name);
        if (tag) params.set("tag", tag);
        if (space_id) params.set("space-id", space_id);
        if (space_name) params.set("space-name", space_name);
        if (archived_state) params.set("archived-state", archived_state);
        const qs = params.toString() ? `?${params}` : "";
        const data = await bwlJson<unknown>(`/bwl/blueprints${qs}`, {}, on_behalf_of);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: String(e) }], isError: true };
      }
    }
  );

  // ── Get blueprint ─────────────────────────────────────────────────────────
  server.registerTool(
    "bwl_get_blueprint",
    {
      description: "Get full details of a blueprint by ID.",
      inputSchema: z.object({
        blueprint_id: z.string().describe("Blueprint ID"),
        revision_id: z.string().optional().describe("Optional revision ID"),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ blueprint_id, revision_id, on_behalf_of }) => {
      try {
        const qs = revision_id ? `?revision-id=${revision_id}` : "";
        const data = await bwlJson<unknown>(
          `/bwl/blueprints/${blueprint_id}${qs}`,
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

  // ── Get process data (milestones, activities, properties) ─────────────────
  server.registerTool(
    "bwl_get_process_data",
    {
      description:
        "Get milestones, activities, and all activity properties for a process. Returns item types: ACTIVITY, ACTOR, COMMENT, PROBLEM, SYSTEM, etc.",
      inputSchema: z.object({
        process_id: z.string().describe("Process ID"),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ process_id, on_behalf_of }) => {
      try {
        const data = await bwlJson<unknown>(
          `/scr/api/ProcessData?processId=${encodeURIComponent(process_id)}`,
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

  // ── Import blueprint ──────────────────────────────────────────────────────
  server.registerTool(
    "bwl_import_blueprint",
    {
      description:
        "Import a BPMN/XML/ZIP file into Blueworks Live as a new blueprint (200/hour).",
      inputSchema: z.object({
        file_path: z.string().describe("Absolute path to the .bpmn, .xml, or .zip file"),
        space_id: z.string().describe("Target space ID"),
        name: z.string().optional().describe("Override process name"),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ file_path, space_id, name, on_behalf_of }) => {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const fileBuffer = fs.readFileSync(file_path);
        const fileName = path.basename(file_path);

        const form = new FormData();
        form.append("file", new Blob([fileBuffer]), fileName);
        form.append("space-id", space_id);
        if (name) form.append("name", name);

        const res = await bwlFetch(
          "/bwl/blueprints/import",
          { method: "POST", body: form },
          on_behalf_of
        );
        const text = await res.text();
        if (!res.ok) throw new Error(`${res.status}: ${text}`);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(JSON.parse(text), null, 2) },
          ],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: String(e) }], isError: true };
      }
    }
  );

  // ── Export blueprint (BPMN zip) ───────────────────────────────────────────
  server.registerTool(
    "bwl_export_blueprint",
    {
      description:
        "Export a blueprint as a BPMN zip file and save it to a local path.",
      inputSchema: z.object({
        process_id: z.string().describe("Process ID"),
        revision_id: z.string().describe("Revision ID"),
        output_path: z.string().describe("Absolute local path to save the zip file"),
        export_to_single_file: z.boolean().optional(),
        include_diagram_interchange: z.boolean().optional(),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({
      process_id,
      revision_id,
      output_path,
      export_to_single_file,
      include_diagram_interchange,
      on_behalf_of,
    }) => {
      try {
        const params = new URLSearchParams();
        if (export_to_single_file) params.set("exportToSingleFile", "true");
        if (include_diagram_interchange)
          params.set("includeDiagramInterchange", "true");
        const qs = params.toString() ? `?${params}` : "";

        const res = await bwlFetch(
          `/scr/api/export/process/${process_id}/${revision_id}${qs}`,
          {},
          on_behalf_of
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`${res.status}: ${text}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const fs = await import("fs");
        fs.writeFileSync(output_path, buffer);
        return {
          content: [
            {
              type: "text" as const,
              text: `Exported ${buffer.length} bytes to ${output_path}`,
            },
          ],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: String(e) }], isError: true };
      }
    }
  );

  // ── Update activity details ───────────────────────────────────────────────
  server.registerTool(
    "bwl_update_activity",
    {
      description:
        "Update properties of a specific activity in a blueprint (name, participants, risk, cost, custom properties, etc.).",
      inputSchema: z.object({
        blueprint_id: z.string().describe("Blueprint ID"),
        activity_id: z.string().describe("Activity ID"),
        updates: z
          .record(z.unknown())
          .describe(
            "JSON object of fields to update. Supported: name, participants, businessOwners, experts, systems, problems, cost, risk (Controlled|Low|Medium|High), valueAdd (Yes|No|Required), cycleTime {workTime, waitTime}, custom text props (array of glossary IDs), custom number props (number)."
          ),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ blueprint_id, activity_id, updates, on_behalf_of }) => {
      try {
        const data = await bwlJson<unknown>(
          `/bwl/blueprints/${blueprint_id}/activities/${activity_id}/details`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
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

  // ── Set activity documentation ────────────────────────────────────────────
  server.registerTool(
    "bwl_set_activity_documentation",
    {
      description: "Set the documentation text for a specific activity in a blueprint.",
      inputSchema: z.object({
        blueprint_id: z.string(),
        activity_id: z.string(),
        documentation: z.string().describe("Documentation HTML or plain text"),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ blueprint_id, activity_id, documentation, on_behalf_of }) => {
      try {
        const data = await bwlJson<unknown>(
          `/bwl/blueprints/${blueprint_id}/activities/${activity_id}/documentation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentation }),
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

  // ── Get blueprint usage ───────────────────────────────────────────────────
  server.registerTool(
    "bwl_get_blueprint_usage",
    {
      description: "Get where a blueprint is used across the account.",
      inputSchema: z.object({
        blueprint_id: z.string(),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ blueprint_id, on_behalf_of }) => {
      try {
        const data = await bwlJson<unknown>(
          `/bwl/blueprints/${blueprint_id}/usage`,
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

  // ── Search ────────────────────────────────────────────────────────────────
  server.registerTool(
    "bwl_search",
    {
      description:
        "Search Blueworks Live for processes, policies, or decisions. Returns matching artifacts.",
      inputSchema: z.object({
        search_field_name: z
          .string()
          .describe("Field to search on (e.g. name, space-name)"),
        search_field_value: z.string().describe("Value to search for"),
        return_fields: z
          .string()
          .default("*")
          .describe("Comma-separated fields to return, or * for all"),
        on_behalf_of: z.string().optional(),
      }),
    },
    async ({ search_field_name, search_field_value, return_fields, on_behalf_of }) => {
      try {
        const data = await bwlJson<unknown>(
          "/scr/api/Search",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              version: "20191214",
              returnFields: return_fields,
              searchFieldName: search_field_name,
              searchFieldValue: search_field_value,
            }),
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
}
