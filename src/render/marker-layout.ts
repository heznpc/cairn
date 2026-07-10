import type { MapLayout, RenderOptions } from "../types.js";
import type { Box } from "./text.js";
import { roadPathPoints, type Point } from "./road-geometry.js";
import { roadStyle } from "./road-style.js";
import type { PresetSpec } from "./theme.js";

export const LANDMARK_MARKER_RADIUS = 17;
const DESTINATION_MARKER_RADIUS = 13;
const ROAD_CLEARANCE = 4;
const MARKER_CLEARANCE = 6;
const FRAME_INSET = 18;
const CANDIDATE_RADII = [30, 42, 54, 66, 78];
const DIAGONAL = Math.SQRT1_2;
const CANDIDATE_DIRECTIONS: Point[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: DIAGONAL, y: -DIAGONAL },
  { x: -DIAGONAL, y: -DIAGONAL },
  { x: DIAGONAL, y: DIAGONAL },
  { x: -DIAGONAL, y: DIAGONAL },
];

export interface RoadCorridor {
  start: Point;
  end: Point;
  halfWidth: number;
}

export interface MarkerAnchor {
  anchorX: number;
  anchorY: number;
  importance: number;
}

export interface MarkerPlacement extends MarkerAnchor {
  x: number;
  y: number;
  displaced: boolean;
}

export interface MarkerLayoutOptions {
  width: number;
  height: number;
  destination: Point;
  obstacles?: Box[];
}

export function roadMarkerCorridors(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
  renderLayout: RenderOptions["layout"],
  width: number,
  height: number,
  preset: PresetSpec,
): RoadCorridor[] {
  const corridors: RoadCorridor[] = [];
  for (const road of roads) {
    const points = roadPathPoints(
      road,
      project,
      renderLayout,
      width,
      height,
      preset.roadGeometry,
    );
    if (!points) continue;
    const style = roadStyle(road.class, preset);
    const halfWidth = (style.width + 5 * preset.roadScale) / 2;
    for (let index = 1; index < points.length; index++) {
      corridors.push({
        start: points[index - 1],
        end: points[index],
        halfWidth,
      });
    }
  }
  return corridors;
}

/**
 * Keep landmark glyphs outside navigational road corridors. The geographic
 * anchor remains unchanged; only the display position moves. A null result
 * means no candidate can preserve the invariant, so the lower-value visual is
 * omitted instead of erasing a route.
 */
export function placeLandmarkMarkers(
  markers: MarkerAnchor[],
  roads: RoadCorridor[],
  options: MarkerLayoutOptions,
): Array<MarkerPlacement | null> {
  const placed: Array<MarkerPlacement | null> = Array(markers.length).fill(null);
  const occupied: Point[] = [];
  const order = markers
    .map((marker, index) => ({ marker, index }))
    .sort((a, b) => b.marker.importance - a.marker.importance || a.index - b.index);

  for (const { marker, index } of order) {
    const candidate = markerCandidates(marker).find((point) =>
      markerFits(point, occupied, roads, options),
    );
    if (!candidate) continue;
    const displacement = Math.hypot(
      candidate.x - marker.anchorX,
      candidate.y - marker.anchorY,
    );
    placed[index] = {
      ...marker,
      ...candidate,
      displaced: displacement > 0.5,
    };
    occupied.push(candidate);
  }

  return placed;
}

export function markerLeaderSegment(
  marker: MarkerPlacement,
): { start: Point; end: Point } | null {
  if (!marker.displaced) return null;
  const dx = marker.x - marker.anchorX;
  const dy = marker.y - marker.anchorY;
  const distance = Math.hypot(dx, dy);
  const startTrim = 2;
  const endTrim = LANDMARK_MARKER_RADIUS + 2;
  if (distance <= startTrim + endTrim) return null;
  const ux = dx / distance;
  const uy = dy / distance;
  return {
    start: {
      x: marker.anchorX + ux * startTrim,
      y: marker.anchorY + uy * startTrim,
    },
    end: {
      x: marker.x - ux * endTrim,
      y: marker.y - uy * endTrim,
    },
  };
}

export function pointToSegmentDistance(point: Point, segment: RoadCorridor): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - segment.start.x, point.y - segment.start.y);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (segment.start.x + t * dx),
    point.y - (segment.start.y + t * dy),
  );
}

function markerCandidates(marker: MarkerAnchor): Point[] {
  const candidates: Point[] = [{ x: marker.anchorX, y: marker.anchorY }];
  for (const radius of CANDIDATE_RADII) {
    for (const direction of CANDIDATE_DIRECTIONS) {
      candidates.push({
        x: marker.anchorX + direction.x * radius,
        y: marker.anchorY + direction.y * radius,
      });
    }
  }
  return candidates;
}

function markerFits(
  point: Point,
  occupied: Point[],
  roads: RoadCorridor[],
  options: MarkerLayoutOptions,
): boolean {
  const min = FRAME_INSET + LANDMARK_MARKER_RADIUS;
  if (
    point.x < min ||
    point.y < min ||
    point.x > options.width - min ||
    point.y > options.height - min
  ) {
    return false;
  }

  for (const road of roads) {
    const required = LANDMARK_MARKER_RADIUS + road.halfWidth + ROAD_CLEARANCE;
    if (pointToSegmentDistance(point, road) < required) return false;
  }

  const destinationDistance =
    LANDMARK_MARKER_RADIUS + DESTINATION_MARKER_RADIUS + MARKER_CLEARANCE;
  if (Math.hypot(point.x - options.destination.x, point.y - options.destination.y) < destinationDistance) {
    return false;
  }

  const markerDistance = LANDMARK_MARKER_RADIUS * 2 + MARKER_CLEARANCE;
  if (occupied.some((other) => Math.hypot(point.x - other.x, point.y - other.y) < markerDistance)) {
    return false;
  }

  return !(options.obstacles ?? []).some((obstacle) =>
    circleIntersectsBox(point, LANDMARK_MARKER_RADIUS + MARKER_CLEARANCE / 2, obstacle),
  );
}

function circleIntersectsBox(center: Point, radius: number, box: Box): boolean {
  const nearestX = Math.max(box.x, Math.min(center.x, box.x + box.width));
  const nearestY = Math.max(box.y, Math.min(center.y, box.y + box.height));
  return Math.hypot(center.x - nearestX, center.y - nearestY) < radius;
}
