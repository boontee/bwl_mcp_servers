#!/usr/bin/env node
/**
 * IBM Blueworks Live MCP Server
 *
 * Required environment variables:
 *   BWL_SERVER        — e.g. https://mel001.blueworkslive.com
 *   BWL_CLIENT_ID     — from your Service ID or User Service ID credentials JSON
 *   BWL_CLIENT_SECRET — from your credentials JSON
 *
 * Optional:
 *   BWL_CONSENT_TYPE  — set to "user_consent" when using a User Service ID
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerSpaceTools } from "./tools/spaces.js";
import { registerBlueprintTools } from "./tools/blueprints.js";
import { registerGlossaryTools } from "./tools/glossary.js";
import { registerActivityReportingTools } from "./tools/reporting.js";

const server = new McpServer({ name: "bwl-reporting-mcp-server", version: "0.1.0" });

registerSpaceTools(server);
registerBlueprintTools(server);
registerGlossaryTools(server);
registerActivityReportingTools(server);

async function main(): Promise<void> {
  // Validate required env vars at startup — fail fast with a clear message.
  const required = ["BWL_SERVER", "BWL_CLIENT_ID", "BWL_CLIENT_SECRET"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `[bwl-mcp] Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[bwl-mcp] Blueworks Live MCP server running on stdio (server: ${process.env["BWL_SERVER"]})`
  );
}

main().catch((error) => {
  console.error("[bwl-mcp] Fatal error:", error);
  process.exit(1);
});
