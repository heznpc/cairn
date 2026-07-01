import { z } from "zod";
import { generateMap } from "./pipeline.js";
import { geocode } from "./geocode.js";
import { findLandmarks } from "./landmarks.js";
import { findRoads } from "./roads.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MAX_RADIUS_METERS,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";
import type { LandmarkCategory, RenderLayoutMode, RenderPreset, RoadClass } from "./types.js";

// ---------- Input schemas (zod) ----------

// `language` is intentionally NOT exposed: render.ts has no localization yet,
// and advertising a flag that's silently dropped breaks the host-LLM contract.
// Re-add once render.ts honors it.
const RadiusArg = z.number().int().min(1).max(MAX_RADIUS_METERS);
const CanvasDimensionArg = z.number().int().min(MIN_CANVAS_DIMENSION_PX).max(MAX_CANVAS_DIMENSION_PX);
const LatitudeArg = z.number().finite().min(-90).max(90);
const LongitudeArg = z.number().finite().min(-180).max(180);
const RENDER_LAYOUTS = ["diagram", "geographic"] as const satisfies readonly RenderLayoutMode[];
const RenderLayoutArg = z.enum(RENDER_LAYOUTS);
const RENDER_PRESETS = ["standard", "compact", "minimal"] as const satisfies readonly RenderPreset[];
const RenderPresetArg = z.enum(RENDER_PRESETS);

const GenerateMapArgs = z.object({
  address: z.string().describe("Street address or place name"),
  label: z.string().optional().describe('Label for the destination (default: "여기")'),
  radiusMeters: RadiusArg.optional().describe("Landmark search radius (default 400, max 5000)"),
  limit: z.number().int().min(1).optional().describe("Max landmarks to include (default 5)"),
  // width/height ≥ 100 — render.ts projection uses (width - 100) as denominator.
  width: CanvasDimensionArg.optional(),
  height: CanvasDimensionArg.optional(),
  layout: RenderLayoutArg.optional().describe('Render layout mode (default "diagram")'),
  preset: RenderPresetArg.optional().describe('Output form: "standard" (default), "compact", or "minimal"'),
  roads: z
    .boolean()
    .optional()
    .describe("Draw the road skeleton (default true). Set false to skip the extra Overpass round-trip."),
});

const GeocodeArgs = z.object({
  address: z.string(),
});

const FindLandmarksArgs = z.object({
  lat: LatitudeArg,
  lon: LongitudeArg,
  radiusMeters: RadiusArg.optional(),
});

const FindRoadsArgs = z.object({
  lat: LatitudeArg,
  lon: LongitudeArg,
  radiusMeters: RadiusArg.optional(),
});

// ---------- Output schemas (JSON Schema for MCP outputSchema) ----------
// MCP 2025-06-18 spec §tools.outputSchema. Host LLMs validate structuredContent
// against these and can read results structurally instead of parsing text.

const LANDMARK_CATEGORIES = [
  "station",
  "station_exit",
  "bus_stop",
  "cafe",
  "convenience",
  "restaurant",
  "school",
  "hospital",
  "park",
  "landmark",
  "building",
] as const;

// Compile-time guarantee that LANDMARK_CATEGORIES *exactly* covers
// LandmarkCategory. If a category is added to one side without the other,
// one of these `Missing` / `Extra` aliases gains a value and the
// `AssertNever`-typed constant below stops compiling.
type AssertNever<T> = [T] extends [never]
  ? true
  : { error: "LANDMARK_CATEGORIES drift — update both sides"; offenders: T };
type _Missing = Exclude<LandmarkCategory, (typeof LANDMARK_CATEGORIES)[number]>;
type _Extra = Exclude<(typeof LANDMARK_CATEGORIES)[number], LandmarkCategory>;
const _categoryNoneMissing: AssertNever<_Missing> = true;
const _categoryNoneExtra: AssertNever<_Extra> = true;
void _categoryNoneMissing;
void _categoryNoneExtra;

const ROAD_CLASSES = [
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "path",
] as const;

// Same drift guard as LANDMARK_CATEGORIES: keep ROAD_CLASSES and RoadClass
// exactly in sync, fail compilation if either side gains a value.
type _RoadMissing = Exclude<RoadClass, (typeof ROAD_CLASSES)[number]>;
type _RoadExtra = Exclude<(typeof ROAD_CLASSES)[number], RoadClass>;
const _roadNoneMissing: AssertNever<_RoadMissing> = true;
const _roadNoneExtra: AssertNever<_RoadExtra> = true;
void _roadNoneMissing;
void _roadNoneExtra;

