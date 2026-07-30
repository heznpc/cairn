import { z } from "zod";
import type { Landmark, LandmarkCategory } from "./types.js";
import { overpassFetch, OVERPASS_TIMEOUT_MS } from "./overpass.js";
import { MAX_RADIUS_METERS } from "./limits.js";
import { exitLabel } from "./locale.js";
import type { UpstreamOptions } from "./upstream-config.js";

const IMPORTANCE: Record<LandmarkCategory, number> = {
  station: 1.0,
  station_exit: 0.95,
  landmark: 0.85,
  // Surface rail and water transit are named, fixed, and signposted, so they
  // orient a reader nearly as well as a station and better than a bus stop.
  tram_stop: 0.8,
  ferry: 0.8,
  school: 0.7,
  hospital: 0.7,
  park: 0.65,
  // A supermarket or mall is a bigger, more visible mass than a corner shop.
  supermarket: 0.6,
  // Pharmacies are signposted landmarks across Europe and Latin America.
  pharmacy: 0.55,
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
// `out center` gives nodes a top-level lat/lon and ways/relations a `center`
// object. Accept either shape so a polygon park and a point cafe both parse.
const OverpassElementSchema = z.object({
  id: z.number(),
  type: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

function elementPosition(
  el: z.infer<typeof OverpassElementSchema>,
): { lat: number; lon: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) {
    return { lat: el.lat, lon: el.lon };
  }
  if (el.center) return el.center;
  return null;
}

// A way and a relation can share an id, so namespace the landmark id by type.
// Stable ids matter: DiagramDocument overrides are keyed on them.
function elementId(el: z.infer<typeof OverpassElementSchema>): string {
  const type = el.type ?? "node";
  return type === "node" ? String(el.id) : `${type}/${el.id}`;
}

export interface FindLandmarksOptions {
  /**
   * Language (BCP-47) for generated labels, currently unnamed transit exits.
   * Defaults to English; `pipeline.ts` derives it from the geocoded country.
   */
  language?: string;
  /** Endpoint, cache, and retry policy. Defaults come from the environment. */
  upstream?: UpstreamOptions;
}

/**
 * Find nearby points of interest using OpenStreetMap Overpass API.
 *
 * Returns only named POIs, except transit exits where `ref=3` is often the
 * label users actually need ("3번 출구" in Seoul, "Exit 3" in London).
 */
export async function findLandmarks(
  lat: number,
  lon: number,
  radiusMeters = 400,
  opts: FindLandmarksOptions = {},
): Promise<Landmark[]> {
  const baseRadius = Math.min(radiusMeters, MAX_RADIUS_METERS);
  const stationRadius = Math.min(
    MAX_RADIUS_METERS,
    Math.round(baseRadius * STATION_SEARCH_RADIUS_MULTIPLIER),
  );

  // `nwr` + `out center` instead of `node` + `out body`: outside dense Asian
  // city centers, parks, hospitals, schools, malls and places of worship are
  // almost always mapped as ways or relations, not points. Querying nodes only
  // made those landmarks invisible in most of Europe and North America. `center`
  // gives one representative coordinate per element, which is all a pictogram
  // marker needs.
  //
  // Transit tags stay node-oriented (stops and entrances are points) but cover
  // tram and ferry, which carry as much wayfinding weight in Prague, Istanbul
  // or Stockholm as the subway does in Seoul.
  const query = `
    [out:json][timeout:25];
    (
      nwr["public_transport"="station"](around:${stationRadius},${lat},${lon});
      nwr["railway"="station"](around:${stationRadius},${lat},${lon});
      nwr["railway"~"^(subway_entrance|train_station_entrance)$"](around:${stationRadius},${lat},${lon});
      nwr["railway"="tram_stop"](around:${stationRadius},${lat},${lon});
      nwr["amenity"="ferry_terminal"](around:${stationRadius},${lat},${lon});
      nwr["highway"="bus_stop"](around:${baseRadius},${lat},${lon});
      nwr["amenity"~"^(cafe|restaurant|fast_food|school|university|college|hospital|clinic|pharmacy|place_of_worship|bank|post_office|fuel|townhall|library|theatre|cinema|museum)$"](around:${baseRadius},${lat},${lon});
      nwr["shop"~"^(convenience|supermarket|mall|department_store)$"](around:${baseRadius},${lat},${lon});
      nwr["tourism"~"^(attraction|museum)$"](around:${baseRadius},${lat},${lon});
      nwr["historic"~"^(monument|memorial|castle)$"](around:${baseRadius},${lat},${lon});
      nwr["leisure"~"^(park|stadium|sports_centre)$"](around:${baseRadius},${lat},${lon});
    );
    out center;
  `.trim();

  const elements = await overpassFetch(query, OVERPASS_TIMEOUT_MS, opts.upstream);

  const landmarks: Landmark[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const parsed = OverpassElementSchema.safeParse(el);
    if (!parsed.success) continue; // skip drifted element, keep the rest
    const e = parsed.data;
    if (!e.tags) continue;
    const position = elementPosition(e);
    if (!position) continue; // no representative point to place a marker at
    const category = categorize(e.tags);
    const name = landmarkName(category, e.tags, opts.language);
    if (!name) continue;
    const id = elementId(e);
    // Overlapping tag filters can return the same element twice.
    if (seen.has(id)) continue;
    seen.add(id);
    landmarks.push({
      id,
      name,
      lat: position.lat,
      lon: position.lon,
      category,
      importance: IMPORTANCE[category] ?? 0.3,
      tags: e.tags,
    });
  }
  return landmarks;
}

// Order is priority: a node tagged both `railway=subway_entrance` and
// `amenity=cafe` is an exit first. Tags that have no pictogram of their own are
// folded into the closest existing one rather than adding a category with no
// icon — a bank reads as a building, a church as a monument-class landmark,
// which also avoids picking denominational iconography.
function categorize(tags: Record<string, string>): LandmarkCategory {
  if (
    tags.railway === "subway_entrance" ||
    tags.railway === "train_station_entrance"
  ) {
    return "station_exit";
  }
  if (tags.public_transport === "station" || tags.railway === "station") return "station";
  if (tags.railway === "tram_stop") return "tram_stop";
  if (tags.amenity === "ferry_terminal") return "ferry";
  if (tags.highway === "bus_stop") return "bus_stop";
  if (tags.amenity === "cafe") return "cafe";
  if (
    tags.shop === "supermarket" ||
    tags.shop === "mall" ||
    tags.shop === "department_store"
  ) {
    return "supermarket";
  }
  if (tags.shop === "convenience") return "convenience";
  if (tags.amenity === "restaurant" || tags.amenity === "fast_food") return "restaurant";
  if (tags.amenity === "pharmacy") return "pharmacy";
  if (
    tags.amenity === "school" ||
    tags.amenity === "university" ||
    tags.amenity === "college"
  ) {
    return "school";
  }
  if (tags.amenity === "hospital" || tags.amenity === "clinic") return "hospital";
  if (
    tags.leisure === "park" ||
    tags.leisure === "stadium" ||
    tags.leisure === "sports_centre"
  ) {
    return "park";
  }
  if (
    tags.tourism === "attraction" ||
    tags.tourism === "museum" ||
    tags.amenity === "museum" ||
    tags.amenity === "theatre" ||
    tags.amenity === "cinema" ||
    tags.amenity === "place_of_worship" ||
    tags.historic === "monument" ||
    tags.historic === "memorial" ||
    tags.historic === "castle"
  ) {
    return "landmark";
  }
  return "building";
}

function landmarkName(
  category: LandmarkCategory,
  tags: Record<string, string>,
  language?: string,
): string | null {
  if (tags.name) return tags.name;
  if (category === "station_exit" && tags.ref) return exitLabel(tags.ref, language);
  return null;
}
