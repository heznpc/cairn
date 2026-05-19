import type { Landmark, LandmarkCategory } from "./types.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "cairn-mcp/0.1 (+https://github.com/heznpc/cairn)";

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
  const stationRadius = Math.round(radiusMeters * 1.5);

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

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass query failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    elements: Array<{
      id: number;
      lat: number;
      lon: number;
      tags?: Record<string, string>;
    }>;
  };

  const landmarks: Landmark[] = [];
  for (const el of data.elements) {
    if (!el.tags?.name) continue;
    const category = categorize(el.tags);
    landmarks.push({
      id: String(el.id),
      name: el.tags.name,
      lat: el.lat,
      lon: el.lon,
      category,
      importance: IMPORTANCE[category] ?? 0.3,
      tags: el.tags,
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
