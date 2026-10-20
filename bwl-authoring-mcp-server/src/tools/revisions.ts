import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { run } from "../util.js";

const type = z.enum(["process", "policy", "decision"]);

export function registerRevisionTools(server: McpServer): void {
  server.registerTool(
    "bwl_list_revisions",
    {
      description: "List revisions (snapshots) of a process, policy or decision.",
      inputSchema: z.object({
        artifact_type: type,
        artifact_id: z.string().min(1),
        show_all: z.boolean().optional(),
        show_published_snapshots: z.boolean().optional(),
      }),
    },
    async ({ artifact_type, artifact_id, show_all, show_published_snapshots }) =>
      run({
        path: `/scr/api/revision/${artifact_type}/${encodeURIComponent(artifact_id)}`,
        query: {
          showAll: show_all ? true : undefined,
          showPublishedSnapshots: show_published_snapshots ? true : undefined,
        },
      })
  );

  server.registerTool(
    "bwl_create_revision",
    {
      description: "Create a revision (snapshot) of a process, policy or decision. Returns id, label, time.",
      inputSchema: z.object({
        artifact_type: type,
        artifact_id: z.string().min(1),
        label: z.string().min(1),
      }),
    },
    async ({ artifact_type, artifact_id, label }) =>
      run({
        method: "POST",
        path: `/scr/api/revision/${artifact_type}/${encodeURIComponent(artifact_id)}`,
        query: { label },
        headers: { "X-IBM-API-Version": "20160630" },
      })
  );

  server.registerTool(
    "bwl_update_favorites",
    {
      description: "Update the user's favorites using process app IDs (from the AppList reporting call).",
      inputSchema: z.object({ favorite_ids: z.array(z.string().min(1)) }),
    },
    async ({ favorite_ids }) =>
      run({
        method: "POST",
        path: "/scr/api/UpdateFavorites",
        query: {
          version: "20110917",
          favorites: JSON.stringify({ favorites: favorite_ids.map((id) => ({ id })) }),
        },
      })
  );
}