// `additionalProperties: false` everywhere so the Ajv contract tests fail loud
// when the runtime payload (Landmark type, MapLayout, etc.) drifts from the
// declared schema. Without it, Ajv defaults to permissive and undeclared
// fields ship silently to hosts.
const landmarkItemSchema = {
  type: "object",
  required: ["id", "name", "lat", "lon", "category", "importance"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    lat: { type: "number" },
    lon: { type: "number" },
    category: { type: "string", enum: LANDMARK_CATEGORIES },
    importance: { type: "number" },
    // OSM tag bag. Values are strings on the wire; we mirror that.
    tags: {
      type: "object",
      additionalProperties: { type: "string" },
    },
  },
} as const;

const roadItemSchema = {
  type: "object",
  required: ["id", "class", "points"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    class: { type: "string", enum: ROAD_CLASSES },
    points: {
      type: "array",
      items: {
        type: "object",
        required: ["lat", "lon"],
        additionalProperties: false,
        properties: {
          lat: { type: "number" },
          lon: { type: "number" },
        },
      },
    },
  },
} as const;

const generateMapOutputSchema = {
  type: "object",
  required: ["svg", "layout"],
  additionalProperties: false,
  properties: {
    svg: {
      type: "string",
      description: "Rendered SVG markup, ready to embed or write to a file.",
    },
    layout: {
      type: "object",
      required: ["center", "landmarks", "roads", "bbox"],
      additionalProperties: false,
      properties: {
        center: {
          type: "object",
          required: ["lat", "lon", "label"],
          additionalProperties: false,
          properties: {
            lat: { type: "number", minimum: -90, maximum: 90 },
            lon: { type: "number", minimum: -180, maximum: 180 },
            label: { type: "string" },
          },
        },
        landmarks: { type: "array", items: landmarkItemSchema },
        roads: { type: "array", items: roadItemSchema },
        bbox: {
          type: "object",
          required: ["north", "south", "east", "west"],
          additionalProperties: false,
          properties: {
            north: { type: "number" },
            south: { type: "number" },
            east: { type: "number" },
            west: { type: "number" },
          },
        },
      },
    },
  },
} as const;

const geocodeOutputSchema = {
  type: "object",
  required: ["lat", "lon", "displayName"],
  additionalProperties: false,
  properties: {
    lat: { type: "number", minimum: -90, maximum: 90 },
    lon: { type: "number", minimum: -180, maximum: 180 },
    displayName: { type: "string" },
    // Raw Nominatim payload (addressdetails=1 is already requested by geocode.ts).
    // Shape varies — host LLMs use this for follow-up reasoning
    // (city / country_code / road / suburb). Schema is intentionally permissive.
    raw: { type: "object" },
  },
} as const;

const findLandmarksOutputSchema = {
  type: "object",
  required: ["landmarks"],
  additionalProperties: false,
  properties: {
    landmarks: { type: "array", items: landmarkItemSchema },
  },
} as const;

const findRoadsOutputSchema = {
  type: "object",
  required: ["roads"],
  additionalProperties: false,
  properties: {
    roads: { type: "array", items: roadItemSchema },
  },
} as const;

// `idempotentHint` is deliberately omitted (defaults to false per MCP spec).
// Nominatim/Overpass return time-varying POI data — two calls months apart
// can legitimately differ as OSM is edited, and a destination business may
// move. Asserting idempotency would let hosts cache stale results.
const safeAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true, // hits Nominatim / Overpass
} as const;

// ---------- Tool registry ----------

