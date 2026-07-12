import type { Point } from "./road-geometry.js";

const DEFAULT_MAX_SNAP_DISTANCE = 96;
const DEFAULT_MAX_DETOUR_RATIO = 3.5;
const EPSILON = 1e-6;

export interface ApproachRouteOptions {
  start: Point;
  startAnchor?: Point;
  destination: Point;
  roads: readonly (readonly Point[])[];
  startTrim: number;
  endTrim: number;
  maxSnapDistance?: number;
  maxDetourRatio?: number;
}

export interface ApproachRoute {
  points: Point[];
  mode: "inferred-road" | "direct";
}

interface SegmentStop {
  point: Point;
  progress: number;
}

interface RouteSegment {
  start: Point;
  end: Point;
  stops: SegmentStop[];
}

interface SegmentSnap extends SegmentStop {
  segmentIndex: number;
  distance: number;
}

/**
 * Route over the simplified road axes visible in the diagram. If those axes
 * do not form a credible connected path, fall back to a direct approach cue.
 */
export function buildApproachRoute(options: ApproachRouteOptions): ApproachRoute | null {
  const direct = [options.start, options.destination];
  const roadRoute = routeOnVisibleRoads(options);
  const route = roadRoute ?? direct;
  const points = trimPolyline(route, options.startTrim, options.endTrim);
  return points ? { points, mode: roadRoute ? "inferred-road" : "direct" } : null;
}

export function polylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
  }
  return length;
}

function routeOnVisibleRoads(options: ApproachRouteOptions): Point[] | null {
  const segments = buildSegments(options.roads);
  if (segments.length === 0) return null;
  addIntersections(segments);

  const startSnap = nearestSegmentSnap(options.startAnchor ?? options.start, segments);
  const destinationSnap = nearestSegmentSnap(options.destination, segments);
  const maxSnapDistance = options.maxSnapDistance ?? DEFAULT_MAX_SNAP_DISTANCE;
  if (
    !startSnap || !destinationSnap ||
    startSnap.distance > maxSnapDistance ||
    destinationSnap.distance > maxSnapDistance
  ) {
    return null;
  }
  segments[startSnap.segmentIndex].stops.push(startSnap);
  segments[destinationSnap.segmentIndex].stops.push(destinationSnap);

  const graph = buildGraph(segments);
  const networkKeys = shortestPath(
    graph.edges,
    pointKey(startSnap.point),
    pointKey(destinationSnap.point),
  );
  if (!networkKeys) return null;
  const networkPoints = networkKeys.map((key) => graph.points.get(key)!);
  const route = dedupePoints([
    options.start,
    startSnap.point,
    ...networkPoints,
    destinationSnap.point,
    options.destination,
  ]);
  const directLength = Math.hypot(
    options.destination.x - options.start.x,
    options.destination.y - options.start.y,
  );
  const maxDetourRatio = options.maxDetourRatio ?? DEFAULT_MAX_DETOUR_RATIO;
  if (directLength <= EPSILON || polylineLength(route) > directLength * maxDetourRatio) {
    return null;
  }
  return route;
}

function buildSegments(roads: readonly (readonly Point[])[]): RouteSegment[] {
  const segments: RouteSegment[] = [];
  for (const road of roads) {
    for (let index = 1; index < road.length; index++) {
      const start = road[index - 1];
      const end = road[index];
      if (Math.hypot(end.x - start.x, end.y - start.y) <= EPSILON) continue;
      segments.push({
        start,
        end,
        stops: [
          { point: start, progress: 0 },
          { point: end, progress: 1 },
        ],
      });
    }
  }
  return segments;
}

function addIntersections(segments: RouteSegment[]): void {
  for (let first = 0; first < segments.length; first++) {
    for (let second = first + 1; second < segments.length; second++) {
      const intersection = segmentIntersection(segments[first], segments[second]);
      if (!intersection) continue;
      segments[first].stops.push({
        point: intersection.point,
        progress: intersection.firstProgress,
      });
      segments[second].stops.push({
        point: intersection.point,
        progress: intersection.secondProgress,
      });
    }
  }
}

