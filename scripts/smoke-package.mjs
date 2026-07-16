import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
// Derive the package name from package.json so a rename can't silently break
// the smoke paths/imports below (this file once hardcoded a stale name).
const packageName = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name;
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

const installedPackageDir = join(installDir, "node_modules", ...packageName.split("/"));
const cliPath = join(installedPackageDir, "dist", "cli.js");
const cliHelp = run(process.execPath, [cliPath, "--help"], { cwd: installDir });
if (!cliHelp.includes("cairn — pictogram map generator")) {
  throw new Error("installed CLI did not print the expected help text");
}

const installedSkill = join(installedPackageDir, "skills", "create-wayfinding-map", "SKILL.md");
if (!existsSync(installedSkill)) {
  throw new Error("installed package is missing the create-wayfinding-map skill");
}
const installedSkillText = readFileSync(installedSkill, "utf8");
if (!installedSkillText.includes("render_document") || /\bTODO\b/.test(installedSkillText)) {
  throw new Error("installed skill is stale or incomplete");
}
const hostSkillsDir = join(installDir, "host-skills");
const installedByCli = run(process.execPath, [cliPath, "install-skill", hostSkillsDir], {
  cwd: installDir,
}).trim();
if (!existsSync(join(installedByCli, "SKILL.md"))) {
  throw new Error("installed CLI did not install the packaged skill");
}
let overwriteRefused = false;
try {
  run(process.execPath, [cliPath, "install-skill", hostSkillsDir], { cwd: installDir });
} catch {
  overwriteRefused = true;
}
if (!overwriteRefused) throw new Error("skill installer overwrote an existing skill");

const cliDocumentPath = join(installDir, "map.json");
const cliSvgPath = join(installDir, "map.svg");
const cliPngPath = join(installDir, "map.png");
const cliPdfPath = join(installDir, "map.pdf");
writeFileSync(cliDocumentPath, JSON.stringify({
  version: 1,
  map: {
    center: { lat: 37.5, lon: 127, label: "Destination" },
    landmarks: [{
      id: "gate",
      name: "Main gate",
      lat: 37.5005,
      lon: 127.0005,
      category: "landmark",
      importance: 1,
      tags: {},
    }],
    roads: [],
    bbox: { north: 37.501, south: 37.499, east: 127.001, west: 126.999 },
  },
  canvas: { width: 600, height: 400 },
  render: { layout: "diagram", template: "standard", theme: "mono", focus: false },
  overrides: {},
}));
run(process.execPath, [cliPath, "render", cliDocumentPath, "-o", cliSvgPath], {
  cwd: installDir,
  stdio: "ignore",
});
if (!readFileSync(cliSvgPath, "utf8").includes('data-theme="mono"')) {
  throw new Error("installed CLI did not re-render DiagramDocument JSON");
}
run(process.execPath, [cliPath, "render", cliDocumentPath, "-o", cliPngPath], {
  cwd: installDir,
  stdio: "ignore",
});
run(process.execPath, [cliPath, "render", cliDocumentPath, "-o", cliPdfPath], {
  cwd: installDir,
  stdio: "ignore",
});
if (!readFileSync(cliPngPath).subarray(1, 4).equals(Buffer.from("PNG"))) {
  throw new Error("installed CLI did not export PNG");
}
if (readFileSync(cliPdfPath).subarray(0, 8).toString("ascii") !== "%PDF-1.4") {
  throw new Error("installed CLI did not export PDF");
}

const smokePath = join(installDir, "mcp-smoke.mjs");
writeFileSync(
  smokePath,
  `
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["node_modules/${packageName}/dist/server.js"],
  cwd: process.cwd(),
});
const client = new Client({ name: "cairn-package-smoke", version: "0.0.0" });

try {
  await client.connect(transport);
  const result = await client.listTools();
  const names = result.tools.map((tool) => tool.name).sort();
  const expected = ["find_landmarks", "find_roads", "generate_map", "geocode", "render_document"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(\`unexpected tools: \${names.join(", ")}\`);
  }
  for (const tool of result.tools) {
    if (!tool.inputSchema || !tool.outputSchema) {
      throw new Error(\`\${tool.name} is missing inputSchema/outputSchema\`);
    }
  }
  const document = {
    version: 1,
    map: {
      center: { lat: 37.5, lon: 127, label: "Destination" },
      landmarks: [{
        id: "gate",
        name: "Main gate",
        lat: 37.5005,
        lon: 127.0005,
        category: "landmark",
        importance: 1,
        tags: {},
      }],
      roads: [],
      bbox: { north: 37.501, south: 37.499, east: 127.001, west: 126.999 },
    },
    canvas: { width: 600, height: 400 },
    render: { layout: "diagram", template: "standard", theme: "paper", focus: false },
    overrides: {},
  };
  const rendered = await client.callTool({
    name: "render_document",
    arguments: {
      document,
      patch: {
        destinationLabel: "Student Center",
        render: { theme: "mono", approachLandmarkId: "gate" },
      },
    },
  });
  if (rendered.isError) throw new Error("installed render_document returned an error");
  if (rendered.structuredContent?.document?.render?.theme !== "mono") {
    throw new Error("installed render_document did not return the patched document");
  }
  if (rendered.structuredContent?.document?.render?.approachLandmarkId !== "gate") {
    throw new Error("installed render_document did not preserve the selected start landmark");
  }
  if (!rendered.structuredContent?.svg?.includes('data-theme="mono"')) {
    throw new Error("installed render_document did not return the patched SVG");
  }
} finally {
  await client.close();
}
`,
  "utf8",
);

run(process.execPath, [smokePath], { cwd: installDir, stdio: "inherit" });

const documentSmokePath = join(installDir, "document-smoke.mjs");
writeFileSync(
  documentSmokePath,
  `
import { createDiagramDocument, renderDiagramDocument } from "${packageName}/document";
import { artifactFormatFromPath, encodeMapArtifact } from "${packageName}/export";
import { renderSVG } from "${packageName}/render";
import { RENDER_TEMPLATES, RENDER_THEMES } from "${packageName}/options";

const map = {
  center: { lat: 37.5, lon: 127, label: "Destination" },
  landmarks: [{
    id: "gate",
    name: "Main gate",
    lat: 37.5005,
    lon: 127.0005,
    category: "landmark",
    importance: 1,
    tags: {},
  }],
  roads: [],
  bbox: { north: 37.501, south: 37.499, east: 127.001, west: 126.999 },
};
const document = createDiagramDocument(map, {
  template: "standard",
  theme: "civic",
  overrides: { landmarks: { gate: { position: { x: 0.25, y: 0.25 } } } },
});
const svg = renderDiagramDocument(JSON.parse(JSON.stringify(document)));
if (!svg.includes('data-template="standard"') || !svg.includes('data-theme="civic"')) {
  throw new Error("document subpath did not preserve template/theme");
}
if (!renderSVG(map).startsWith("<svg")) {
  throw new Error("render subpath did not return SVG");
}
if (RENDER_TEMPLATES.length !== 5 || RENDER_THEMES.length !== 4) {
  throw new Error("options subpath did not expose template/theme choices");
}
if (artifactFormatFromPath("map.pdf") !== "pdf") {
  throw new Error("export subpath did not expose artifact helpers");
}
if (!Buffer.isBuffer(encodeMapArtifact(svg, document.canvas, "png"))) {
  throw new Error("export subpath did not encode PNG");
}
`,
  "utf8",
);

run(process.execPath, [documentSmokePath], { cwd: installDir, stdio: "inherit" });
console.log(`package smoke passed: ${tarball}`);
