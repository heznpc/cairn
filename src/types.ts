export interface GeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
  raw?: unknown;
}

export type LandmarkCategory =
  | "station"
  | "station_exit"
  | "bus_stop"
  | "cafe"
  | "convenience"
  | "restaurant"
  | "school"
  | "hospital"
  | "park"
  | "landmark"
  | "building";

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
export type RoadClass =
  | "primary" // motorway, trunk, primary — the big roads you navigate by
  | "secondary"
  | "tertiary"
  | "residential" // residential, unclassified, living_street
  | "path"; // anything else that slipped through

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

export type RenderLayoutMode = "diagram" | "geographic";
export type RenderTemplate = "standard" | "compact" | "minimal" | "schematic" | "badge";
/** @deprecated Use RenderTemplate. Kept for v0.1/v0.2 callers. */
export type RenderPreset = RenderTemplate;
export type RenderTheme = "paper" | "mono" | "civic" | "invitation";

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
  // Editor-only manual placements keyed by stable landmark IDs. Normalized
  // positions keep documents portable across canvas sizes.
  landmarkPositions?: Record<string, NormalizedPosition>;
  // NOTE: `language` is reserved for future localization. render.ts does NOT
  // honor it yet; handlers.ts does NOT expose it to MCP hosts.
  language?: "ko" | "en" | "ja";
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
  };
  overrides: DiagramOverrides;
}
