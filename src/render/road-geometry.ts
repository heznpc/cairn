import type { MapLayout, RenderOptions } from "../types.js";
import type { TemplateSpec } from "./theme.js";

const ROAD_CLIP_INSET_PX = 16;
const MIN_DIAGRAM_ROAD_RUN_PX = 56;

export interface Point {
  x: number;
  y: number;
}

export interface RoadSpine {
  start: Point;
  end: Point;
  length: number;
}

/** Serialize a projected polyline to an SVG path `d` string ("M x,y L x,y …"). */
export function pointsToPathData(points: readonly Point[]): string {
  return points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");
}

/** Perpendicular distance from `point` to the segment `start`→`end`. */
export function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
  const x = start.x + t * dx;
  const y = start.y + t * dy;
  return Math.hypot(point.x - x, point.y - y);
}

export function roadPathData(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  renderLayout: RenderOptions["layout"],
  width: number,
  height: number,
  roadGeometry: TemplateSpec["roadGeometry"] = "spine",
): string | null {
  const points = roadPathPoints(
    road,
    project,
    renderLayout,
    width,
    height,
    roadGeometry,
  );
  if (!points) return null;
  return pointsToPathData(points);
}

export function roadPathPoints(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  renderLayout: RenderOptions["layout"],
  width: number,
  height: number,
  roadGeometry: TemplateSpec["roadGeometry"] = "spine",
): Point[] | null {
  if (renderLayout === "geographic") return rawRoadPoints(road, project);
  if (roadGeometry === "orthogonal") {
    return orthogonalRoadPoints(road, project, width, height);
  }
  return diagramRoadPoints(road, project, width, height);
}

function rawRoadPoints(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
): Point[] | null {
  if (road.points.length < 2) return null;
  return road.points.map((point) => {
    const [x, y] = project(point.lat, point.lon);
    return { x, y };
  });
}

function diagramRoadPoints(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): Point[] | null {
  const spine = diagramRoadSpine(road, project, width, height);
  if (!spine) return null;
  return [spine.start, spine.end];
}

function orthogonalRoadPoints(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): Point[] | null {
  const spine = diagramRoadSpine(road, project, width, height);
  if (!spine) return null;
  const dx = spine.end.x - spine.start.x;
  const dy = spine.end.y - spine.start.y;
  if (Math.abs(dx) < 12 || Math.abs(dy) < 12) {
    return [spine.start, spine.end];
  }
  const elbow = Math.abs(dx) >= Math.abs(dy)
    ? { x: spine.end.x, y: spine.start.y }
    : { x: spine.start.x, y: spine.end.y };
  return [spine.start, elbow, spine.end];
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

export function polylineLength(points: readonly Point[]): number {
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
