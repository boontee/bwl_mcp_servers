import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { run, type ToolResult } from "../util.js";

async function fileBlob(filePath: string): Promise<Blob> {
  return new Blob([new Uint8Array(await readFile(filePath))]);
}

function failure(err: unknown): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `Could not read file: ${err instanceof Error ? err.message : "unknown error"}` }],
  };
}

export function registerBlueprintTools(server: McpServer): void {
  server.registerTool(
    "bwl_update_activity_details",
    {
      description:
        "Update an activity's details (200/hour). Pass fields as a JSON object, e.g. name, participants (single glossary ID), businessOwners[], experts[], systems[], suppliers[], customers[], inputs[], outputs[], dueDateType ('set duration'|'no due date'), dueDateDuration, cycleTime {workTime, waitTime}, cost, risk (Controlled|Low|Medium|High), valueAdd (Yes|No|Required), problems [{problem,severity,frequency}], activityPolicies[], decisions, or a custom property (text -> array of glossary IDs, number -> number). Time units: m, h, d, w, M. Look up glossary IDs first via the reporting server.",
      inputSchema: z.object({
        blueprint_id: z.string().min(1),
        activity_id: z.string().min(1),
        details: z.record(z.string(), z.unknown()),
      }),
    },
    async ({ blueprint_id, activity_id, details }) =>
      run({
        method: "PUT",
        path: `/bwl/blueprints/${encodeURIComponent(blueprint_id)}/activities/${encodeURIComponent(activity_id)}/details`,
        json: details,
      })
  );

  server.registerTool(
    "bwl_set_activity_documentation",
    {
      description: "Set an activity's documentation (HTML or plain text).",
      inputSchema: z.object({
        blueprint_id: z.string().min(1),
        activity_id: z.string().min(1),
        documentation: z.string().describe("HTML or plain text"),
      }),
    },
    async ({ blueprint_id, activity_id, documentation }) =>
      run({
        method: "POST",
        path: `/bwl/blueprints/${encodeURIComponent(blueprint_id)}/activities/${encodeURIComponent(activity_id)}/documentation`,
        json: { description: documentation },
      })
  );

  server.registerTool(
    "bwl_import_blueprint",
    {
      description: "Import a .bpmn, .xml or .zip file as a new blueprint into a space.",
      inputSchema: z.object({
        file_path: z.string().min(1).describe("Absolute local path to the file"),
        space_id: z.string().min(1),
        name: z.string().optional().describe("Override the process name"),
      }),
    },
    async ({ file_path, space_id, name }) => {
      let blob: Blob;
      try {
        blob = await fileBlob(file_path);
      } catch (err) {
        return failure(err);
      }
      const form = new FormData();
      form.set("file", blob, basename(file_path));
      form.set("space-id", space_id);
      if (name) form.set("name", name);
      return run({ method: "POST", path: "/bwl/blueprints/import", form });
    }
  );

  server.registerTool(
    "bwl_create_policy",
    {
      description: "Create a policy in a space. Returns id and name.",
      inputSchema: z.object({ policy_name: z.string().min(1), space_id: z.string().min(1) }),
    },
    async ({ policy_name, space_id }) =>
      run({ method: "POST", path: "/bwl/policies", json: { policyName: policy_name, spaceId: space_id } })
  );

  server.registerTool(
    "bwl_update_policy",
    {
      description: "Update a policy's description and/or hyperlink references.",
      inputSchema: z.object({
        policy_id: z.string().min(1),
        description: z.string().optional(),
        hyperlink_references: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
      }),
    },
    async ({ policy_id, description, hyperlink_references }) => {
      const body: Record<string, unknown> = {};
      if (description !== undefined) body["description"] = description;
      if (hyperlink_references) body["hyperlink-references"] = hyperlink_references;
      return run({ method: "PUT", path: `/bwl/policies/${encodeURIComponent(policy_id)}`, json: body });
    }
  );

  server.registerTool(
    "bwl_post_comment",
    {
      description: "Post a comment on a process or activity (or reply to a comment). Returns commentId.",
      inputSchema: z.object({
        process_id: z.string().min(1),
        activity_id: z.string().optional(),
        comment: z.string().min(1),
        parent_comment_id: z.string().optional(),
      }),
    },
    async ({ process_id, activity_id, comment, parent_comment_id }) =>
      run({
        method: "POST",
        path: "/scr/api/PostComment",
        query: {
          processId: process_id,
          activityId: activity_id,
          comment,
          parentCommentId: parent_comment_id,
        },
      })
  );

  server.registerTool(
    "bwl_upload_file",
    {
      description:
        "Attach a local file (max 50 MB). location is one of activity, app, decision, instance, policy, post. For an activity: ancestor_id is the blueprint ID and parent_id is the process ID.",
      inputSchema: z.object({
        file_path: z.string().min(1).describe("Absolute local path to the file"),
        location: z.enum(["activity", "app", "decision", "instance", "policy", "post"]),
        ancestor_id: z.string().optional(),
        parent_id: z.string().optional(),
      }),
    },
    async ({ file_path, location, ancestor_id, parent_id }) => {
      let blob: Blob;
      try {
        blob = await fileBlob(file_path);
      } catch (err) {
        return failure(err);
      }
      const form = new FormData();
      form.set("fileData", blob, basename(file_path));
      form.set("locationField", location);
      if (ancestor_id) form.set("ancestorIdField", ancestor_id);
      if (parent_id) form.set("parentIdField", parent_id);
      return run({
        method: "POST",
        path: "/scr/api/FileUpload",
        form,
        headers: { "X-IBM-API-Version": "20160630" },
      });
    }
  );
}
