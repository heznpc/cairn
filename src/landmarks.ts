import { z } from "zod";
import type { Landmark, LandmarkCategory } from "./types.js";
import { overpassFetch, OVERPASS_TIMEOUT_MS } from "./overpass.js";

const IMPORTANCE: Record<LandmarkCategory, number> = {
  station: 1.0,
  landmark: 0.85,
  school: 0.7,
  hospital: 0.7,
  park: 0.65,
  convenience: 0.5,
  cafe: 0.5,
  restaurant: 0.45,
  bus_stop: 0.4,
  building: 0.3,
};

export const STATION_SEARCH_RADIUS_MULTIPLIER = 1.5;

// Validate each Overpass element individually — clear skip beats silent
// malformed-object junk. A single drifted element is dropped, not allowed to
// fail the whole batch.
const OverpassNodeSchema = z.object({
  id: z.number(),
  lat: z.number(),
  lon: z.number(),
  tags: z.record(z.string(), z.string()).optional(),
});

/**
 * Find nearby points of interest using OpenStreetMap Overpass API.
 *
 * Returns only POIs with a `name` tag (anonymous buildings are noise for wayfinding).
 */
export async function findLandmarks(
  lat: number,
  lon: number,
  radiusMeters = 400,
): Promise<Landmark[]> {
  const stationRadius = Math.round(radiusMeters * STATION_SEARCH_RADIUS_MULTIPLIER);

  const query = `
    [out:json][timeout:25];
    (
      node["public_transport"="station"](around:${stationRadius},${lat},${lon});
      node["railway"="station"](around:${stationRadius},${lat},${lon});
      node["amenity"~"^(cafe|restaurant|school|university|hospital)$"](around:${radiusMeters},${lat},${lon});
      node["shop"="convenience"](around:${radiusMeters},${lat},${lon});
      node["tourism"="attraction"](around:${radiusMeters},${lat},${lon});
      node["historic"="monument"](around:${radiusMeters},${lat},${lon});
      node["leisure"="park"](around:${radiusMeters},${lat},${lon});
      node["highway"="bus_stop"](around:${radiusMeters},${lat},${lon});
    );
    out body;
  `.trim();

  const elements = await overpassFetch(query, OVERPASS_TIMEOUT_MS);

  const landmarks: Landmark[] = [];
  for (const el of elements) {
    const parsed = OverpassNodeSchema.safeParse(el);
    if (!parsed.success) continue; // skip drifted element, keep the rest
    const e = parsed.data;
    if (!e.tags?.name) continue;
    const category = categorize(e.tags);
    landmarks.push({
      id: String(e.id),
      name: e.tags.name,
      lat: e.lat,
      lon: e.lon,
      category,
      importance: IMPORTANCE[category] ?? 0.3,
      tags: e.tags,
    });
  }
  return landmarks;
}

function categorize(tags: Record<string, string>): LandmarkCategory {
  if (tags.public_transport === "station" || tags.railway === "station") return "station";
  if (tags.highway === "bus_stop") return "bus_stop";
  if (tags.amenity === "cafe") return "cafe";
  if (tags.shop === "convenience") return "convenience";
  if (tags.amenity === "restaurant") return "restaurant";
  if (tags.amenity === "school" || tags.amenity === "university") return "school";
  if (tags.amenity === "hospital") return "hospital";
  if (tags.leisure === "park") return "park";
  if (tags.tourism === "attraction" || tags.historic === "monument") return "landmark";
  return "building";
}
