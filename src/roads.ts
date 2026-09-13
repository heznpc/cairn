import { z } from "zod";
import type { Road, RoadClass } from "./types.js";
import { overpassFetch, OVERPASS_TIMEOUT_MS } from "./overpass.js";
import { douglasPeucker } from "./geometry.js";
import { MAX_RADIUS_METERS } from "./limits.js";
import type { UpstreamOptions } from "./upstream-config.js";

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
  service: "residential",
  footway: "path",
  pedestrian: "path",
  steps: "path",
  path: "path",
};

// `out geom;` attaches an inline geometry array to each way. Validate per
// element and skip drift, mirroring landmarks.ts.
const RoadWaySchema = z.object({
  id: z.number().int().nonnegative().safe(),
  tags: z.record(z.string(), z.string()).optional(),
  nodes: z.array(z.number().int().nonnegative().safe()).optional(),
  geometry: z.array(z.object({
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
  })).optional(),
});

const RoadNodeSchema = z.object({
  type: z.literal("node"),
  id: z.number().int().nonnegative().safe(),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  tags: z.record(z.string(), z.string()).default({}),
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
  const nodeDetails = new Map<number, z.infer<typeof RoadNodeSchema>>();
  for (const el of elements) {
    const node = RoadNodeSchema.safeParse(el);
    if (node.success) nodeDetails.set(node.data.id, node.data);
  }
  const barriers = new Map<number, Map<string, { id: string; tags: Record<string, string> }>>();
  for (const el of elements) {
    const way = RoadWaySchema.safeParse(el);
    if (!way.success || !way.data.tags?.barrier) continue;
    for (const nodeId of way.data.nodes ?? []) {
      if (!nodeDetails.has(nodeId)) continue;
      const atNode = barriers.get(nodeId) ?? new Map();
      const id = String(way.data.id);
      atNode.set(id, { id, tags: { ...way.data.tags } });
      barriers.set(nodeId, atNode);
    }
  }
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
      ...(e.tags ? { tags: { ...e.tags } } : {}),
      // Never guess node/coordinate alignment for partial or malformed data.
      ...(e.nodes?.length === e.geometry.length ? {
        nodes: e.geometry.map((point, index) => {
          const id = e.nodes![index];
          const detail = nodeDetails.get(id);
          return {
            id: String(id), ...point,
            // Missing/misaligned metadata stays unknown, never an empty tag set.
            ...(detail && detail.lat === point.lat && detail.lon === point.lon
              ? { tags: { ...detail.tags } } : {}),
            ...(barriers.has(id) ? { barriers: [...barriers.get(id)!.values()] } : {}),
          };
        }),
      } : {}),
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
  upstream: UpstreamOptions = {},
): Promise<Road[]> {
  const radius = Math.min(radiusMeters, MAX_RADIUS_METERS);
  const query = `
    [out:json][timeout:25];
    (
      way["highway"~"^((motorway|trunk|primary|secondary|tertiary)(_link)?|residential|unclassified|living_street|footway|pedestrian|steps|path|service)$"](around:${radius},${lat},${lon});
    )->.roads;
    .roads out body geom;
    node(w.roads)->.roadNodes;
    .roadNodes out body;
    way(bn.roadNodes)["barrier"];
    out body;
  `.trim();

  const elements = await overpassFetch(query, OVERPASS_TIMEOUT_MS, upstream);
  return roadsFromElements(elements);
}
