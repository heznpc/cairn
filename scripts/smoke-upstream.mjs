// Copied into the temporary package installation by smoke-package.mjs.
// Exercise installed CLI + MCP against a controlled Nominatim/Overpass mirror.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageName = process.argv[2];
const packageDir = join(process.cwd(), "node_modules", packageName);
const cli = join(packageDir, "dist", "cli.js");
const candidates = [
  { osm_type: "relation", osm_id: 1, lat: "35", lon: "129", display_name: "Same name, Busan" },
  { osm_type: "relation", osm_id: 2, lat: "37.5", lon: "127", display_name: "Same name, Seoul" },
];
const nodes = [
  { type: "node", id: 100, lat: 37.5005, lon: 127.0005, tags: { railway: "subway_entrance", name: "Arrival" } },
  { type: "node", id: 101, lat: 37.5005, lon: 127, tags: { barrier: "gate", foot: "yes", locked: "yes" } },
  { type: "node", id: 102, lat: 37.5, lon: 127, tags: {} },
];
let reversed = false;
let overpassCalls = 0;
const mirror = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url.startsWith("/search")) {
    response.end(JSON.stringify(reversed ? [...candidates].reverse() : candidates));
    return;
  }
  overpassCalls++;
  let body = "";
  for await (const chunk of request) body += chunk;
  const query = new URLSearchParams(body).get("data") ?? body;
  const elements = query.includes(".roads out body geom") ? [
    { type: "way", id: 10, nodes: nodes.map((node) => node.id),
      geometry: nodes.map(({ lat, lon }) => ({ lat, lon })), tags: { highway: "footway" } },
    ...nodes,
    { type: "way", id: 20, nodes: [101, 999], tags: { barrier: "fence", access: "private" } },
  ] : [nodes[0]];
  response.end(JSON.stringify({ elements }));
});
await new Promise((resolve) => mirror.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${mirror.address().port}`;
const env = {
  ...process.env,
  CAIRN_NOMINATIM_URL: `${url}/search`, CAIRN_OVERPASS_URL: `${url}/overpass`,
  CAIRN_CACHE_MODE: "off", CAIRN_ATTEMPTS: "1",
  CAIRN_NOMINATIM_MIN_INTERVAL_MS: "0", CAIRN_OVERPASS_MIN_INTERVAL_MS: "0",
};
const client = new Client({ name: "cairn-upstream-smoke", version: "0.0.0" });
try {
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [join(packageDir, "dist", "server.js")], env,
  }));
  const search = await client.callTool({ name: "geocode", arguments: { address: "Same name" } });
  assert.equal(search.isError, undefined);
  assert.equal(search.structuredContent.ambiguous, true);
  assert.equal(search.structuredContent.candidates[1].candidateId, "relation:2");
  const ambiguous = await client.callTool({ name: "generate_map", arguments: { address: "Same name" } });
  assert.equal(ambiguous.isError, true);
  assert.match(ambiguous.content[0].text, /relation:2/);
  assert.equal(overpassCalls, 0);

  reversed = true;
  const generate = () => client.callTool({ name: "generate_map", arguments: {
    address: "Same name", candidateId: "relation:2",
  } });
  const locked = await generate();
  assert.ok(!locked.isError, JSON.stringify(locked.content));
  assert.equal(locked.structuredContent.layout.center.lat, 37.5);
  assert.match(locked.structuredContent.svg, /data-route-mode="direct"/);
  const gate = locked.structuredContent.document.map.roads[0].nodes[1];
  assert.equal(gate.tags.locked, "yes");
  assert.equal(gate.barriers[0].tags.barrier, "fence");

  nodes[1].tags.locked = "no";
  const opened = await generate();
  assert.ok(!opened.isError, JSON.stringify(opened.content));
  assert.match(opened.structuredContent.svg, /data-route-mode="osm-network"/);
  const stale = await client.callTool({ name: "generate_map", arguments: {
    address: "Same name", candidateId: "relation:999",
  } });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /no longer in the results/);

  const runCli = (args) => promisify(execFile)(process.execPath, [cli, ...args], { env, timeout: 30000 });
  const svg = join(process.cwd(), "selected.svg");
  const document = join(process.cwd(), "selected.json");
  await assert.rejects(runCli(["Same name", "-o", svg]), (error) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, "");
    assert.match(error.stderr, /--candidate/);
    assert.equal(existsSync(svg), false);
    return true;
  });
  await runCli(["Same name", "--candidate", "relation:2", "-o", svg, "--save-document", document]);
  assert.equal(JSON.parse(readFileSync(document, "utf8")).map.center.lat, 37.5);
  assert.match(readFileSync(svg, "utf8"), /data-route-mode="osm-network"/);
  console.log("installed CLI/MCP ambiguity selection and barrier traversal smoke passed");
} finally {
  await client.close();
  await new Promise((resolve) => mirror.close(resolve));
}
