import type { LandmarkCategory, RoadClass } from "./types.js";

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

export const generateMapOutputSchema = {
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

export const geocodeOutputSchema = {
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

export const findLandmarksOutputSchema = {
  type: "object",
  required: ["landmarks"],
  additionalProperties: false,
  properties: {
    landmarks: { type: "array", items: landmarkItemSchema },
  },
} as const;

export const findRoadsOutputSchema = {
  type: "object",
  required: ["roads"],
  additionalProperties: false,
  properties: {
    roads: { type: "array", items: roadItemSchema },
  },
} as const;
