import { z } from "zod";
import {
  MAX_CANVAS_DIMENSION_PX,
  MAX_RADIUS_METERS,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";
import { RENDER_LAYOUTS, RENDER_PRESETS } from "./options.js";

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
