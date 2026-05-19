#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { generateMap } from "./pipeline.js";

const HELP = `
cairn — pictogram map generator

USAGE
  cairn <address> [options]
  cairn generate <address> [options]

OPTIONS
  -o, --output <file>     Write SVG to file (default: stdout)
  -l, --label <text>      Label for the destination (default: "여기")
  -r, --radius <meters>   Landmark search radius (default: 400)
  -n, --limit <count>     Max landmarks to include (default: 5)
  -w, --width <px>        SVG width (default: 600)
  -h, --height <px>       SVG height (default: 400)
      --help              Show this help

EXAMPLES
  cairn "서울 강남구 테헤란로 152" -o office.svg
  cairn "1600 Amphitheatre Pkwy, Mountain View" --label "Office"
  cairn "Shibuya Crossing, Tokyo" -n 4 -r 300
`;

function parse(argv: string[]) {
  const positional: string[] = [];
  const opts: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-o":
      case "--output":
        opts.output = argv[++i];
        break;
      case "-l":
      case "--label":
        opts.label = argv[++i];
        break;
      case "-r":
      case "--radius":
        opts.radius = argv[++i];
        break;
      case "-n":
      case "--limit":
        opts.limit = argv[++i];
        break;
      case "-w":
      case "--width":
        opts.width = argv[++i];
        break;
      case "-h":
      case "--height":
        opts.height = argv[++i];
        break;
      case "--help":
        opts.help = "true";
        break;
      default:
        positional.push(a);
    }
  }
  return { positional, opts };
}

async function main() {
  const argv = process.argv.slice(2);
  const { positional, opts } = parse(argv);

  if (argv.length === 0 || opts.help === "true") {
    console.log(HELP);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const address =
    positional[0] === "generate" ? positional[1] : positional[0];

  if (!address) {
    console.error("Error: address required");
    console.log(HELP);
    process.exit(1);
  }

  const { svg, layout } = await generateMap(address, {
    label: opts.label,
    radiusMeters: opts.radius ? parseInt(opts.radius, 10) : undefined,
    limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
    width: opts.width ? parseInt(opts.width, 10) : undefined,
    height: opts.height ? parseInt(opts.height, 10) : undefined,
  });

  if (opts.output) {
    writeFileSync(opts.output, svg, "utf8");
    console.error(
      `✓ ${opts.output}  (${layout.landmarks.length} landmarks · center: ${layout.center.lat.toFixed(5)}, ${layout.center.lon.toFixed(5)})`,
    );
  } else {
    process.stdout.write(svg);
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
