import {
  MAX_CANVAS_DIMENSION_PX,
  MAX_RADIUS_METERS,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";
import {
  RENDER_LAYOUTS,
  RENDER_PRESETS,
  RENDER_TEMPLATES,
  RENDER_THEMES,
} from "./options.js";
import {
  diagramDocumentJsonSchema,
  diagramDocumentPatchJsonSchema,
  findLandmarksOutputSchema,
  findRoadsOutputSchema,
  generateMapOutputSchema,
  geocodeOutputSchema,
  renderDocumentOutputSchema,
} from "./tool-output-schemas.js";

// `idempotentHint` is deliberately omitted (defaults to false per MCP spec).
// Nominatim/Overpass return time-varying POI data: two calls months apart
// can legitimately differ as OSM is edited, and a destination business may
// move. Asserting idempotency would let hosts cache stale results.
const safeAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true, // hits Nominatim / Overpass
} as const;

const localAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

export const tools = [
  {
    name: "generate_map",
    description:
      "Generate a pictogram-style wayfinding map SVG for an address. " +
      "Returns ready-to-print SVG plus an editable DiagramDocument suitable for iterative " +
      "chat revisions. One-shot: geocode -> find landmarks -> curate -> render.",
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
        template: {
          type: "string",
          enum: RENDER_TEMPLATES,
          description: 'Composition template: "standard" keeps the full curated map (default), "compact" keeps a short approach-focused road skeleton, "minimal" uses a route strip, "schematic" uses right-angle roads, and "badge" uses a destination-first inset',
        },
        theme: {
          type: "string",
          enum: RENDER_THEMES,
          description: 'Visual theme independent of composition: "paper" (default), "mono", "civic", or "invitation"',
        },
        preset: {
          type: "string",
          enum: RENDER_PRESETS,
          description: "Compatibility alias for template. Ignored when template is also provided.",
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
    name: "render_document",
    description:
      "Apply a small patch to a DiagramDocument and render it again without network access. " +
      "Use after generate_map for conversational edits such as hiding or relabeling landmarks, " +
      "moving markers, changing template/theme, or resizing the canvas. Returns the updated " +
      "document for the next edit turn.",
    inputSchema: {
      type: "object",
      properties: {
        document: diagramDocumentJsonSchema,
        patch: diagramDocumentPatchJsonSchema,
      },
      required: ["document"],
      additionalProperties: false,
    },
    outputSchema: renderDocumentOutputSchema,
    annotations: localAnnotations,
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
