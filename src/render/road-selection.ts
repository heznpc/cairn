import type { MapLayout } from "../types.js";
import { ROAD_RANK } from "./theme.js";
import {
  clippedRoadLength,
  diagramRoadSpine,
  pointToSegmentDistance,
  type Point,
  type RoadSpine,
} from "./road-geometry.js";

// A printed 약도 should feel curated, not like an OSM tile. Standard keeps
// tiny synthetic layouts readable, while compact/minimal presets still honor
// their smaller road budgets so the output form actually changes.
const MAX_ROADS_WITHOUT_FILTER = 5;
const MAX_ROADS_PER_NAME = 3;

// Geographic layout preserves raw OSM way geometry, so unlike the diagram
// presets it can't collapse each road to a 2-point spine. Without a cap, a
// dense-city request at the 5000m max radius returns hundreds of full-geometry
// ways and emits a multi-hundred-KB SVG (a resource-exhaustion vector on the
// stdio server / host). Bound both the way count and the total vertex budget.
// When the set already fits, it is returned untouched: same roads, same order,
// output identical to an uncapped render.
const MAX_GEOGRAPHIC_ROADS = 80;
const MAX_GEOGRAPHIC_ROAD_POINTS = 3000;

const PARALLEL_ROAD_DEDUPE_PX = 28;
const MINOR_ROAD_FOCUS_DISTANCE_PX = 100;

// Road-importance score: class tier dominates, a name is a tie-breaker bonus,
// and in-frame length is a capped final term. Kept in one place so the weights
// stay tuned together across the geographic and diagram selectors.
const ROAD_RANK_WEIGHT = 1000;
const NAMED_ROAD_BONUS = 220;
const MAX_IN_FRAME_LENGTH_SCORE = 1200;

function roadImportanceScore(road: MapLayout["roads"][number], inFrameLength: number): number {
  return (
    ROAD_RANK[road.class] * ROAD_RANK_WEIGHT +
    (road.name ? NAMED_ROAD_BONUS : 0) +
    Math.min(inFrameLength, MAX_IN_FRAME_LENGTH_SCORE)
  );
}

// Bound the geographic-layout road set without discarding raw geometry: keep
// the full way vertices (that's the point of geographic mode) but cap how many
// ways render and their combined vertex count. Under budget, the drawable set
// is returned as-is; over budget, the most important + most in-frame ways win,
// then original order is restored so the drawn skeleton stays visually stable.
export function selectGeographicRoads(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): MapLayout["roads"] {
  const drawable = roads.filter((road) => road.points.length >= 2);
  const totalPoints = drawable.reduce((sum, road) => sum + road.points.length, 0);
  if (drawable.length <= MAX_GEOGRAPHIC_ROADS && totalPoints <= MAX_GEOGRAPHIC_ROAD_POINTS) {
    return drawable;
  }

  const scored = drawable
    .map((road, index) => ({
      road,
      index,
      score: roadImportanceScore(road, clippedRoadLength(road, project, 0, 0, width, height)),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const picked: Array<{ road: MapLayout["roads"][number]; index: number }> = [];
  let pointBudget = 0;
  for (const item of scored) {
    if (picked.length >= MAX_GEOGRAPHIC_ROADS) break;
    // Always admit the top-scored way (even if it alone exceeds the vertex
    // budget); after that, skip ways that would push us over so smaller ones
    // can still fill the remaining budget.
    if (picked.length > 0 && pointBudget + item.road.points.length > MAX_GEOGRAPHIC_ROAD_POINTS) {
      continue;
    }
    pointBudget += item.road.points.length;
    picked.push(item);
  }

  return picked.sort((a, b) => a.index - b.index).map((item) => item.road);
}

export function selectDisplayRoads(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
  focus: Point,
  maxVisibleRoads: number,
): MapLayout["roads"] {
  const drawable = roads.filter((road) => road.points.length >= 2);
  if (drawable.length <= Math.min(MAX_ROADS_WITHOUT_FILTER, maxVisibleRoads)) return drawable;

  const scored = drawable
    .map((road, index) => {
      const inFrameLength = clippedRoadLength(road, project, 0, 0, width, height);
      return {
        road,
        index,
        inFrameLength,
        score: roadImportanceScore(road, inFrameLength),
      };
    })
    .filter((item) => item.inFrameLength > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const source = scored.length > 0
    ? scored
    : drawable
        .map((road, index) => ({
          road,
          index,
          inFrameLength: 0,
          score: roadImportanceScore(road, 0),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index);

  const picked: MapLayout["roads"] = [];
  const pickedByName = new Map<string, number>();
  const pickedSignatures: Array<{ angleBucket: number; offset: number }> = [];
  for (const item of source) {
    if (picked.length >= maxVisibleRoads) break;
    const spine = diagramRoadSpine(item.road, project, width, height);
    if (!spine) continue;
    if (item.road.class === "residential" || item.road.class === "path") {
      continue;
    }
    if (
      item.road.class === "tertiary" &&
      pointToSegmentDistance(focus, spine.start, spine.end) > MINOR_ROAD_FOCUS_DISTANCE_PX
    ) {
      continue;
    }
    const signature = roadVisualSignature(spine);
    if (pickedSignatures.some((picked) => isParallelDuplicate(signature, picked))) {
      continue;
    }
    if (item.road.name) {
      const count = pickedByName.get(item.road.name) ?? 0;
      if (count >= MAX_ROADS_PER_NAME) continue;
      pickedByName.set(item.road.name, count + 1);
    }
    pickedSignatures.push(signature);
    picked.push(item.road);
  }

  return picked;
}

function roadVisualSignature(spine: RoadSpine): { angleBucket: number; offset: number } {
  const dx = spine.end.x - spine.start.x;
  const dy = spine.end.y - spine.start.y;
  const angle = ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI;
  const angleBucket = Math.round(angle / (Math.PI / 12));
  const midX = (spine.start.x + spine.end.x) / 2;
  const midY = (spine.start.y + spine.end.y) / 2;
  const normal = angle + Math.PI / 2;
  const offset = midX * Math.cos(normal) + midY * Math.sin(normal);
  return { angleBucket, offset };
}

function isParallelDuplicate(
  a: { angleBucket: number; offset: number },
  b: { angleBucket: number; offset: number },
): boolean {
  return a.angleBucket === b.angleBucket && Math.abs(a.offset - b.offset) < PARALLEL_ROAD_DEDUPE_PX;
}
