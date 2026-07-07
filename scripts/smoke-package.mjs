import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const packDir = mkdtempSync(join(tmpdir(), "cairn-pack-"));
const installDir = mkdtempSync(join(tmpdir(), "cairn-install-"));

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

const packJson = run("npm", ["pack", "--json", "--pack-destination", packDir]);
const packInfo = JSON.parse(packJson);
const filename = packInfo?.[0]?.filename;
if (!filename) {
  throw new Error(`npm pack did not report a tarball filename: ${packJson}`);
}

const tarball = isAbsolute(filename) ? filename : join(packDir, filename);
if (!existsSync(tarball)) {
  throw new Error(`npm pack reported ${tarball}, but the file does not exist`);
}

run("npm", ["init", "-y"], { cwd: installDir, stdio: "ignore" });
run("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: installDir,
  stdio: "ignore",
});

const cliPath = join(installDir, "node_modules", "@yakdo", "cairn", "dist", "cli.js");
const cliHelp = run(process.execPath, [cliPath, "--help"], { cwd: installDir });
if (!cliHelp.includes("cairn — pictogram map generator")) {
  throw new Error("installed CLI did not print the expected help text");
}

const smokePath = join(installDir, "mcp-smoke.mjs");
writeFileSync(
  smokePath,
  `
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["node_modules/@yakdo/cairn/dist/server.js"],
  cwd: process.cwd(),
});
const client = new Client({ name: "cairn-package-smoke", version: "0.0.0" });

try {
  await client.connect(transport);
  const result = await client.listTools();
  const names = result.tools.map((tool) => tool.name).sort();
  const expected = ["find_landmarks", "find_roads", "generate_map", "geocode"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(\`unexpected tools: \${names.join(", ")}\`);
  }
  for (const tool of result.tools) {
    if (!tool.inputSchema || !tool.outputSchema) {
      throw new Error(\`\${tool.name} is missing inputSchema/outputSchema\`);
    }
  }
} finally {
  await client.close();
}
`,
  "utf8",
);

run(process.execPath, [smokePath], { cwd: installDir, stdio: "inherit" });
console.log(`package smoke passed: ${tarball}`);
