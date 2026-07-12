import { z } from "zod";
import {
  MAX_CANVAS_DIMENSION_PX,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";
import {
  RENDER_LAYOUTS,
  RENDER_TEMPLATES,
  RENDER_THEMES,
} from "./options.js";
import type { DiagramDocument, DiagramDocumentPatch } from "./types.js";

const Coordinate = z.number().finite();
const Latitude = Coordinate.min(-90).max(90);
const Longitude = Coordinate.min(-180).max(180);
const CanvasDimension = z
  .number()
  .int()
  .min(MIN_CANVAS_DIMENSION_PX)
  .max(MAX_CANVAS_DIMENSION_PX);
const NormalizedPosition = z.object({
  x: Coordinate.min(0).max(1),
  y: Coordinate.min(0).max(1),
}).strict();

const Landmark = z.object({
  id: z.string().min(1),
  name: z.string(),
  lat: Latitude,
  lon: Longitude,
  category: z.enum([
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
  ]),
  importance: Coordinate.min(0).max(1),
  tags: z.record(z.string()),
}).strict();

const Road = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  class: z.enum(["primary", "secondary", "tertiary", "residential", "path"]),
  points: z.array(z.object({ lat: Latitude, lon: Longitude }).strict()),
}).strict();

const MapLayout = z.object({
  center: z.object({
    lat: Latitude,
    lon: Longitude,
    label: z.string(),
  }).strict(),
  landmarks: z.array(Landmark),
  roads: z.array(Road),
  bbox: z.object({
    north: Latitude,
    south: Latitude,
    east: Longitude,
    west: Longitude,
  }).strict(),
}).strict();

const LandmarkOverride = z.object({
  hidden: z.boolean().optional(),
  label: z.string().optional(),
  position: NormalizedPosition.optional(),
  locked: z.boolean().optional(),
}).strict();

const RoadOverride = z.object({
  hidden: z.boolean().optional(),
  label: z.string().optional(),
}).strict();

export const DiagramDocumentSchema = z.object({
  version: z.literal(1),
  map: MapLayout,
  canvas: z.object({
    width: CanvasDimension,
    height: CanvasDimension,
  }).strict(),
  render: z.object({
    layout: z.enum(RENDER_LAYOUTS),
    template: z.enum(RENDER_TEMPLATES),
    theme: z.enum(RENDER_THEMES),
    focus: z.boolean(),
    approachLandmarkId: z.string().min(1).optional(),
  }).strict(),
  overrides: z.object({
    destination: z.object({ label: z.string().optional() }).strict().optional(),
    landmarks: z.record(LandmarkOverride).optional(),
    roads: z.record(RoadOverride).optional(),
  }).strict(),
}).strict();

const LandmarkPatch = z.object({
  hidden: z.boolean().nullable().optional(),
  label: z.string().nullable().optional(),
  position: NormalizedPosition.nullable().optional(),
  locked: z.boolean().nullable().optional(),
}).strict();

const RoadPatch = z.object({
  hidden: z.boolean().nullable().optional(),
  label: z.string().nullable().optional(),
}).strict();

export const DiagramDocumentPatchSchema = z.object({
  canvas: z.object({
    width: CanvasDimension.optional(),
    height: CanvasDimension.optional(),
  }).strict().optional(),
  render: z.object({
    layout: z.enum(RENDER_LAYOUTS).optional(),
    template: z.enum(RENDER_TEMPLATES).optional(),
    theme: z.enum(RENDER_THEMES).optional(),
    focus: z.boolean().optional(),
    approachLandmarkId: z.string().min(1).nullable().optional(),
  }).strict().optional(),
  destinationLabel: z.string().nullable().optional(),
  landmarks: z.record(LandmarkPatch).optional(),
  roads: z.record(RoadPatch).optional(),
}).strict();

export function parseDiagramDocument(value: unknown): DiagramDocument {
  return DiagramDocumentSchema.parse(value) as DiagramDocument;
}

export function parseDiagramDocumentPatch(value: unknown): DiagramDocumentPatch {
  return DiagramDocumentPatchSchema.parse(value) as DiagramDocumentPatch;
}
