import type { MapLayout, RoadClass } from "../types.js";
import { ROAD_RANK } from "./theme.js";
import { clipSegment } from "./road-geometry.js";

// Only the two top tiers get name labels (residential clutter kills legibility).
export const LABELED_ROAD_CLASSES = new Set<RoadClass>(["primary", "secondary"]);

const LABEL_INSET_PX = 30;

export function bestRoadName(roads: MapLayout["roads"]): string | null {
  return [...roads]
    .filter((road) => road.name && LABELED_ROAD_CLASSES.has(road.class))
    .sort((a, b) => ROAD_RANK[b.class] - ROAD_RANK[a.class])[0]?.name ?? null;
}

export function roadLabelPositions(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const best = new Map<string, { x: number; y: number; len: number }>();
  const minX = LABEL_INSET_PX;
  const maxX = width - LABEL_INSET_PX;
  const minY = LABEL_INSET_PX;
  const maxY = height - LABEL_INSET_PX;

  for (const road of roads) {
    if (!road.name || !LABELED_ROAD_CLASSES.has(road.class)) continue;
    if (road.points.length < 2) continue;

    const projected = road.points.map((p) => project(p.lat, p.lon));

    let bestLen = 0;
    let bestMid: [number, number] | null = null;
    for (let i = 1; i < projected.length; i++) {
      const clipped = clipSegment(
        projected[i - 1][0],
        projected[i - 1][1],
        projected[i][0],
        projected[i][1],
        minX,
        minY,
        maxX,
        maxY,
      );
      if (!clipped) continue;
      const [[x0, y0], [x1, y1]] = clipped;
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len > bestLen) {
        bestLen = len;
        bestMid = [(x0 + x1) / 2, (y0 + y1) / 2];
      }
    }

    if (!bestMid) continue; // entire road off-frame: no legible label site

    const prev = best.get(road.name);
    if (prev && prev.len >= bestLen) continue;
    best.set(road.name, { x: bestMid[0], y: bestMid[1], len: bestLen });
  }

  const out = new Map<string, { x: number; y: number }>();
  for (const [name, { x, y }] of best) out.set(name, { x, y });
  return out;
}
