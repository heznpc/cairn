import type { MapLayout, RenderOptions } from "../types.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MIN_CANVAS_DIMENSION_PX,
} from "../limits.js";

// Minimum canvas dimension — projection uses (width - 100) and (height - 100)
// as the plotting span (50px margin on each side). At width=100 the span is
// zero, below that it's negative and coordinates flip. handlers.ts and cli.ts
// inputSchemas enforce 100 at the entry points; this clamp is defense in
// depth for direct pipeline.ts callers (tests, future internal users) and
// guarantees a strictly-positive plotting span.
const MIN_SPAN = 1;

// Distortion factor for the destination fisheye. Higher = stronger magnification
// of the focus area. Kept gentle so the map still reads as spatial, not warped.
const FOCUS_STRENGTH = 1.2;

export type Projector = (lat: number, lon: number) => [number, number];

export interface CanvasSize {
  width: number;
  height: number;
}

export interface ProjectionContext {
  project: Projector;
  center: { x: number; y: number };
}

export function resolveCanvasSize(opts: RenderOptions = {}): CanvasSize {
  return {
    width: safeDimension(opts.width, 600),
    height: safeDimension(opts.height, 400),
  };
}

function safeDimension(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(
    Math.max(value ?? fallback, MIN_CANVAS_DIMENSION_PX),
    MAX_CANVAS_DIMENSION_PX,
  );
}

export function createProjection(
  layout: MapLayout,
  width: number,
  height: number,
  opts: Pick<RenderOptions, "layout" | "focus"> = {},
): ProjectionContext {
  const renderLayout = opts.layout ?? "diagram";
  const spanX = Math.max(width - 100, MIN_SPAN);
  const spanY = Math.max(height - 100, MIN_SPAN);
  const { bbox, center } = layout;

  const baseProject: Projector = (lat, lon) => {
    const denomLon = bbox.east - bbox.west || 1e-6;
    const denomLat = bbox.north - bbox.south || 1e-6;
    const x = ((lon - bbox.west) / denomLon) * spanX + 50;
    const y = ((bbox.north - lat) / denomLat) * spanY + 50;
    return [x, y];
  };

  // Opt-in destination fisheye (diagram layouts only): magnify the area around
  // the destination, compress the periphery — like a hand-drawn 약도 that
  // enlarges the important last block. The destination is the warp's fixed
  // point, so it stays exactly where the linear projection placed it.
  const [focusX, focusY] = baseProject(center.lat, center.lon);
  const useFocus = renderLayout === "diagram" && opts.focus === true;
  const focusRadius = Math.hypot(width, height) / 2;
  const project = useFocus
    ? (lat: number, lon: number): [number, number] =>
        focusWarp(baseProject(lat, lon), focusX, focusY, focusRadius)
    : baseProject;

  const [cx, cy] = project(center.lat, center.lon);
  return { project, center: { x: cx, y: cy } };
}

// Sarkar–Brown graphical fisheye around a focus point (px space). Magnifies
// near the focus and compresses the periphery; the focus itself is a fixed
// point, the mapping is monotonic in radius, and warped points stay within
// `radius` of the focus (bounded). Pure and deterministic.
function focusWarp(
  point: [number, number],
  cx: number,
  cy: number,
  radius: number,
): [number, number] {
  const [px, py] = point;
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6 || radius <= 0) return [px, py];
  const r = Math.min(d / radius, 1);
  const warped = ((FOCUS_STRENGTH + 1) * r) / (FOCUS_STRENGTH * r + 1);
  const scale = (warped * radius) / d;
  return [cx + dx * scale, cy + dy * scale];
}
