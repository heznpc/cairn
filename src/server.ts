#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, dispatchTool } from "./handlers.js";
import { PROJECT_VERSION, SERVER_NAME } from "./metadata.js";

const server = new Server(
  { name: SERVER_NAME, version: PROJECT_VERSION },
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
//
// Idempotency guard: SIGINT, SIGTERM, stdin "end", and server.onclose can all
// fire for the same disconnect (server.onclose itself fires from inside
// transport.close()). Without the guard we'd race multiple closes and
// process.exit calls.
//
// Drain: we *await* transport.close() so any in-flight JSON-RPC response
// finishes writing before the process exits. A 2s hard-stop covers the case
// where the transport hangs (e.g. the peer pipe is already broken).
const HARD_STOP_MS = 2000;
let shuttingDown = false;
const shutdown = async (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.race([
    transport.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, HARD_STOP_MS)),
  ]);
  process.exit(code);
};
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
process.stdin.on("end", () => void shutdown(0));
server.onclose = () => void shutdown(0);

server.connect(transport).catch((err) => {
  console.error("Failed to start cairn MCP server:", err);
  process.exit(1);
});