export const tools = [
  {
    name: "generate_map",
    description:
      "Generate a pictogram-style wayfinding map SVG for an address. " +
      "Returns ready-to-print SVG suitable for business cards, wedding invitations, " +
      "or store opening flyers. One-shot: geocode → find landmarks → curate → render.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Street address or place name" },
        label: { type: "string", description: 'Destination label (default: "여기")' },
        radiusMeters: { type: "integer", minimum: 1, maximum: MAX_RADIUS_METERS, description: "Landmark search radius (default 400, max 5000)" },
        limit: { type: "integer", minimum: 1, description: "Max landmarks (default 5)" },
        width: { type: "integer", minimum: MIN_CANVAS_DIMENSION_PX, maximum: MAX_CANVAS_DIMENSION_PX, description: "SVG width in px (default 600, 100-4000)" },
        height: { type: "integer", minimum: MIN_CANVAS_DIMENSION_PX, maximum: MAX_CANVAS_DIMENSION_PX, description: "SVG height in px (default 400, 100-4000)" },
        layout: {
          type: "string",
          enum: RENDER_LAYOUTS,
          description: 'Render layout mode: "diagram" keeps navigational structure (default), "geographic" preserves raw road geometry more closely',
        },
        preset: {
          type: "string",
          enum: RENDER_PRESETS,
          description: 'Output form: "standard" keeps the full curated map (default), "compact" reduces low-priority labels/icons, "minimal" keeps only transit-like approach landmarks plus the destination',
        },
        roads: { type: "boolean", description: "Draw the road skeleton (default true)" },
      },
      required: ["address"],
    },
    outputSchema: generateMapOutputSchema,
    annotations: safeAnnotations,
  },
  {
    name: "geocode",
    description:
      "Convert an address or place name to coordinates via OpenStreetMap Nominatim. " +
      "No API key required. Use this when you want to do landmark curation in the host LLM.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string" } },
      required: ["address"],
    },
    outputSchema: geocodeOutputSchema,
    annotations: safeAnnotations,
  },
  {
    name: "find_landmarks",
    description:
      "Find nearby named points of interest (stations, schools, cafes, etc.) " +
      "for given coordinates. Returns raw landmark list — host LLM can pick and arrange.",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number", minimum: -90, maximum: 90 },
        lon: { type: "number", minimum: -180, maximum: 180 },
        radiusMeters: { type: "integer", minimum: 1, maximum: MAX_RADIUS_METERS, description: "Default 400, max 5000" },
      },
      required: ["lat", "lon"],
    },
    outputSchema: findLandmarksOutputSchema,
    annotations: safeAnnotations,
  },
  {
    name: "find_roads",
    description:
      "Find nearby roads (the wayfinding skeleton) for given coordinates via " +
      "OpenStreetMap Overpass. Returns simplified polylines classified by " +
      "importance tier (primary / secondary / tertiary / residential) — host " +
      "LLM can pick which roads matter for a sketch.",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number", minimum: -90, maximum: 90 },
        lon: { type: "number", minimum: -180, maximum: 180 },
        radiusMeters: { type: "integer", minimum: 1, maximum: MAX_RADIUS_METERS, description: "Default 480, max 5000" },
      },
      required: ["lat", "lon"],
    },
    outputSchema: findRoadsOutputSchema,
    annotations: safeAnnotations,
  },
];

// ---------- Dispatcher ----------

// MCP spec requires structuredContent to be a JSON object (record-shaped),
// not a primitive or array. Reflect that at the type level so a future
// `jsonResult(42)` or `jsonResult(landmarksArray)` won't compile.
export interface DispatchResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function jsonResult<T extends Record<string, unknown>>(structured: T): DispatchResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

// Surface zod issues as `path: message; path: message` instead of the
// multi-line stringified `err.message` JSON blob — that blob is what host
// LLMs see otherwise, and it's not actionable.
function formatError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

export async function dispatchTool(
  name: string,
  args: unknown,
): Promise<DispatchResult> {
  try {
    if (name === "generate_map") {
      const input = GenerateMapArgs.parse(args);
      const { svg, layout } = await generateMap(input.address, input);
      // Per MCP spec, populate both content and structuredContent when
      // outputSchema is declared, so older clients still see the SVG.
      return {
        content: [
          { type: "text", text: svg },
          {
            type: "text",
            text:
              `cairn: rendered ${layout.landmarks.length} landmarks around ` +
              `${layout.center.lat.toFixed(5)}, ${layout.center.lon.toFixed(5)}.`,
          },
        ],
        structuredContent: { svg, layout },
      };
    }

    if (name === "geocode") {
      const input = GeocodeArgs.parse(args);
      const { lat, lon, displayName, raw } = await geocode(input.address);
      // `raw` is the Nominatim payload (addressdetails=1) — host LLMs use it
      // for follow-up reasoning (city, country_code, road, suburb). Only
      // included when it's a record-shaped object so the schema check passes.
      const body: Record<string, unknown> = { lat, lon, displayName };
      if (raw && typeof raw === "object") body.raw = raw;
      return jsonResult(body);
    }

    if (name === "find_landmarks") {
      const input = FindLandmarksArgs.parse(args);
      const landmarks = await findLandmarks(input.lat, input.lon, input.radiusMeters);
      return jsonResult({ landmarks });
    }

    if (name === "find_roads") {
      const input = FindRoadsArgs.parse(args);
      const roads = await findRoads(input.lat, input.lon, input.radiusMeters);
      return jsonResult({ roads });
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `cairn error: ${formatError(err)}` }],
    };
  }
}
