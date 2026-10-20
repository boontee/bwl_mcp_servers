import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { run } from "../util.js";

const id = z.string().min(1).describe("Artifact ID");

export function registerArtifactTools(server: McpServer): void {
  server.registerTool(
    "bwl_move_artifact",
    {
      description:
        "Move an artifact (process, decision, policy, space) to another space. parent_space_id is required for non-space artifacts; for a space, omit it to move the space to top level.",
      inputSchema: z.object({
        artifact_id: id,
        parent_space_id: z.string().optional().describe("Destination space ID"),
      }),
    },
    async ({ artifact_id, parent_space_id }) =>
      run({
        method: "PUT",
        path: `/bwl/artifacts/${encodeURIComponent(artifact_id)}`,
        query: { action: "move" },
        json: parent_space_id ? { "parent-space-id": parent_space_id } : undefined,
      })
  );

  server.registerTool(
    "bwl_rename_artifact",
    {
      description: "Rename an artifact.",
      inputSchema: z.object({ artifact_id: id, name: z.string().min(1).describe("New name") }),
    },
    async ({ artifact_id, name }) =>
      run({
        method: "PUT",
        path: `/bwl/artifacts/${encodeURIComponent(artifact_id)}`,
        query: { action: "rename" },
        json: { name },
      })
  );

  server.registerTool(
    "bwl_archive_artifact",
    {
      description: "Archive an artifact. Archived artifacts can later be deleted by an admin.",
      inputSchema: z.object({ artifact_id: id }),
    },
    async ({ artifact_id }) =>
      run({
        method: "PUT",
        path: `/bwl/artifacts/${encodeURIComponent(artifact_id)}`,
        query: { action: "archive" },
      })
  );

  server.registerTool(
    "bwl_publish_artifact",
    {
      description:
        "Publish a process or decision. Optionally publish a specific revision (snapshot) by revision_id.",
      inputSchema: z.object({
        artifact_id: id,
        revision_id: z.string().optional().describe("Revision ID to publish"),
      }),
    },
    async ({ artifact_id, revision_id }) =>
      run({
        method: "PUT",
        path: `/bwl/artifacts/${encodeURIComponent(artifact_id)}`,
        query: { action: "publish", "revision-id": revision_id },
      })
  );

  server.registerTool(
    "bwl_unpublish_artifact",
    {
      description: "Unpublish a process or decision.",
      inputSchema: z.object({ artifact_id: id }),
    },
    async ({ artifact_id }) =>
      run({
        method: "PUT",
        path: `/bwl/artifacts/${encodeURIComponent(artifact_id)}`,
        query: { action: "unpublish" },
      })
  );

  server.registerTool(
    "bwl_copy_artifact",
    {
      description:
        "Copy an artifact, optionally into another space and/or with a new name. Returns new-artifact-id. Space copies are limited to 10/hour; others 100/hour.",
      inputSchema: z.object({
        artifact_id: id,
        parent_space_id: z.string().optional().describe("Destination space ID"),
        name: z.string().optional().describe("Name for the copy"),
      }),
    },
    async ({ artifact_id, parent_space_id, name }) => {
      const body: Record<string, string> = {};
      if (parent_space_id) body["parent-space-id"] = parent_space_id;
      if (name) body["name"] = name;
      return run({
        method: "POST",
        path: `/bwl/artifacts/${encodeURIComponent(artifact_id)}`,
        json: Object.keys(body).length ? body : undefined,
      });
    }
  );

  server.registerTool(
    "bwl_delete_artifact",
    {
      description:
        "DESTRUCTIVE: permanently delete an ARCHIVED artifact (admin only). Cannot be undone. A 409 response lists usages; force=true deletes despite usages.",
      inputSchema: z.object({
        artifact_id: id,
        force: z.boolean().optional().describe("Delete even if the artifact is in use"),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ artifact_id, force }) =>
      run({
        method: "DELETE",
        path: `/bwl/artifacts/${encodeURIComponent(artifact_id)}`,
        query: { force: force ? true : undefined },
      })
  );
}
