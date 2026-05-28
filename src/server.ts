#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, dispatchTool } from "./handlers.js";

const server = new Server(
  { name: "cairn", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  // Cast to CallToolResult (not `as never`) so future drift between
  // DispatchResult and the SDK's tool-result shape still type-checks.
  // The SDK's wider ServerResult union covers task-update shapes we
  // never produce; CallToolResult is the precise return shape here.
  return (await dispatchTool(req.params.name, req.params.arguments)) as CallToolResult;
});

const transport = new StdioServerTransport();

// Exit cleanly when the host closes stdin / sends a signal. Without these,
// the process keeps stdin paused and lingers as a zombie after Claude
// Code / Cursor disconnects.
const shutdown = (code = 0) => {
  // Best-effort transport close; failure shouldn't block process exit.
  transport.close().catch(() => undefined);
  process.exit(code);
};
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.stdin.on("end", () => shutdown(0));
server.onclose = () => shutdown(0);

server.connect(transport).catch((err) => {
  console.error("Failed to start cairn MCP server:", err);
  process.exit(1);
});
