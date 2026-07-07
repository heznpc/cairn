#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { generateMap } from "./pipeline.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MAX_RADIUS_METERS,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";

const HELP = `
cairn — pictogram map generator

USAGE
  cairn <address> [options]
  cairn generate <address> [options]

OPTIONS
  -o, --output <file>     Write SVG to file (default: stdout)
  -l, --label <text>      Label for the destination (default: "여기")
  -r, --radius <meters>   Landmark search radius (default: 400, max ${MAX_RADIUS_METERS})
  -n, --limit <count>     Max landmarks to include (default: 5)
  -w, --width <px>        SVG width (default: 600, ${MIN_CANVAS_DIMENSION_PX}-${MAX_CANVAS_DIMENSION_PX})
  -h, --height <px>       SVG height (default: 400, ${MIN_CANVAS_DIMENSION_PX}-${MAX_CANVAS_DIMENSION_PX})
      --layout <mode>     Render layout: diagram or geographic (default: diagram)
      --preset <name>     Output form: standard, compact, minimal, schematic, or badge (default: standard)
      --no-roads          Skip the road skeleton (landmarks only)
      --focus             Fisheye-emphasize the destination area (standard/compact/schematic)
      --help              Show this help

EXAMPLES
  cairn "서울 강남구 테헤란로 152" -o office.svg
  cairn "1600 Amphitheatre Pkwy, Mountain View" --label "Office"
  cairn "Shibuya Crossing, Tokyo" -n 4 -r 300
`;

function parse(argv: string[]) {
  const positional: string[] = [];
  const opts: Record<string, string> = {};

  // Take the next argv entry as the value for `flag`. Refuses when nothing
  // follows (silent undefined would lie about the Record<string,string>
  // type) and when the next entry starts with "-" (caller forgot the
  // value; we'd swallow the next flag instead, e.g. `-o --label "x"`
  // becoming opts.output="--label").
  const takeValue = (flag: string, i: number): string => {
    const v = argv[i];
    if (v === undefined) {
      throw new Error(`${flag} requires a value`);
    }
    if (v.startsWith("-")) {
      throw new Error(`${flag} requires a value (got flag-like "${v}")`);
    }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-o":
      case "--output":
        opts.output = takeValue(a, ++i);
        break;
      case "-l":
      case "--label":
        opts.label = takeValue(a, ++i);
        break;
      case "-r":
      case "--radius":
        opts.radius = takeValue(a, ++i);
        break;
      case "-n":
      case "--limit":
        opts.limit = takeValue(a, ++i);
        break;
      case "-w":
      case "--width":
        opts.width = takeValue(a, ++i);
        break;
      case "-h":
      case "--height":
        opts.height = takeValue(a, ++i);
        break;
      case "--layout":
        opts.layout = takeValue(a, ++i);
        break;
      case "--preset":
        opts.preset = takeValue(a, ++i);
        break;
      case "--no-roads":
        opts.noRoads = "true";
        break;
      case "--focus":
        opts.focus = "true";
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

  const parseFlag = (
    flag: string,
    raw: string | undefined,
    min = 1,
    max?: number,
  ): number | undefined => {
    if (raw === undefined) return undefined;
    // Reject anything but unsigned decimal digits before going to Number().
    // parseInt("400px",10)===400 truncates typos like "1k" silently.
    // Number("0x100")===256 and Number("1e3")===1000 both pass Number.isInteger.
    // A strict digit regex catches all three.
    if (!/^[0-9]+$/.test(raw)) {
      throw new Error(`${flag} must be an integer ≥ ${min} (got: "${raw}")`);
    }
    const n = Number(raw);
    if (n < min) {
      throw new Error(`${flag} must be an integer ≥ ${min} (got: "${raw}")`);
    }
    if (max !== undefined && n > max) {
      throw new Error(`${flag} must be an integer ≤ ${max} (got: "${raw}")`);
    }
    return n;
  };

  const parseLayout = (raw: string | undefined) => {
    if (raw === undefined) return undefined;
    if (raw !== "diagram" && raw !== "geographic") {
      throw new Error(`--layout must be "diagram" or "geographic" (got: "${raw}")`);
    }
    return raw;
  };

  const parsePreset = (raw: string | undefined) => {
    if (raw === undefined) return undefined;
    if (raw !== "standard" && raw !== "compact" && raw !== "minimal" && raw !== "schematic" && raw !== "badge") {
      throw new Error(`--preset must be "standard", "compact", "minimal", "schematic", or "badge" (got: "${raw}")`);
    }
    return raw;
  };

  const { svg, layout } = await generateMap(address, {
    label: opts.label,
    radiusMeters: parseFlag("--radius", opts.radius, 1, MAX_RADIUS_METERS),
    limit: parseFlag("--limit", opts.limit),
    // width/height ≥ 100 — render.ts projection uses (width - 100) as denom.
    width: parseFlag("--width", opts.width, MIN_CANVAS_DIMENSION_PX, MAX_CANVAS_DIMENSION_PX),
    height: parseFlag("--height", opts.height, MIN_CANVAS_DIMENSION_PX, MAX_CANVAS_DIMENSION_PX),
    layout: parseLayout(opts.layout),
    preset: parsePreset(opts.preset),
    roads: opts.noRoads === "true" ? false : undefined,
    focus: opts.focus === "true" ? true : undefined,
  });

  if (opts.output) {
    writeFileSync(opts.output, svg, "utf8");
    console.error(
      `✓ ${opts.output}  (${layout.landmarks.length} landmarks · ${layout.roads.length} roads · center: ${layout.center.lat.toFixed(5)}, ${layout.center.lon.toFixed(5)})`,
    );
  } else {
    process.stdout.write(svg);
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
