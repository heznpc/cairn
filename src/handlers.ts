import { z } from "zod";
import { generateMap } from "./pipeline.js";
import { geocode } from "./geocode.js";
import { findLandmarks } from "./landmarks.js";
import type { LandmarkCategory } from "./types.js";

// ---------- Input schemas (zod) ----------

const GenerateMapArgs = z.object({
  address: z.string().describe("Street address or place name"),
  label: z.string().optional().describe('Label for the destination (default: "여기")'),
  radiusMeters: z.number().int().positive().optional().describe("Landmark search radius (default 400)"),
  limit: z.number().int().positive().optional().describe("Max landmarks to include (default 5)"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  language: z.enum(["ko", "en", "ja"]).optional(),
});

const GeocodeArgs = z.object({
  address: z.string(),
});

const FindLandmarksArgs = z.object({
  lat: z.number(),
  lon: z.number(),
  radiusMeters: z.number().int().positive().optional(),
});

// ---------- Output schemas (JSON Schema for MCP outputSchema) ----------
// MCP 2025-06-18 spec §tools.outputSchema. Host LLMs validate structuredContent
// against these and can read results structurally instead of parsing text.

const LANDMARK_CATEGORIES = [
  "station",
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
      required: ["center", "landmarks", "bbox"],
      additionalProperties: false,
      properties: {
        center: {
          type: "object",
          required: ["lat", "lon", "label"],
          additionalProperties: false,
          properties: {
            lat: { type: "number" },
            lon: { type: "number" },
            label: { type: "string" },
          },
        },
        landmarks: { type: "array", items: landmarkItemSchema },
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
    lat: { type: "number" },
    lon: { type: "number" },
    displayName: { type: "string" },
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

const safeAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
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
        radiusMeters: { type: "integer", description: "Landmark search radius (default 400)" },
        limit: { type: "integer", description: "Max landmarks (default 5)" },
        width: { type: "integer", description: "SVG width in px (default 600)" },
        height: { type: "integer", description: "SVG height in px (default 400)" },
        language: { type: "string", enum: ["ko", "en", "ja"] },
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
        lat: { type: "number" },
        lon: { type: "number" },
        radiusMeters: { type: "integer", description: "Default 400" },
      },
      required: ["lat", "lon"],
    },
    outputSchema: findLandmarksOutputSchema,
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
      const { lat, lon, displayName } = await geocode(input.address);
      return jsonResult({ lat, lon, displayName });
    }

    if (name === "find_landmarks") {
      const input = FindLandmarksArgs.parse(args);
      const landmarks = await findLandmarks(input.lat, input.lon, input.radiusMeters);
      return jsonResult({ landmarks });
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `cairn error: ${formatError(err)}` }],
    };
  }
}
