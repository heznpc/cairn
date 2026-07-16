import { z } from "zod";
import type { Road, RoadClass } from "./types.js";
import { overpassFetch, OVERPASS_TIMEOUT_MS } from "./overpass.js";
import { douglasPeucker } from "./geometry.js";
import { MAX_RADIUS_METERS } from "./limits.js";

// Default simplification tolerance: ~4.5 m at city scale. Enough to drop
// surveyor-grade vertices (every curb bend) while preserving the shape a
// reader navigates by. Exposed so curation experiments can tune it.
export const DEFAULT_SIMPLIFY_EPSILON = 0.00004;

// Roads extend a little past the landmark radius so the skeleton reaches the
// edges of the frame rather than stopping short of them.
const DEFAULT_ROAD_RADIUS = 480;

// OSM highway value → our RoadClass. Anything not listed falls through to
// "path" so an unexpected value still renders (thin) instead of vanishing.
const HIGHWAY_CLASS: Record<string, RoadClass> = {
  motorway: "primary",
  trunk: "primary",
  primary: "primary",
  motorway_link: "primary",
  trunk_link: "primary",
  primary_link: "primary",
  secondary: "secondary",
  secondary_link: "secondary",
  tertiary: "tertiary",
  tertiary_link: "tertiary",
  residential: "residential",
  unclassified: "residential",
  living_street: "residential",
};

// `out geom;` attaches an inline geometry array to each way. Validate per
// element and skip drift, mirroring landmarks.ts.
const RoadWaySchema = z.object({
  id: z.number(),
  tags: z.record(z.string(), z.string()).optional(),
  geometry: z.array(z.object({ lat: z.number(), lon: z.number() })).optional(),
});

/**
 * Convert raw Overpass way elements into simplified Road objects.
 *
 * Pure and network-free so it can be unit-tested without hitting Overpass.
 * Ways without at least 2 geometry points are dropped (nothing to draw).
 */
export function roadsFromElements(
  elements: unknown[],
  epsilon = DEFAULT_SIMPLIFY_EPSILON,
): Road[] {
  const roads: Road[] = [];
  for (const el of elements) {
    const parsed = RoadWaySchema.safeParse(el);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (!e.geometry || e.geometry.length < 2) continue;

    const highway = e.tags?.highway;
    const roadClass = (highway && HIGHWAY_CLASS[highway]) || "path";
    const points = douglasPeucker(e.geometry, epsilon);

    roads.push({
      id: String(e.id),
      name: e.tags?.name,
      class: roadClass,
      points,
    });
  }
  return roads;
}

/**
 * Find nearby roads (the wayfinding skeleton) via the Overpass API.
 *
 * Returns simplified polylines classified by importance tier. The caller
 * (renderer) decides stroke width / colour from `road.class`.
 */
export async function findRoads(
  lat: number,
  lon: number,
  radiusMeters = DEFAULT_ROAD_RADIUS,
): Promise<Road[]> {
  const radius = Math.min(radiusMeters, MAX_RADIUS_METERS);
  const query = `
    [out:json][timeout:25];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)(_link)?$"](around:${radius},${lat},${lon});
    );
    out geom;
  `.trim();

  const elements = await overpassFetch(query, OVERPASS_TIMEOUT_MS);
  return roadsFromElements(elements);
}
