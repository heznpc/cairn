import {
  diagramDocumentJsonSchema,
  landmarkItemJsonSchema,
  mapLayoutJsonSchema,
  roadItemJsonSchema,
} from "./diagram-json-schema.js";

// MCP 2025-06-18 spec §tools.outputSchema. Host LLMs validate structuredContent
// against these and can read results structurally instead of parsing text.
export {
  diagramDocumentJsonSchema,
  diagramDocumentPatchJsonSchema,
  mapLayoutJsonSchema,
} from "./diagram-json-schema.js";

export const generateMapOutputSchema = {
  type: "object",
  required: ["svg", "layout", "document"],
  additionalProperties: false,
  properties: {
    svg: {
      type: "string",
      description: "Rendered SVG markup, ready to embed or write to a file.",
    },
    layout: mapLayoutJsonSchema,
    document: diagramDocumentJsonSchema,
  },
} as const;

export const renderDocumentOutputSchema = {
  type: "object",
  required: ["svg", "document"],
  additionalProperties: false,
  properties: {
    svg: {
      type: "string",
      description: "Rendered SVG markup after applying the requested patch.",
    },
    document: diagramDocumentJsonSchema,
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
    // Raw Nominatim payload shape varies across regions.
    raw: { type: "object" },
  },
} as const;

export const findLandmarksOutputSchema = {
  type: "object",
  required: ["landmarks"],
  additionalProperties: false,
  properties: {
    landmarks: { type: "array", items: landmarkItemJsonSchema },
  },
} as const;

export const findRoadsOutputSchema = {
  type: "object",
  required: ["roads"],
  additionalProperties: false,
  properties: {
    roads: { type: "array", items: roadItemJsonSchema },
  },
} as const;
