#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { generateMap } from "./pipeline.js";
import { geocode } from "./geocode.js";
import { findLandmarks } from "./landmarks.js";

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

// Output schemas let host LLMs read results structurally instead of parsing
// the SVG / JSON text payload. See MCP 2025-06-18 spec §tools.outputSchema.
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

const landmarkItemSchema = {
  type: "object",
  required: ["id", "name", "lat", "lon", "category", "importance"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    lat: { type: "number" },
    lon: { type: "number" },
    category: { type: "string", enum: LANDMARK_CATEGORIES },
    importance: { type: "number" },
  },
} as const;

const generateMapOutputSchema = {
  type: "object",
  required: ["svg", "layout"],
  properties: {
    svg: {
      type: "string",
      description: "Rendered SVG markup, ready to embed or write to a file.",
    },
    layout: {
      type: "object",
      required: ["center", "landmarks", "bbox"],
      properties: {
        center: {
          type: "object",
          required: ["lat", "lon", "label"],
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
  properties: {
    lat: { type: "number" },
    lon: { type: "number" },
    displayName: { type: "string" },
  },
} as const;

const findLandmarksOutputSchema = {
  type: "object",
  required: ["landmarks"],
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

// Shape every JSON-bodied tool reply identically: structured payload, plus the
// same payload pretty-printed as text for clients that don't read structuredContent.
function jsonResult<T>(structured: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

const tools = [
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
      properties: {
        address: { type: "string" },
      },
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

const server = new Server(
  { name: "cairn", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

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
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: "text", text: `cairn error: ${message}` }],
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("Failed to start cairn MCP server:", err);
  process.exit(1);
});
