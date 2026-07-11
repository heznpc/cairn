import type { GenerateMapInput } from "./pipeline.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MAX_RADIUS_METERS,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";
import {
  isRenderLayoutMode,
  isRenderPreset,
  isRenderTemplate,
  isRenderTheme,
  quotedChoiceList,
  RENDER_LAYOUT_HELP,
  RENDER_LAYOUTS,
  RENDER_PRESET_HELP,
  RENDER_PRESETS,
  RENDER_TEMPLATE_HELP,
  RENDER_TEMPLATES,
  RENDER_THEME_HELP,
  RENDER_THEMES,
} from "./options.js";

export const HELP = `
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
      --layout <mode>     Render layout: ${RENDER_LAYOUT_HELP} (default: diagram)
      --template <name>   Composition: ${RENDER_TEMPLATE_HELP} (default: standard)
      --theme <name>      Visual style: ${RENDER_THEME_HELP} (default: paper)
      --preset <name>     Compatibility alias for --template: ${RENDER_PRESET_HELP}
      --no-roads          Skip the road skeleton (landmarks only)
      --focus             Fisheye-emphasize the destination area (standard/compact/schematic)
      --help              Show this help

EXAMPLES
  cairn "서울 강남구 테헤란로 152" -o office.svg
  cairn "1600 Amphitheatre Pkwy, Mountain View" --label "Office"
  cairn "Shibuya Crossing, Tokyo" -n 4 -r 300
`;

export type CliRequest =
  | { kind: "help"; exitCode: 0 | 1 }
  | { kind: "missing-address" }
  | {
      kind: "generate";
      address: string;
      output?: string;
      options: GenerateMapInput;
    };

export function parseCliRequest(argv: string[]): CliRequest {
  const { positional, opts } = parse(argv);

  if (argv.length === 0 || opts.help === "true") {
    return { kind: "help", exitCode: argv.length === 0 ? 1 : 0 };
  }

  const address =
    positional[0] === "generate" ? positional[1] : positional[0];

  if (!address) {
    return { kind: "missing-address" };
  }

  return {
    kind: "generate",
    address,
    output: opts.output,
    options: {
      label: opts.label,
      radiusMeters: parseFlag("--radius", opts.radius, 1, MAX_RADIUS_METERS),
      limit: parseFlag("--limit", opts.limit),
      // width/height >= 100 — render.ts projection uses (width - 100) as denom.
      width: parseFlag("--width", opts.width, MIN_CANVAS_DIMENSION_PX, MAX_CANVAS_DIMENSION_PX),
      height: parseFlag("--height", opts.height, MIN_CANVAS_DIMENSION_PX, MAX_CANVAS_DIMENSION_PX),
      layout: parseLayout(opts.layout),
      template: parseTemplate(opts.template),
      theme: parseTheme(opts.theme),
      preset: parsePreset(opts.preset),
      roads: opts.noRoads === "true" ? false : undefined,
      focus: opts.focus === "true" ? true : undefined,
    },
  };
}

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
      case "--template":
        opts.template = takeValue(a, ++i);
        break;
      case "--theme":
        opts.theme = takeValue(a, ++i);
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

function parseFlag(
  flag: string,
  raw: string | undefined,
  min = 1,
  max?: number,
): number | undefined {
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
}

function parseLayout(raw: string | undefined) {
  if (raw === undefined) return undefined;
  if (!isRenderLayoutMode(raw)) {
    throw new Error(`--layout must be ${quotedChoiceList(RENDER_LAYOUTS)} (got: "${raw}")`);
  }
  return raw;
}

function parsePreset(raw: string | undefined) {
  if (raw === undefined) return undefined;
  if (!isRenderPreset(raw)) {
    throw new Error(`--preset must be ${quotedChoiceList(RENDER_PRESETS)} (got: "${raw}")`);
  }
  return raw;
}

function parseTemplate(raw: string | undefined) {
  if (raw === undefined) return undefined;
  if (!isRenderTemplate(raw)) {
    throw new Error(`--template must be ${quotedChoiceList(RENDER_TEMPLATES)} (got: "${raw}")`);
  }
  return raw;
}

function parseTheme(raw: string | undefined) {
  if (raw === undefined) return undefined;
  if (!isRenderTheme(raw)) {
    throw new Error(`--theme must be ${quotedChoiceList(RENDER_THEMES)} (got: "${raw}")`);
  }
  return raw;
}
