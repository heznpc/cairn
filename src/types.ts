import type {
  LANDMARK_CATEGORIES,
  RENDER_LAYOUTS,
  RENDER_TEMPLATES,
  RENDER_THEMES,
  ROAD_CLASSES,
} from "./domain-values.js";

export interface GeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
  /** ISO 3166-1 alpha-2, lowercased. Drives the default label language. */
  countryCode?: string;
  raw?: unknown;
}

export type LandmarkCategory = (typeof LANDMARK_CATEGORIES)[number];

export interface Landmark {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: LandmarkCategory;
  importance: number; // 0-1, higher = more recognizable
  tags: Record<string, string>;
}

// Road importance tiers, collapsed from OSM's many `highway=*` values.
// Width / colour in the renderer key off this, not the raw OSM tag.
export type RoadClass = (typeof ROAD_CLASSES)[number];

export interface Road {
  id: string;
  name?: string; // many roads are unnamed in OSM
  class: RoadClass;
  // Simplified polyline in geographic coordinates (Douglas-Peucker applied).
  points: Array<{ lat: number; lon: number }>;
}

export interface MapLayout {
  center: { lat: number; lon: number; label: string };
  landmarks: Landmark[];
  roads: Road[];
  bbox: { north: number; south: number; east: number; west: number };
}

export type RenderLayoutMode = (typeof RENDER_LAYOUTS)[number];
export type RenderTemplate = (typeof RENDER_TEMPLATES)[number];
/** @deprecated Use RenderTemplate. Kept for v0.1/v0.2 callers. */
export type RenderPreset = RenderTemplate;
export type RenderTheme = (typeof RENDER_THEMES)[number];

export interface NormalizedPosition {
  /** Horizontal canvas position, normalized to 0..1. */
  x: number;
  /** Vertical canvas position, normalized to 0..1. */
  y: number;
}

export interface LandmarkOverride {
  hidden?: boolean;
  label?: string;
  /** Manual editor position. When present it wins over automatic placement. */
  position?: NormalizedPosition;
  locked?: boolean;
}

export interface RoadOverride {
  hidden?: boolean;
  label?: string;
}

export interface DiagramOverrides {
  destination?: { label?: string };
  landmarks?: Record<string, LandmarkOverride>;
  roads?: Record<string, RoadOverride>;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  // "diagram" (default) keeps only navigational structure; "geographic"
  // preserves the raw road geometry more closely for inspection/debugging.
  layout?: RenderLayoutMode;
  // Composition rules. Templates control structure and density; themes control
  // the visual vocabulary independently.
  template?: RenderTemplate;
  theme?: RenderTheme;
  /** @deprecated Alias for template. `template` wins when both are present. */
  preset?: RenderPreset;
  // Opt-in destination emphasis: a radial fisheye that magnifies the area
  // around the destination and compresses the periphery, like a hand-drawn
  // 약도. Default off (linear projection); only applies to the map-skeleton
  // diagram presets (`standard`, `compact`, `schematic`).
  focus?: boolean;
  // Explicit start/approach landmark for chat-driven wayfinding. When omitted,
  // the renderer chooses the strongest transit-like landmark automatically.
  approachLandmarkId?: string;
  // Editor-only manual placements keyed by stable landmark IDs. Normalized
  // positions keep documents portable across canvas sizes.
  landmarkPositions?: Record<string, NormalizedPosition>;
  // Language (BCP-47) for the strings cairn generates: unnamed transit exit
  // labels and the fallback destination label. POI names always stay as OSM
  // has them, so this is a generation-time concern, not a render one —
  // `render_document` needs no language because names are already baked in.
  // Omit to derive it from the geocoded country.
  language?: string;
}

export interface DiagramDocument {
  version: 1;
  map: MapLayout;
  canvas: { width: number; height: number };
  render: {
    layout: RenderLayoutMode;
    template: RenderTemplate;
    theme: RenderTheme;
    focus: boolean;
    approachLandmarkId?: string;
  };
  overrides: DiagramOverrides;
}

export interface LandmarkOverridePatch {
  /** null removes the existing override. */
  hidden?: boolean | null;
  /** null restores the source landmark name. */
  label?: string | null;
  /** null returns the marker to automatic placement. */
  position?: NormalizedPosition | null;
  /** null removes the existing lock hint. */
  locked?: boolean | null;
}

export interface RoadOverridePatch {
  /** null removes the existing override. */
  hidden?: boolean | null;
  /** null restores the source road name. */
  label?: string | null;
}

export interface DiagramDocumentPatch {
  canvas?: { width?: number; height?: number };
  render?: {
    layout?: RenderLayoutMode;
    template?: RenderTemplate;
    theme?: RenderTheme;
    focus?: boolean;
    /** null restores automatic approach selection. */
    approachLandmarkId?: string | null;
  };
  /** null restores the source destination label. */
  destinationLabel?: string | null;
  landmarks?: Record<string, LandmarkOverridePatch>;
  roads?: Record<string, RoadOverridePatch>;
}
