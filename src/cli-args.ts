import type { GenerateMapInput } from "./pipeline.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MAX_RADIUS_METERS,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";
import {
  isSupportedLabelLanguage,
  SUPPORTED_LABEL_LANGUAGES,
} from "./locale.js";
import {
  defaultCacheDir,
  isCacheMode,
  type UpstreamOptions,
} from "./upstream-config.js";
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
  cairn render <document.json> [options]
  cairn install-skill <skills-directory>

OPTIONS
  -o, --output <file>     Write SVG, PNG, or PDF by extension (default: SVG stdout)
      --save-document <file>
                          Save editable DiagramDocument JSON when generating
  -l, --label <text>      Label for the destination (default: localized "Here")
      --language <tag>    Language for generated labels, e.g. ko, ja, de
                          (default: derived from the destination's country)
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

NETWORK & CACHE
  Responses are cached on disk, so re-running the same address costs no
  requests. Defaults suit the public OSM endpoints; override for a mirror.
      --offline           Use cached responses only; fail instead of fetching
      --refresh           Ignore cached responses and fetch fresh ones
      --no-cache          Neither read nor write the cache
      --cache-dir <dir>   Cache location (default: ${defaultCacheDir()})
      --nominatim-url <url>
                          Geocoding endpoint (self-hosted or mirror)
      --overpass-url <url>
                          Overpass endpoint (self-hosted or mirror)

ENVIRONMENT
  CAIRN_NOMINATIM_URL, CAIRN_OVERPASS_URL, CAIRN_CACHE_MODE, CAIRN_CACHE_DIR,
  CAIRN_CACHE_TTL_HOURS, CAIRN_ATTEMPTS, CAIRN_RETRY_BASE_DELAY_MS,
  CAIRN_NOMINATIM_MIN_INTERVAL_MS, CAIRN_OVERPASS_MIN_INTERVAL_MS

EXAMPLES
  cairn "서울 강남구 테헤란로 152" -o office.svg
  cairn "서울 강남구 테헤란로 152" -o office.svg --save-document office.json
  cairn render office.json -o office-revised.svg
  cairn install-skill ~/.codex/skills
  cairn "1600 Amphitheatre Pkwy, Mountain View" --label "Office"
  cairn "Shibuya Crossing, Tokyo" -n 4 -r 300
  cairn "Brandenburger Tor, Berlin" --language de -o berlin.svg
  cairn "Sergels torg, Stockholm" --offline -o stockholm.svg
  cairn "Piccadilly Circus, London" --overpass-url https://overpass.private/api/interpreter
`;

export type CliRequest =
  | { kind: "help"; exitCode: 0 | 1 }
  | { kind: "missing-address" }
  | { kind: "missing-document" }
  | { kind: "missing-skill-target" }
  | {
      kind: "install-skill";
      target: string;
    }
  | {
      kind: "render-document";
      input: string;
      output?: string;
    }
  | {
      kind: "generate";
      address: string;
      output?: string;
      documentOutput?: string;
      options: GenerateMapInput;
    };

export function parseCliRequest(argv: string[]): CliRequest {
  const { positional, opts } = parse(argv);

  if (argv.length === 0 || opts.help === "true") {
    return { kind: "help", exitCode: argv.length === 0 ? 1 : 0 };
  }

  if (positional[0] === "render") {
    const input = positional[1];
    if (!input) return { kind: "missing-document" };
    return {
      kind: "render-document",
      input,
      output: opts.output,
    };
  }

  if (positional[0] === "install-skill") {
    const target = positional[1];
    if (!target) return { kind: "missing-skill-target" };
    return { kind: "install-skill", target };
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
    documentOutput: opts.documentOutput,
    options: {
      label: opts.label,
      language: parseLanguage("--language", opts.language),
      radiusMeters: parseFlag("--radius", opts.radius, 1, MAX_RADIUS_METERS),
      limit: parseFlag("--limit", opts.limit),
      // width/height >= 100 — render.ts projection uses (width - 100) as denom.
      width: parseFlag("--width", opts.width, MIN_CANVAS_DIMENSION_PX, MAX_CANVAS_DIMENSION_PX),
      height: parseFlag("--height", opts.height, MIN_CANVAS_DIMENSION_PX, MAX_CANVAS_DIMENSION_PX),
      layout: parseEnum("--layout", opts.layout, isRenderLayoutMode, RENDER_LAYOUTS),
      template: parseEnum("--template", opts.template, isRenderTemplate, RENDER_TEMPLATES),
      theme: parseEnum("--theme", opts.theme, isRenderTheme, RENDER_THEMES),
      preset: parseEnum("--preset", opts.preset, isRenderPreset, RENDER_PRESETS),
      roads: opts.noRoads === "true" ? false : undefined,
      focus: opts.focus === "true" ? true : undefined,
      upstream: parseUpstream(opts),
    },
  };
}

// Collapse the network flags into an UpstreamOptions, or undefined when none
// were given so `resolveUpstream` falls through to environment defaults.
function parseUpstream(opts: Record<string, string>): UpstreamOptions | undefined {
  const upstream: UpstreamOptions = {};
  if (opts.cacheMode !== undefined) {
    if (!isCacheMode(opts.cacheMode)) {
      throw new Error(`Invalid cache mode: "${opts.cacheMode}"`);
    }
    upstream.cacheMode = opts.cacheMode;
  }
  if (opts.cacheDir !== undefined) upstream.cacheDir = opts.cacheDir;
  if (opts.nominatimUrl !== undefined) upstream.nominatimUrl = opts.nominatimUrl;
  if (opts.overpassUrl !== undefined) upstream.overpassUrl = opts.overpassUrl;
  return Object.keys(upstream).length > 0 ? upstream : undefined;
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
      case "--language":
        opts.language = takeValue(a, ++i);
        break;
      case "--save-document":
        opts.documentOutput = takeValue(a, ++i);
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
      case "--offline":
        opts.cacheMode = "offline";
        break;
      case "--refresh":
        opts.cacheMode = "refresh";
        break;
      case "--no-cache":
        opts.cacheMode = "off";
        break;
      case "--cache-dir":
        opts.cacheDir = takeValue(a, ++i);
        break;
      case "--nominatim-url":
        opts.nominatimUrl = takeValue(a, ++i);
        break;
      case "--overpass-url":
        opts.overpassUrl = takeValue(a, ++i);
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

// Fail loudly on an unsupported --language rather than silently falling back
// to English: someone who typed a tag wants that language, and a wrong exit
// label is easy to miss on a printed card.
function parseLanguage(flag: string, raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (!isSupportedLabelLanguage(raw)) {
    throw new Error(
      `${flag} must be one of ${SUPPORTED_LABEL_LANGUAGES.join(", ")} (got: "${raw}")`,
    );
  }
  return raw;
}

// One validator for every enum-valued flag: the type guard both narrows the
// return type and drives the error message's choice list.
function parseEnum<T extends string>(
  flag: string,
  raw: string | undefined,
  guard: (value: string) => value is T,
  choices: readonly string[],
): T | undefined {
  if (raw === undefined) return undefined;
  if (!guard(raw)) {
    throw new Error(`${flag} must be ${quotedChoiceList(choices)} (got: "${raw}")`);
  }
  return raw;
}