function segmentIntersection(
  first: RouteSegment,
  second: RouteSegment,
): { point: Point; firstProgress: number; secondProgress: number } | null {
  const firstDx = first.end.x - first.start.x;
  const firstDy = first.end.y - first.start.y;
  const secondDx = second.end.x - second.start.x;
  const secondDy = second.end.y - second.start.y;
  const denominator = firstDx * secondDy - firstDy * secondDx;
  if (Math.abs(denominator) <= EPSILON) return null;
  const offsetX = second.start.x - first.start.x;
  const offsetY = second.start.y - first.start.y;
  const firstProgress = (offsetX * secondDy - offsetY * secondDx) / denominator;
  const secondProgress = (offsetX * firstDy - offsetY * firstDx) / denominator;
  if (
    firstProgress < -EPSILON || firstProgress > 1 + EPSILON ||
    secondProgress < -EPSILON || secondProgress > 1 + EPSILON
  ) {
    return null;
  }
  return {
    point: {
      x: first.start.x + firstDx * firstProgress,
      y: first.start.y + firstDy * firstProgress,
    },
    firstProgress: clamp01(firstProgress),
    secondProgress: clamp01(secondProgress),
  };
}

function nearestSegmentSnap(point: Point, segments: RouteSegment[]): SegmentSnap | null {
  let best: SegmentSnap | null = null;
  for (const [segmentIndex, segment] of segments.entries()) {
    const snap = projectPointToSegment(point, segment.start, segment.end);
    if (!best || snap.distance < best.distance) {
      best = { ...snap, segmentIndex };
    }
  }
  return best;
}

function projectPointToSegment(
  point: Point,
  start: Point,
  end: Point,
): Omit<SegmentSnap, "segmentIndex"> {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared <= EPSILON
    ? 0
    : clamp01(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared);
  const projected = { x: start.x + dx * progress, y: start.y + dy * progress };
  return {
    point: projected,
    progress,
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
  };
}

function buildGraph(segments: RouteSegment[]): {
  points: Map<string, Point>;
  edges: Map<string, Map<string, number>>;
} {
  const points = new Map<string, Point>();
  const edges = new Map<string, Map<string, number>>();
  for (const segment of segments) {
    const stops = uniqueStops(segment.stops).sort((a, b) => a.progress - b.progress);
    for (let index = 1; index < stops.length; index++) {
      const start = stops[index - 1].point;
      const end = stops[index].point;
      const startKey = pointKey(start);
      const endKey = pointKey(end);
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      points.set(startKey, start);
      points.set(endKey, end);
      addEdge(edges, startKey, endKey, distance);
      addEdge(edges, endKey, startKey, distance);
    }
  }
  return { points, edges };
}

function uniqueStops(stops: SegmentStop[]): SegmentStop[] {
  const byProgress = new Map<string, SegmentStop>();
  for (const stop of stops) byProgress.set(stop.progress.toFixed(6), stop);
  return [...byProgress.values()];
}

function addEdge(
  graph: Map<string, Map<string, number>>,
  from: string,
  to: string,
  distance: number,
): void {
  const neighbors = graph.get(from) ?? new Map<string, number>();
  const current = neighbors.get(to);
  if (current === undefined || distance < current) neighbors.set(to, distance);
  graph.set(from, neighbors);
}

function shortestPath(
  graph: Map<string, Map<string, number>>,
  start: string,
  destination: string,
): string[] | null {
  if (!graph.has(start) || !graph.has(destination)) return null;
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const unvisited = new Set(graph.keys());

  while (unvisited.size > 0) {
    let current: string | null = null;
    let currentDistance = Infinity;
    for (const key of unvisited) {
      const distance = distances.get(key) ?? Infinity;
      if (distance < currentDistance) {
        current = key;
        currentDistance = distance;
      }
    }
    if (!current || currentDistance === Infinity) break;
    unvisited.delete(current);
    if (current === destination) break;
    for (const [neighbor, edgeDistance] of graph.get(current) ?? []) {
      if (!unvisited.has(neighbor)) continue;
      const candidate = currentDistance + edgeDistance;
      if (candidate < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, candidate);
        previous.set(neighbor, current);
      }
    }
  }
  if (start !== destination && !previous.has(destination)) return null;
  const path = [destination];
  while (path[0] !== start) path.unshift(previous.get(path[0])!);
  return path;
}

function trimPolyline(points: readonly Point[], startTrim: number, endTrim: number): Point[] | null {
  if (polylineLength(points) <= startTrim + endTrim + 8) return null;
  const fromStart = trimPolylineStart(points, startTrim);
  const fromEnd = trimPolylineStart([...fromStart].reverse(), endTrim).reverse();
  return dedupePoints(fromEnd);
}

function trimPolylineStart(points: readonly Point[], trim: number): Point[] {
  if (trim <= 0) return [...points];
  let remaining = trim;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length <= remaining + EPSILON) {
      remaining -= length;
      continue;
    }
    const progress = remaining / length;
    return [
      {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      },
      ...points.slice(index),
    ];
  }
  return [points[points.length - 1]];
}

function dedupePoints(points: readonly Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.01) {
      deduped.push(point);
    }
  }
  return deduped;
}

function pointKey(point: Point): string {
  return `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
