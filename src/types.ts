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
export type RenderPreset = "standard" | "compact" | "minimal";

export interface RenderOptions {
  width?: number;
  height?: number;
  // "diagram" (default) keeps only navigational structure; "geographic"
  // preserves the raw road geometry more closely for inspection/debugging.
  layout?: RenderLayoutMode;
  // Output form, not a colour palette: "standard" (default) keeps the full
  // curated map; "compact" reduces low-priority labels/icons for small
  // placements; "minimal" keeps only transit-like approach landmarks plus
  // the destination so it can sit inside a larger design.
  preset?: RenderPreset;
  // NOTE: `language` is reserved for future localization. render.ts does NOT
  // honor it yet; handlers.ts does NOT expose it to MCP hosts.
  language?: "ko" | "en" | "ja";
}
