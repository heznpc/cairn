export interface GeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
  raw?: unknown;
}

export type LandmarkCategory =
  | "station"
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

export interface MapLayout {
  center: { lat: number; lon: number; label: string };
  landmarks: Landmark[];
  bbox: { north: number; south: number; east: number; west: number };
}

export interface RenderOptions {
  width?: number;
  height?: number;
  style?: "minimal" | "iconographic";
  // NOTE: `language` is reserved for future localization. render.ts does NOT
  // honor it yet; handlers.ts does NOT expose it to MCP hosts. See NOTES.md.
  language?: "ko" | "en" | "ja";
}
