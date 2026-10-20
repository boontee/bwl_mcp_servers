#!/usr/bin/env node
/**
 * IBM Blueworks Live Artifact Authoring MCP Server
 *
 * Required environment variables (User Service ID with Artifact Authoring category):
 *   BWL_SERVER        e.g. https://mel001.blueworkslive.com
 *   BWL_CLIENT_ID
 *   BWL_CLIENT_SECRET
 */
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { registerArtifactTools } from "./tools/artifacts.js";
import { registerSpaceTools } from "./tools/spaces.js";
import { registerGlossaryTools } from "./tools/glossary.js";
import { registerBlueprintTools } from "./tools/blueprints.js";
import { registerRevisionTools } from "./tools/revisions.js";

const server = new McpServer({ name: "bwl-authoring-mcp-server", version: "0.1.0" });

registerArtifactTools(server);
registerSpaceTools(server);
registerGlossaryTools(server);
registerBlueprintTools(server);
registerRevisionTools(server);

async function main(): Promise<void> {
  const missing = ["BWL_SERVER", "BWL_CLIENT_ID", "BWL_CLIENT_SECRET"].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[bwl-authoring] Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
  await server.connect(new StdioServerTransport());
  console.error("[bwl-authoring] Blueworks Live Authoring MCP server running on stdio");
}

main().catch((error) => {
  console.error("[bwl-authoring] Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
