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

  // Equirectangular projection with a cos(latitude) correction, then a single
  // uniform scale for both axes.
  //
  // The naive version stretched the lon/lat bbox independently to fill the
  // canvas, which silently replaced real shape with the canvas aspect ratio.
  // Because a degree of longitude shrinks with latitude, the error grew as you
  // moved away from the equator: at 60°N a degree of longitude covers about
  // half the ground a degree of latitude does, so Oslo came out stretched ~2x
  // horizontally and right-angle junctions rendered skewed.
  //
  // Scaling both axes by the same factor keeps angles and proportions honest
  // everywhere, which is what makes the diagram match what the reader sees on
  // the street. The trade-off is letterboxing: whichever axis is relatively
  // shorter gets centered in the leftover space instead of being stretched.
  const lonScale = Math.cos((center.lat * Math.PI) / 180);
  const metricWidth = Math.max((bbox.east - bbox.west) * lonScale, 1e-9);
  const metricHeight = Math.max(bbox.north - bbox.south, 1e-9);
  const scale = Math.min(spanX / metricWidth, spanY / metricHeight);
  // Center the projected extent in the plotting area.
  const offsetX = 50 + (spanX - metricWidth * scale) / 2;
  const offsetY = 50 + (spanY - metricHeight * scale) / 2;

  const baseProject: Projector = (lat, lon) => {
    const x = (lon - bbox.west) * lonScale * scale + offsetX;
    const y = (bbox.north - lat) * scale + offsetY;
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
