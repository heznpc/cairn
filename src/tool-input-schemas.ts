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
import { SUPPORTED_LABEL_LANGUAGES } from "./locale.js";

// `language` is a generate-time argument only: it selects the wording for
// labels cairn generates. render_document takes no language because names are
// already baked into the document.
const RadiusArg = z.number().int().min(1).max(MAX_RADIUS_METERS);
const CanvasDimensionArg = z.number().int().min(MIN_CANVAS_DIMENSION_PX).max(MAX_CANVAS_DIMENSION_PX);
const LatitudeArg = z.number().finite().min(-90).max(90);
const LongitudeArg = z.number().finite().min(-180).max(180);
const RenderLayoutArg = z.enum(RENDER_LAYOUTS);
// Constrain to the languages we can actually spell the generated labels in, so
// a host LLM gets a validation error instead of a silent English fallback.
const LabelLanguageArg = z.enum(
  SUPPORTED_LABEL_LANGUAGES as [string, ...string[]],
);

const RenderPresetArg = z.enum(RENDER_PRESETS);
const RenderTemplateArg = z.enum(RENDER_TEMPLATES);
const RenderThemeArg = z.enum(RENDER_THEMES);

export const GenerateMapArgs = z.object({
  address: z.string().describe("Street address or place name"),
  label: z.string().optional().describe('Label for the destination (default: localized "Here")'),
  language: LabelLanguageArg.optional().describe(
    'Language for generated labels such as unnamed transit exits ("Exit 3" vs "3번 출구"). Defaults to the destination country\'s language. POI names always stay as OpenStreetMap has them.',
  ),
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
