import type { MapLayout, RenderOptions, RoadClass } from "../types.js";
import { BASE_ROAD_STYLE, ROAD_RANK, type PresetSpec } from "./theme.js";
import type { Box } from "./text.js";

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

// Only the two top tiers get name labels (residential clutter kills legibility).
const LABELED_ROAD_CLASSES = new Set<RoadClass>(["primary", "secondary"]);

const ROAD_CLIP_INSET_PX = 16;
const MIN_DIAGRAM_ROAD_RUN_PX = 56;
const PARALLEL_ROAD_DEDUPE_PX = 28;
const MINOR_ROAD_FOCUS_DISTANCE_PX = 100;
const LABEL_INSET_PX = 30;

export interface Point {
  x: number;
  y: number;
}

export interface RoadSpine {
  start: Point;
  end: Point;
  length: number;
}

export function roadStyle(
  roadClass: RoadClass,
  preset: PresetSpec,
): { width: number; color: string } {
  const style = BASE_ROAD_STYLE[roadClass] ?? BASE_ROAD_STYLE.path;
  return { width: style.width * preset.roadScale, color: style.color };
}

export function bestRoadName(roads: MapLayout["roads"]): string | null {
  return [...roads]
    .filter((road) => road.name && LABELED_ROAD_CLASSES.has(road.class))
    .sort((a, b) => ROAD_RANK[b.class] - ROAD_RANK[a.class])[0]?.name ?? null;
}

export function roadObstacleBoxes(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): Box[] {
  return roads
    .map((road) => diagramRoadSpine(road, project, width, height))
    .filter((spine): spine is RoadSpine => spine !== null)
    .map((spine) => {
      const pad = 9;
      const minX = Math.min(spine.start.x, spine.end.x) - pad;
      const minY = Math.min(spine.start.y, spine.end.y) - pad;
      const maxX = Math.max(spine.start.x, spine.end.x) + pad;
      const maxY = Math.max(spine.start.y, spine.end.y) + pad;
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    });
}

export function roadPathData(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  renderLayout: RenderOptions["layout"],
  width: number,
  height: number,
  roadGeometry: PresetSpec["roadGeometry"] = "spine",
): string | null {
  if (renderLayout === "geographic") return rawRoadPathData(road, project);
  if (roadGeometry === "orthogonal") return orthogonalRoadPathData(road, project, width, height);
  return diagramRoadPathData(road, project, width, height);
}

function rawRoadPathData(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
): string | null {
  if (road.points.length < 2) return null;
  return road.points
    .map((p, i) => {
      const [px, py] = project(p.lat, p.lon);
      return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
}

function diagramRoadPathData(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): string | null {
  const spine = diagramRoadSpine(road, project, width, height);
  if (!spine) return null;
  return `M${spine.start.x.toFixed(1)},${spine.start.y.toFixed(1)} L${spine.end.x.toFixed(1)},${spine.end.y.toFixed(1)}`;
}

function orthogonalRoadPathData(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): string | null {
  const spine = diagramRoadSpine(road, project, width, height);
  if (!spine) return null;
  const dx = spine.end.x - spine.start.x;
  const dy = spine.end.y - spine.start.y;
  if (Math.abs(dx) < 12 || Math.abs(dy) < 12) {
    return `M${spine.start.x.toFixed(1)},${spine.start.y.toFixed(1)} L${spine.end.x.toFixed(1)},${spine.end.y.toFixed(1)}`;
  }
  const elbow = Math.abs(dx) >= Math.abs(dy)
    ? { x: spine.end.x, y: spine.start.y }
    : { x: spine.start.x, y: spine.end.y };
  return [
    `M${spine.start.x.toFixed(1)},${spine.start.y.toFixed(1)}`,
    `L${elbow.x.toFixed(1)},${elbow.y.toFixed(1)}`,
    `L${spine.end.x.toFixed(1)},${spine.end.y.toFixed(1)}`,
  ].join(" ");
}

export function diagramRoadSpine(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): RoadSpine | null {
  const runs = clippedRoadRuns(
    road,
    project,
    ROAD_CLIP_INSET_PX,
    ROAD_CLIP_INSET_PX,
    width - ROAD_CLIP_INSET_PX,
    height - ROAD_CLIP_INSET_PX,
  );
  const best = runs
    .map((points) => ({ points, length: polylineLength(points) }))
    .filter((run) => run.length >= MIN_DIAGRAM_ROAD_RUN_PX)
    .sort((a, b) => b.length - a.length)[0];
  if (!best) return null;

  const start = best.points[0];
  const end = best.points[best.points.length - 1];
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < MIN_DIAGRAM_ROAD_RUN_PX) {
    return null;
  }
  return { start, end, length };
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
      score:
        ROAD_RANK[road.class] * 1000 +
        (road.name ? 220 : 0) +
        Math.min(clippedRoadLength(road, project, 0, 0, width, height), 1200),
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
        score:
          ROAD_RANK[road.class] * 1000 +
          (road.name ? 220 : 0) +
          Math.min(inFrameLength, 1200),
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
          score: ROAD_RANK[road.class] * 1000 + (road.name ? 220 : 0),
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

function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
  const x = start.x + t * dx;
  const y = start.y + t * dy;
  return Math.hypot(point.x - x, point.y - y);
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

export function clippedRoadLength(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  const projected = road.points.map((p) => project(p.lat, p.lon));
  let total = 0;
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
    total += Math.hypot(x1 - x0, y1 - y0);
  }
  return total;
}

function clippedRoadRuns(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Point[][] {
  const projected = road.points.map((p) => {
    const [x, y] = project(p.lat, p.lon);
    return { x, y };
  });

  const runs: Point[][] = [];
  let current: Point[] = [];
  const finishRun = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };

  for (let i = 1; i < projected.length; i++) {
    const clipped = clipSegment(
      projected[i - 1].x,
      projected[i - 1].y,
      projected[i].x,
      projected[i].y,
      minX,
      minY,
      maxX,
      maxY,
    );
    if (!clipped) {
      finishRun();
      continue;
    }

    const [[x0, y0], [x1, y1]] = clipped;
    const start = { x: x0, y: y0 };
    const end = { x: x1, y: y1 };
    const last = current[current.length - 1];
    if (!last) {
      current = [start, end];
    } else if (Math.hypot(last.x - start.x, last.y - start.y) <= 0.5) {
      current.push(end);
    } else {
      finishRun();
      current = [start, end];
    }
  }
  finishRun();
  return runs;
}

function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/**
 * Liang-Barsky line-segment clipping against the rectangle [minX,minY,maxX,maxY].
 * Returns the clipped endpoints, or null if the segment misses the rectangle.
 */
export function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): [[number, number], [number, number]] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - minX, maxX - x0, y0 - minY, maxY - y0];
  let tEnter = 0;
  let tExit = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // parallel to this edge AND on the outside
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) {
      if (t > tExit) return null;
      if (t > tEnter) tEnter = t;
    } else {
      if (t < tEnter) return null;
      if (t < tExit) tExit = t;
    }
  }
  return [
    [x0 + tEnter * dx, y0 + tEnter * dy],
    [x0 + tExit * dx, y0 + tExit * dy],
  ];
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
