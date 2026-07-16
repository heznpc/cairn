import { z } from "zod";
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
  DiagramDocumentPatchSchema,
  DiagramDocumentSchema,
} from "./diagram-schema.js";

// `language` is intentionally NOT exposed: render.ts has no localization yet,
// and advertising a flag that's silently dropped breaks the host-LLM contract.
// Re-add once render.ts honors it.
const RadiusArg = z.number().int().min(1).max(MAX_RADIUS_METERS);
const CanvasDimensionArg = z.number().int().min(MIN_CANVAS_DIMENSION_PX).max(MAX_CANVAS_DIMENSION_PX);
const LatitudeArg = z.number().finite().min(-90).max(90);
const LongitudeArg = z.number().finite().min(-180).max(180);
const RenderLayoutArg = z.enum(RENDER_LAYOUTS);
const RenderPresetArg = z.enum(RENDER_PRESETS);
const RenderTemplateArg = z.enum(RENDER_TEMPLATES);
const RenderThemeArg = z.enum(RENDER_THEMES);

export const GenerateMapArgs = z.object({
  address: z.string().describe("Street address or place name"),
  label: z.string().optional().describe('Label for the destination (default: "여기")'),
  radiusMeters: RadiusArg.optional().describe("Landmark search radius (default 400, max 5000)"),
  limit: z.number().int().min(1).optional().describe("Max landmarks to include (default 5)"),
  // width/height >= 100: render.ts projection uses (width - 100) as denominator.
  width: CanvasDimensionArg.optional(),
  height: CanvasDimensionArg.optional(),
  layout: RenderLayoutArg.optional().describe('Render layout mode (default "diagram")'),
  template: RenderTemplateArg.optional().describe('Composition template: "standard" full map (default), "compact" approach map, "minimal" route strip, "schematic" right-angle diagram, or "badge" destination inset'),
  theme: RenderThemeArg.optional().describe('Visual theme: "paper" (default), "mono", "civic", or "invitation"'),
  preset: RenderPresetArg.optional().describe('Compatibility alias for template. Ignored when template is also provided.'),
  roads: z
    .boolean()
    .optional()
    .describe("Draw the road skeleton (default true). Set false to skip the extra Overpass round-trip."),
  focus: z
    .boolean()
    .optional()
    .describe("Fisheye-emphasize the destination area (magnify near, compress far). Map-skeleton diagram presets only; default false."),
}).strict();

export const RenderDocumentArgs = z.object({
  document: DiagramDocumentSchema.describe("DiagramDocument returned by generate_map or a previous render_document call"),
  patch: DiagramDocumentPatchSchema.optional().describe("Minimal changes to apply before rendering"),
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
