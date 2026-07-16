import {
  IDENTIFIER_MIN_LENGTH,
  IMPORTANCE_RANGE,
  LANDMARK_CATEGORIES,
  LATITUDE_RANGE,
  LONGITUDE_RANGE,
  NORMALIZED_POSITION_RANGE,
  RENDER_LAYOUTS,
  RENDER_TEMPLATES,
  RENDER_THEMES,
  ROAD_CLASSES,
} from "./domain-values.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";

export const landmarkItemJsonSchema = {
  type: "object",
  required: ["id", "name", "lat", "lon", "category", "importance", "tags"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: IDENTIFIER_MIN_LENGTH },
    name: { type: "string" },
    lat: { type: "number", ...LATITUDE_RANGE },
    lon: { type: "number", ...LONGITUDE_RANGE },
    category: { type: "string", enum: LANDMARK_CATEGORIES },
    importance: { type: "number", ...IMPORTANCE_RANGE },
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
    id: { type: "string", minLength: IDENTIFIER_MIN_LENGTH },
    name: { type: "string" },
    class: { type: "string", enum: ROAD_CLASSES },
    points: {
      type: "array",
      items: {
        type: "object",
        required: ["lat", "lon"],
        additionalProperties: false,
        properties: {
          lat: { type: "number", ...LATITUDE_RANGE },
          lon: { type: "number", ...LONGITUDE_RANGE },
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
        lat: { type: "number", ...LATITUDE_RANGE },
        lon: { type: "number", ...LONGITUDE_RANGE },
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
        north: { type: "number", ...LATITUDE_RANGE },
        south: { type: "number", ...LATITUDE_RANGE },
        east: { type: "number", ...LONGITUDE_RANGE },
        west: { type: "number", ...LONGITUDE_RANGE },
      },
    },
  },
} as const;

const normalizedPositionJsonSchema = {
  type: "object",
  required: ["x", "y"],
  additionalProperties: false,
  properties: {
    x: { type: "number", ...NORMALIZED_POSITION_RANGE },
    y: { type: "number", ...NORMALIZED_POSITION_RANGE },
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

const canvasDimensionJsonSchema = {
  type: "integer",
  minimum: MIN_CANVAS_DIMENSION_PX,
  maximum: MAX_CANVAS_DIMENSION_PX,
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
        width: canvasDimensionJsonSchema,
        height: canvasDimensionJsonSchema,
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
          minLength: IDENTIFIER_MIN_LENGTH,
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
const nullableIdentifier = {
  anyOf: [
    { type: "string", minLength: IDENTIFIER_MIN_LENGTH },
    { type: "null" },
  ],
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
        width: canvasDimensionJsonSchema,
        height: canvasDimensionJsonSchema,
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
          ...nullableIdentifier,
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
