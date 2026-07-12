import type { LandmarkCategory, RoadClass } from "./types.js";
import {
  RENDER_LAYOUTS,
  RENDER_TEMPLATES,
  RENDER_THEMES,
} from "./options.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";

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

type AssertNever<T> = [T] extends [never]
  ? true
  : { error: "JSON schema enum drift"; offenders: T };
type _LandmarkMissing = Exclude<LandmarkCategory, (typeof LANDMARK_CATEGORIES)[number]>;
type _LandmarkExtra = Exclude<(typeof LANDMARK_CATEGORIES)[number], LandmarkCategory>;
const _landmarkNoneMissing: AssertNever<_LandmarkMissing> = true;
const _landmarkNoneExtra: AssertNever<_LandmarkExtra> = true;
void _landmarkNoneMissing;
void _landmarkNoneExtra;

const ROAD_CLASSES = [
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "path",
] as const;
type _RoadMissing = Exclude<RoadClass, (typeof ROAD_CLASSES)[number]>;
type _RoadExtra = Exclude<(typeof ROAD_CLASSES)[number], RoadClass>;
const _roadNoneMissing: AssertNever<_RoadMissing> = true;
const _roadNoneExtra: AssertNever<_RoadExtra> = true;
void _roadNoneMissing;
void _roadNoneExtra;

export const landmarkItemJsonSchema = {
  type: "object",
  required: ["id", "name", "lat", "lon", "category", "importance", "tags"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    lat: { type: "number", minimum: -90, maximum: 90 },
    lon: { type: "number", minimum: -180, maximum: 180 },
    category: { type: "string", enum: LANDMARK_CATEGORIES },
    importance: { type: "number", minimum: 0, maximum: 1 },
    tags: {
      type: "object",
      additionalProperties: { type: "string" },
    },
  },
} as const;

export const roadItemJsonSchema = {
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
          lat: { type: "number", minimum: -90, maximum: 90 },
          lon: { type: "number", minimum: -180, maximum: 180 },
        },
      },
    },
  },
} as const;

export const mapLayoutJsonSchema = {
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
    landmarks: { type: "array", items: landmarkItemJsonSchema },
    roads: { type: "array", items: roadItemJsonSchema },
    bbox: {
      type: "object",
      required: ["north", "south", "east", "west"],
      additionalProperties: false,
      properties: {
        north: { type: "number", minimum: -90, maximum: 90 },
        south: { type: "number", minimum: -90, maximum: 90 },
        east: { type: "number", minimum: -180, maximum: 180 },
        west: { type: "number", minimum: -180, maximum: 180 },
      },
    },
  },
} as const;

const normalizedPositionJsonSchema = {
  type: "object",
  required: ["x", "y"],
  additionalProperties: false,
  properties: {
    x: { type: "number", minimum: 0, maximum: 1 },
    y: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

const landmarkOverrideJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hidden: { type: "boolean" },
    label: { type: "string" },
    position: normalizedPositionJsonSchema,
    locked: { type: "boolean" },
  },
} as const;

const roadOverrideJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hidden: { type: "boolean" },
    label: { type: "string" },
  },
} as const;

export const diagramDocumentJsonSchema = {
  type: "object",
  description: "Versioned editable map document returned by cairn.",
  required: ["version", "map", "canvas", "render", "overrides"],
  additionalProperties: false,
  properties: {
    version: { type: "integer", const: 1 },
    map: mapLayoutJsonSchema,
    canvas: {
      type: "object",
      required: ["width", "height"],
      additionalProperties: false,
      properties: {
        width: { type: "integer", minimum: MIN_CANVAS_DIMENSION_PX, maximum: MAX_CANVAS_DIMENSION_PX },
        height: { type: "integer", minimum: MIN_CANVAS_DIMENSION_PX, maximum: MAX_CANVAS_DIMENSION_PX },
      },
    },
    render: {
      type: "object",
      required: ["layout", "template", "theme", "focus"],
      additionalProperties: false,
      properties: {
        layout: { type: "string", enum: RENDER_LAYOUTS },
        template: { type: "string", enum: RENDER_TEMPLATES },
        theme: { type: "string", enum: RENDER_THEMES },
        focus: { type: "boolean" },
        approachLandmarkId: {
          type: "string",
          description: "Exact landmark ID used as the start of the final approach.",
        },
      },
    },
    overrides: {
      type: "object",
      additionalProperties: false,
      properties: {
        destination: {
          type: "object",
          additionalProperties: false,
          properties: { label: { type: "string" } },
        },
        landmarks: {
          type: "object",
          additionalProperties: landmarkOverrideJsonSchema,
        },
        roads: {
          type: "object",
          additionalProperties: roadOverrideJsonSchema,
        },
      },
    },
  },
} as const;

const nullableString = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;
const nullableBoolean = {
  anyOf: [{ type: "boolean" }, { type: "null" }],
} as const;
const nullablePosition = {
  anyOf: [normalizedPositionJsonSchema, { type: "null" }],
} as const;

export const diagramDocumentPatchJsonSchema = {
  type: "object",
  description: "Minimal changes to apply to the latest document before rendering.",
  additionalProperties: false,
  properties: {
    canvas: {
      type: "object",
      description: "Resize the output canvas in pixels.",
      additionalProperties: false,
      properties: {
        width: { type: "integer", minimum: MIN_CANVAS_DIMENSION_PX, maximum: MAX_CANVAS_DIMENSION_PX },
        height: { type: "integer", minimum: MIN_CANVAS_DIMENSION_PX, maximum: MAX_CANVAS_DIMENSION_PX },
      },
    },
    render: {
      type: "object",
      description: "Change composition or visual style without replacing map data.",
      additionalProperties: false,
      properties: {
        layout: { type: "string", enum: RENDER_LAYOUTS },
        template: { type: "string", enum: RENDER_TEMPLATES },
        theme: { type: "string", enum: RENDER_THEMES },
        focus: { type: "boolean" },
        approachLandmarkId: {
          ...nullableString,
          description: "Set an exact landmark ID as the start, or null for automatic selection.",
        },
      },
    },
    destinationLabel: {
      ...nullableString,
      description: "Set the destination label, or null to restore the source label.",
    },
    landmarks: {
      type: "object",
      description: "Landmark changes keyed by an exact ID from document.map.landmarks.",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          hidden: { ...nullableBoolean, description: "Hide/show, or null to remove the override." },
          label: { ...nullableString, description: "Relabel, or null to restore the source name." },
          position: { ...nullablePosition, description: "Normalized manual position, or null for automatic placement." },
          locked: { ...nullableBoolean, description: "Preserve a manual position hint, or null to clear it." },
        },
      },
    },
    roads: {
      type: "object",
      description: "Road changes keyed by an exact ID from document.map.roads.",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          hidden: { ...nullableBoolean, description: "Hide/show, or null to remove the override." },
          label: { ...nullableString, description: "Relabel, or null to restore the source road name." },
        },
      },
    },
  },
} as const;
