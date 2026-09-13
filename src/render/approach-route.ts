import type { Road } from "../types.js";
import { polylineLength, type Point } from "./road-geometry.js";

// Re-exported so existing importers (and tests) can keep resolving it here.
export { polylineLength } from "./road-geometry.js";

const DEFAULT_MAX_SNAP_DISTANCE = 96;
const DEFAULT_MAX_DETOUR_RATIO = 3.5;
const EPSILON = 1e-6;
const MAX_NETWORK_SEGMENTS = 12000;

export interface ApproachRouteOptions {
  start: Point;
  startAnchor?: Point;
  destination: Point;
  roads: readonly Road[];
  project: (lat: number, lon: number) => [number, number];
  bounds?: { width: number; height: number };
  startTrim: number;
  endTrim: number;
  maxSnapDistance?: number;
  maxDetourRatio?: number;
}

export interface ApproachRoute {
  points: Point[];
  mode: "osm-network" | "direct";
  /** Only the node-connected portion, excluding unverified endpoint connectors. */
  networkPoints?: Point[];
}

interface NetworkRoute {
  points: Point[];
  networkStart: number;
  networkEnd: number;
}

interface SegmentStop {
  key: string;
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
 * Follow original OSM node adjacency, independently of display simplification
 * and road selection. A shared coordinate or screen intersection is not an edge.
 * Snapping and access defaults remain heuristic: this is not verified routing.
 */
export function buildApproachRoute(options: ApproachRouteOptions): ApproachRoute | null {
  const direct = [options.start, options.destination];
  const roadRoute = routeOnOsmNetwork(options);
  if (roadRoute) {
    const length = polylineLength(roadRoute.points);
    const from = Math.max(options.startTrim, roadRoute.networkStart);
    const to = Math.min(length - options.endTrim, roadRoute.networkEnd);
    const points = trimPolyline(roadRoute.points, options.startTrim, options.endTrim);
    if (points && to - from > 8) {
      const afterStart = trimPolylineStart(roadRoute.points, from);
      const networkPoints = dedupePoints(trimPolylineStart([...afterStart].reverse(), length - to).reverse());
      return { points, mode: "osm-network", networkPoints };
    }
  }
  const points = trimPolyline(direct, options.startTrim, options.endTrim);
  return points ? { points, mode: "direct" } : null;
}

function routeOnOsmNetwork(options: ApproachRouteOptions): NetworkRoute | null {
  const segments = buildSegments(options);
  if (!segments?.length) return null;

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
    startSnap.key,
    destinationSnap.key,
  );
  if (!networkKeys) return null;
  const networkPoints = networkKeys.map((key) => graph.points.get(key)!);
  if (polylineLength(networkPoints) <= EPSILON) return null;
  if (options.bounds && networkPoints.some(({ x, y }) =>
    x < 0 || y < 0 || x > options.bounds!.width || y > options.bounds!.height
  )) return null;
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
  const networkStart = Math.hypot(options.start.x - startSnap.point.x, options.start.y - startSnap.point.y);
  return { points: route, networkStart, networkEnd: networkStart + polylineLength(networkPoints) };
}

/** Conservative way-level access filter. Preserve raw tags for future routing adapters. */
export function canInferFootAccess(road: Road): boolean {
  const tags = road.tags;
  if (!tags?.highway || tags.area === "yes") return false;
  // Conditions, directions and indoor levels need a richer routing model.
  // Do not silently treat them as an unrestricted bidirectional street.
  if (
    tags["foot:conditional"] || tags["access:conditional"] ||
    (tags["oneway:foot"] && tags["oneway:foot"] !== "no") ||
    tags.indoor === "yes"
  ) return false;
  const access = tags.foot ?? tags.access;
  if (access && !["yes", "designated", "permissive", "official"].includes(access)) return false;
  if (tags.foot) return true;
  return /^(primary|secondary|tertiary)(_link)?$/.test(tags.highway) ||
    ["residential", "unclassified", "living_street", "service", "footway", "pedestrian", "steps", "path"].includes(tags.highway);
}

function buildSegments(options: ApproachRouteOptions): RouteSegment[] | null {
  const segments: RouteSegment[] = [];
  const nodePoints = new Map<string, Point>();
  for (const road of options.roads) {
    if (!road.nodes || !canInferFootAccess(road)) continue;
    if (segments.length + road.nodes.length - 1 > MAX_NETWORK_SEGMENTS) return null;
    const stops = road.nodes.map((node) => {
      const [x, y] = options.project(node.lat, node.lon);
      return { key: `osm:${node.id}`, point: { x, y } };
    });
    for (const stop of stops) {
      if (!Number.isFinite(stop.point.x) || !Number.isFinite(stop.point.y)) return null;
      const previous = nodePoints.get(stop.key);
      // Conflicting copies of a node must not teleport the route between ways.
      if (previous && Math.hypot(previous.x - stop.point.x, previous.y - stop.point.y) > EPSILON) return null;
      nodePoints.set(stop.key, stop.point);
    }
    for (let index = 1; index < stops.length; index++) {
      const start = stops[index - 1];
      const end = stops[index];
      if (Math.hypot(end.point.x - start.point.x, end.point.y - start.point.y) <= EPSILON) continue;
      segments.push({
        start: start.point,
        end: end.point,
        stops: [{ ...start, progress: 0 }, { ...end, progress: 1 }],
      });
    }
  }
  return segments;
}

function nearestSegmentSnap(point: Point, segments: RouteSegment[]): SegmentSnap | null {
  let best: SegmentSnap | null = null;
  for (const [segmentIndex, segment] of segments.entries()) {
    const snap = projectPointToSegment(point, segment.start, segment.end);
    if (!best || snap.distance < best.distance) {
      const key = snap.progress <= EPSILON ? segment.stops[0].key
        : snap.progress >= 1 - EPSILON ? segment.stops[1].key
        : `snap:${segmentIndex}:${snap.progress.toFixed(9)}`;
      best = { ...snap, segmentIndex, key };
    }
  }
  return best;
}

function projectPointToSegment(
  point: Point,
  start: Point,
  end: Point,
): Omit<SegmentSnap, "segmentIndex" | "key"> {
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
      const startKey = stops[index - 1].key;
      const endKey = stops[index].key;
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
  const byKey = new Map<string, SegmentStop>();
  for (const stop of stops) byKey.set(stop.key, stop);
  return [...byKey.values()];
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
  const queue = new DistanceQueue();
  queue.push(start, 0);
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const { key: current, distance: currentDistance } = entry;
    if (currentDistance !== distances.get(current)) continue;
    if (current === destination) break;
    for (const [neighbor, edgeDistance] of graph.get(current) ?? []) {
      const candidate = currentDistance + edgeDistance;
      if (candidate < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, candidate);
        previous.set(neighbor, current);
        queue.push(neighbor, candidate);
      }
    }
  }
  if (start !== destination && !previous.has(destination)) return null;
  const path = [destination];
  while (path[path.length - 1] !== start) path.push(previous.get(path[path.length - 1])!);
  return path.reverse();
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

// A binary heap keeps a dense pedestrian graph from making Dijkstra quadratic.
class DistanceQueue {
  private entries: Array<{ key: string; distance: number }> = [];

  push(key: string, distance: number): void {
    const entry = { key, distance };
    let index = this.entries.length;
    this.entries.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.entries[parent].distance <= distance) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop(): { key: string; distance: number } | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (!last || this.entries.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < this.entries.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.entries.length && this.entries[child + 1].distance < this.entries[child].distance) child++;
      if (last.distance <= this.entries[child].distance) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
