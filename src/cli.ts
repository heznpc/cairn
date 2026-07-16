#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateMap } from "./pipeline.js";
import { HELP, parseCliRequest } from "./cli-args.js";
import { parseDiagramDocument } from "./diagram-schema.js";
import { renderDiagramDocument } from "./diagram-document.js";
import { artifactFormatFromPath, encodeMapArtifact } from "./export.js";

async function main() {
  const argv = process.argv.slice(2);
  const request = parseCliRequest(argv);

  if (request.kind === "help") {
    console.log(HELP);
    process.exit(request.exitCode);
  }

  if (request.kind === "missing-address") {
    console.error("Error: address required");
    console.log(HELP);
    process.exit(1);
  }

  if (request.kind === "missing-document") {
    console.error("Error: document path required");
    console.log(HELP);
    process.exit(1);
  }

  if (request.kind === "missing-skill-target") {
    console.error("Error: host skills directory required");
    console.log(HELP);
    process.exit(1);
  }

  if (request.kind === "install-skill") {
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const source = resolve(packageRoot, "skills", "create-wayfinding-map");
    const destination = resolve(request.target, "create-wayfinding-map");
    if (!existsSync(source)) throw new Error(`Packaged skill not found: ${source}`);
    if (existsSync(destination)) {
      throw new Error(`Skill already exists; refusing to overwrite: ${destination}`);
    }
    mkdirSync(request.target, { recursive: true });
    cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
    console.log(destination);
    return;
  }

  if (request.kind === "render-document") {
    const document = parseDiagramDocument(
      JSON.parse(readFileSync(request.input, "utf8")),
    );
    const svg = renderDiagramDocument(document);
    if (request.output) {
      writeArtifact(request.output, svg, document.canvas);
      console.error(
        `✓ ${request.output}  (${document.map.landmarks.length} landmarks · ${document.render.template}/${document.render.theme})`,
      );
    } else {
      process.stdout.write(svg);
    }
    return;
  }

  const { svg, layout, document } = await generateMap(request.address, request.options);

  if (request.documentOutput) {
    writeFileSync(
      request.documentOutput,
      `${JSON.stringify(document, null, 2)}\n`,
      "utf8",
    );
    console.error(`✓ ${request.documentOutput}  (editable document)`);
  }

  if (request.output) {
    writeArtifact(request.output, svg, document.canvas);
    console.error(
      `✓ ${request.output}  (${layout.landmarks.length} landmarks · ${layout.roads.length} roads · center: ${layout.center.lat.toFixed(5)}, ${layout.center.lon.toFixed(5)})`,
    );
  } else {
    process.stdout.write(svg);
  }
}

function writeArtifact(
  path: string,
  svg: string,
  canvas: { width: number; height: number },
): void {
  const artifact = encodeMapArtifact(svg, canvas, artifactFormatFromPath(path));
  writeFileSync(path, artifact, typeof artifact === "string" ? "utf8" : undefined);
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
