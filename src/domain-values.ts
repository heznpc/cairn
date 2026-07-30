export const LANDMARK_CATEGORIES = [
  "station",
  "station_exit",
  "tram_stop",
  "bus_stop",
  "ferry",
  "cafe",
  "convenience",
  "supermarket",
  "restaurant",
  "pharmacy",
  "school",
  "hospital",
  "park",
  "landmark",
  "building",
] as const;

export const ROAD_CLASSES = [
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "path",
] as const;

export const RENDER_LAYOUTS = ["diagram", "geographic"] as const;
export const RENDER_TEMPLATES = [
  "standard",
  "compact",
  "minimal",
  "schematic",
  "badge",
] as const;
export const RENDER_THEMES = ["paper", "mono", "civic", "invitation"] as const;

export const IDENTIFIER_MIN_LENGTH = 1;
export const LATITUDE_RANGE = { minimum: -90, maximum: 90 } as const;
export const LONGITUDE_RANGE = { minimum: -180, maximum: 180 } as const;
export const IMPORTANCE_RANGE = { minimum: 0, maximum: 1 } as const;
export const NORMALIZED_POSITION_RANGE = { minimum: 0, maximum: 1 } as const;
