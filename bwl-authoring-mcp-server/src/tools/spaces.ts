import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { run } from "../util.js";

const permissions = z
  .object({
    blueprintProcesses: z.string().optional(),
    automateProcesses: z.string().optional(),
    composeDecisions: z.string().optional(),
    authorPolicies: z.string().optional(),
    manageAndEdit: z.string().optional(),
  })
  .describe("Permission levels per capability (as defined by the BWL API)");

export function registerSpaceTools(server: McpServer): void {
  server.registerTool(
    "bwl_create_space",
    {
      description: "Create a space (500/hour). Omit parent_space_id for a top-level space.",
      inputSchema: z.object({
        name: z.string().min(1),
        parent_space_id: z.string().optional(),
      }),
    },
    async ({ name, parent_space_id }) =>
      run({
        method: "POST",
        path: "/bwl/spaces",
        json: parent_space_id ? { name, "parent-space-id": parent_space_id } : { name },
      })
  );

  server.registerTool(
    "bwl_update_space_permissions",
    {
      description:
        "Add, update or delete space permissions. Each user entry needs participantId or participantType (all-editors, all-contributors, all-community, all-viewers, all-admins). For a subspace that inherits permissions, first call with operation=update and inherit_parent_space=false.",
      inputSchema: z.object({
        space_id: z.string().min(1),
        operation: z.enum(["add", "update", "delete"]),
        inherit_parent_space: z.boolean().optional(),
        users: z
          .array(
            z.object({
              participantId: z.string().optional(),
              participantType: z
                .enum(["all-editors", "all-contributors", "all-community", "all-viewers", "all-admins"])
                .optional(),
              permissions: permissions.optional(),
            })
          )
          .optional(),
      }),
    },
    async ({ space_id, operation, inherit_parent_space, users }) => {
      const body: Record<string, unknown> = {};
      if (inherit_parent_space !== undefined) body["inheritParentSpace"] = inherit_parent_space;
      if (users) body["users"] = users;
      return run({
        method: "PUT",
        path: `/bwl/spaces/${encodeURIComponent(space_id)}`,
        query: { operation },
        json: body,
      });
    }
  );
}
