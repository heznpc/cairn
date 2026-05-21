#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, dispatchTool } from "./handlers.js";

const server = new Server(
  { name: "cairn", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  // dispatchTool returns the CallToolResult subset cairn actually uses
  // (content + structuredContent + isError). The SDK's union also covers
  // task-update shapes we never produce, so we widen at the boundary.
  const result = await dispatchTool(req.params.name, req.params.arguments);
  return result as never;
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("Failed to start cairn MCP server:", err);
  process.exit(1);
});
