import { z } from "zod";
import type { Landmark, LandmarkCategory } from "./types.js";
import { fetchWithTimeout, overpassGate } from "./http.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "cairn-mcp/0.1 (+https://github.com/heznpc/cairn)";
// Overpass query carries [timeout:25]; give the client 30s to read the body.
const OVERPASS_TIMEOUT_MS = 30_000;

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

// Validate Overpass payload shape — clear error beats silent malformed-object junk.
const OverpassElementSchema = z.object({
  id: z.number(),
  lat: z.number(),
  lon: z.number(),
  tags: z.record(z.string(), z.string()).optional(),
});

const OverpassResponseSchema = z.object({
  elements: z.array(OverpassElementSchema),
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

  await overpassGate();
  const res = await fetchWithTimeout(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    body: `data=${encodeURIComponent(query)}`,
    timeoutMs: OVERPASS_TIMEOUT_MS,
  });

  if (!res.ok) {
    throw new Error(`Overpass query failed: ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();
  // Per-element tolerance: validate the envelope shape (`elements` is an
  // array) loosely, then validate each element individually with safeParse
  // and SKIP malformed ones. The earlier strict-batch parse would fail the
  // whole call if any single element drifted from the schema (e.g. a mirror
  // encoding ids as strings, or a future way/relation match with null
  // lat/lon). One anomalous element should not kill the batch.
  const envelope = z.object({ elements: z.array(z.unknown()) }).safeParse(raw);
  if (!envelope.success) {
    throw new Error(
      `Overpass returned an unexpected response shape: ${envelope.error.message}`,
    );
  }

  const landmarks: Landmark[] = [];
  for (const el of envelope.data.elements) {
    const elParsed = OverpassElementSchema.safeParse(el);
    if (!elParsed.success) continue; // skip drifted element, keep the rest
    const e = elParsed.data;
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
