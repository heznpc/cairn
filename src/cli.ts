#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { generateMap } from "./pipeline.js";
import { HELP, parseCliRequest } from "./cli-args.js";

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

  const { svg, layout } = await generateMap(request.address, request.options);

  if (request.output) {
    writeFileSync(request.output, svg, "utf8");
    console.error(
      `✓ ${request.output}  (${layout.landmarks.length} landmarks · ${layout.roads.length} roads · center: ${layout.center.lat.toFixed(5)}, ${layout.center.lon.toFixed(5)})`,
    );
  } else {
    process.stdout.write(svg);
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
