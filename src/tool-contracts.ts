import { z } from "zod";
import {
  MAX_CANVAS_DIMENSION_PX,
  MAX_RADIUS_METERS,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";
import { RENDER_LAYOUTS, RENDER_PRESETS } from "./options.js";
import type { LandmarkCategory, RoadClass } from "./types.js";

// ---------- Input schemas (zod) ----------

// `language` is intentionally NOT exposed: render.ts has no localization yet,
// and advertising a flag that's silently dropped breaks the host-LLM contract.
// Re-add once render.ts honors it.
const RadiusArg = z.number().int().min(1).max(MAX_RADIUS_METERS);
const CanvasDimensionArg = z.number().int().min(MIN_CANVAS_DIMENSION_PX).max(MAX_CANVAS_DIMENSION_PX);
const LatitudeArg = z.number().finite().min(-90).max(90);
const LongitudeArg = z.number().finite().min(-180).max(180);
const RenderLayoutArg = z.enum(RENDER_LAYOUTS);
const RenderPresetArg = z.enum(RENDER_PRESETS);

export const GenerateMapArgs = z.object({
  address: z.string().describe("Street address or place name"),
  label: z.string().optional().describe('Label for the destination (default: "여기")'),
  radiusMeters: RadiusArg.optional().describe("Landmark search radius (default 400, max 5000)"),
  limit: z.number().int().min(1).optional().describe("Max landmarks to include (default 5)"),
  // width/height >= 100: render.ts projection uses (width - 100) as denominator.
  width: CanvasDimensionArg.optional(),
  height: CanvasDimensionArg.optional(),
  layout: RenderLayoutArg.optional().describe('Render layout mode (default "diagram")'),
  preset: RenderPresetArg.optional().describe('Output form: "standard" full map (default), "compact" approach map, "minimal" route strip, "schematic" right-angle diagram, or "badge" destination inset'),
  roads: z
    .boolean()
    .optional()
    .describe("Draw the road skeleton (default true). Set false to skip the extra Overpass round-trip."),
  focus: z
    .boolean()
    .optional()
    .describe("Fisheye-emphasize the destination area (magnify near, compress far). Map-skeleton diagram presets only; default false."),
}).strict();

export const GeocodeArgs = z.object({
  address: z.string(),
}).strict();

export const FindLandmarksArgs = z.object({
  lat: LatitudeArg,
  lon: LongitudeArg,
  radiusMeters: RadiusArg.optional(),
}).strict();

export const FindRoadsArgs = z.object({
  lat: LatitudeArg,
  lon: LongitudeArg,
  radiusMeters: RadiusArg.optional(),
}).strict();

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
  : { error: "LANDMARK_CATEGORIES drift - update both sides"; offenders: T };
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
  required: ["id", "name", "lat", "lon", "category", "importance", "tags"],
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
    // Shape varies: host LLMs use this for follow-up reasoning
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
// Nominatim/Overpass return time-varying POI data: two calls months apart
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
      "or store opening flyers. One-shot: geocode -> find landmarks -> curate -> render.",
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
          description: 'Output form: "standard" keeps the full curated map (default), "compact" keeps a short approach-focused road skeleton, "minimal" uses a route-strip template, "schematic" uses right-angle diagram roads, "badge" uses a destination-first inset template',
        },
        roads: { type: "boolean", description: "Draw the road skeleton (default true)" },
        focus: { type: "boolean", description: "Fisheye-emphasize the destination area for map-skeleton diagram presets: standard, compact, schematic (default false)" },
      },
      required: ["address"],
      additionalProperties: false,
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
      additionalProperties: false,
    },
    outputSchema: geocodeOutputSchema,
    annotations: safeAnnotations,
  },
  {
    name: "find_landmarks",
    description:
      "Find nearby named points of interest (stations, schools, cafes, etc.) " +
      "for given coordinates. Returns raw landmark list: host LLM can pick and arrange.",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number", minimum: -90, maximum: 90 },
        lon: { type: "number", minimum: -180, maximum: 180 },
        radiusMeters: { type: "integer", minimum: 1, maximum: MAX_RADIUS_METERS, description: "Default 400, max 5000" },
      },
      required: ["lat", "lon"],
      additionalProperties: false,
    },
    outputSchema: findLandmarksOutputSchema,
    annotations: safeAnnotations,
  },
  {
    name: "find_roads",
    description:
      "Find nearby roads (the wayfinding skeleton) for given coordinates via " +
      "OpenStreetMap Overpass. Returns simplified polylines classified by " +
      "importance tier (primary / secondary / tertiary / residential): host " +
      "LLM can pick which roads matter for a sketch.",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number", minimum: -90, maximum: 90 },
        lon: { type: "number", minimum: -180, maximum: 180 },
        radiusMeters: { type: "integer", minimum: 1, maximum: MAX_RADIUS_METERS, description: "Default 480, max 5000" },
      },
      required: ["lat", "lon"],
      additionalProperties: false,
    },
    outputSchema: findRoadsOutputSchema,
    annotations: safeAnnotations,
  },
];
