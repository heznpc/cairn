import type { LandmarkCategory, MapLayout, RenderOptions, RoadClass } from "./types.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";

const MARKER_STYLE: Record<LandmarkCategory, { icon: string; color: string }> = {
  station: { icon: "M", color: "#3f6ea8" },
  bus_stop: { icon: "B", color: "#4b7f89" },
  cafe: { icon: "C", color: "#8a7159" },
  convenience: { icon: "CV", color: "#5b7c48" },
  restaurant: { icon: "R", color: "#9a6a41" },
  school: { icon: "S", color: "#6e6ea8" },
  hospital: { icon: "+", color: "#9f4b4b" },
  park: { icon: "P", color: "#5d8a5a" },
  landmark: { icon: "*", color: "#8a6e3f" },
  building: { icon: "B", color: "#666" },
};

const FALLBACK_MARKER = { icon: "•", color: "#666" };

const ROAD_RANK: Record<RoadClass, number> = {
  primary: 5,
  secondary: 4,
  tertiary: 3,
  residential: 2,
  path: 1,
};

const ROAD_STYLE: Record<RoadClass, { width: number; color: string }> = {
  primary: { width: 11, color: "#beb8aa" },
  secondary: { width: 8, color: "#cbc6b9" },
  tertiary: { width: 5.5, color: "#d8d3c7" },
  residential: { width: 4, color: "#e4dfd2" },
  path: { width: 3, color: "#ebe6da" },
};

// A printed 약도 should feel curated, not like an OSM tile. Small synthetic
// unit-test layouts still render every road, while real Overpass-heavy layouts
// are reduced to a handful of readable axes.
const MAX_ROADS_WITHOUT_FILTER = 12;
const MAX_VISIBLE_ROADS = 10;
const MAX_ROADS_PER_NAME = 3;

// Only the two top tiers get name labels (residential clutter kills legibility).
const LABELED_ROAD_CLASSES = new Set<RoadClass>(["primary", "secondary"]);

// Minimum canvas dimension — projection uses (width - 100) and (height - 100)
// as the plotting span (50px margin on each side). At width=100 the span is
// zero, below that it's negative and coordinates flip. handlers.ts and cli.ts
// inputSchemas enforce 100 at the entry points; this clamp is defense in
// depth for direct pipeline.ts callers (tests, future internal users) and
// guarantees a strictly-positive plotting span.
const MIN_SPAN = 1;
const LANDMARK_LABEL_MAX = 11;
const ROAD_LABEL_MAX = 12;
const CENTER_LABEL_MAX = 12;

function safeDimension(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(
    Math.max(value ?? fallback, MIN_CANVAS_DIMENSION_PX),
    MAX_CANVAS_DIMENSION_PX,
  );
}

export function renderSVG(layout: MapLayout, opts: RenderOptions = {}): string {
  const width = safeDimension(opts.width, 600);
  const height = safeDimension(opts.height, 400);
  const spanX = Math.max(width - 100, MIN_SPAN);
  const spanY = Math.max(height - 100, MIN_SPAN);
  const { bbox, center, landmarks } = layout;
  const roads = layout.roads ?? [];

  const project = (lat: number, lon: number): [number, number] => {
    const denomLon = bbox.east - bbox.west || 1e-6;
    const denomLat = bbox.north - bbox.south || 1e-6;
    const x = ((lon - bbox.west) / denomLon) * spanX + 50;
    const y = ((bbox.north - lat) / denomLat) * spanY + 50;
    return [x, y];
  };

  const [cx, cy] = project(center.lat, center.lon);
  const displayRoads = selectDisplayRoads(roads, project, width, height);

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif">`,
  );
  lines.push(`<rect width="${width}" height="${height}" fill="#fbfaf4"/>`);

  // Paper-like frame. This replaces the map-tile grid: the design should read
  // as a diagram that happens to be spatial, not as a zoomed-out web map.
  lines.push(
    `<rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="#eee8dc" stroke-width="1"/>`,
  );

  // Road skeleton — curated to a few axes, then drawn with a white casing and
  // a warm-gray core so it looks like printed 약도 linework.
  for (const road of displayRoads) {
    const d = pathData(road, project);
    if (!d) continue;
    const style = ROAD_STYLE[road.class] ?? ROAD_STYLE.path;
    lines.push(
      `<path data-road-layer="casing" d="${d}" fill="none" stroke="#fffdf7" stroke-width="${style.width + 5}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    lines.push(
      `<path data-road-layer="core" d="${d}" fill="none" stroke="${style.color}" stroke-width="${style.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  // Road name labels — one per unique name, placed on the longest in-frame run.
  for (const [name, pos] of roadLabelPositions(displayRoads, project, width, height)) {
    const label = truncateLabel(name, ROAD_LABEL_MAX);
    const labelWidth = textBoxWidth(label, 10, 22);
    lines.push(
      `<rect x="${(pos.x - labelWidth / 2).toFixed(1)}" y="${(pos.y - 10).toFixed(1)}" width="${labelWidth}" height="17" fill="#fbfaf4" opacity="0.86"/>`,
    );
    lines.push(
      `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" text-anchor="middle" font-size="10" fill="#9e9788" font-weight="600">${escapeXml(label)}</text>`,
    );
  }

  // Connector lines (landmark -> center), drawn first so markers sit on top.
  for (const lm of landmarks) {
    const [lx, ly] = project(lm.lat, lm.lon);
    lines.push(
      `<line x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#d7cfbf" stroke-width="1.25" stroke-dasharray="4,5"/>`,
    );
  }

  // Landmarks
  for (const lm of landmarks) {
    const [lx, ly] = project(lm.lat, lm.lon);
    const marker = MARKER_STYLE[lm.category] ?? FALLBACK_MARKER;
    const label = truncateLabel(lm.name, LANDMARK_LABEL_MAX);
    const labelWidth = textBoxWidth(label, 11, 20);
    lines.push(
      `<circle cx="${lx}" cy="${ly}" r="17" fill="#fff" stroke="${marker.color}" stroke-width="2.2"/>`,
    );
    lines.push(
      `<text x="${lx}" y="${ly + 4.5}" text-anchor="middle" font-size="${marker.icon.length > 1 ? 10 : 13}" font-weight="700" fill="${marker.color}">${escapeXml(marker.icon)}</text>`,
    );
    lines.push(
      `<rect x="${(lx - labelWidth / 2).toFixed(1)}" y="${(ly + 23).toFixed(1)}" width="${labelWidth}" height="18" rx="2" fill="#fffdf8" stroke="#e3ddd0" stroke-width="0.8"/>`,
    );
    lines.push(
      `<text x="${lx}" y="${ly + 36}" text-anchor="middle" font-size="11" fill="#333" font-weight="500">${escapeXml(label)}</text>`,
    );
  }

  // Center marker (destination)
  const centerLabel = truncateLabel(center.label, CENTER_LABEL_MAX);
  const centerLabelWidth = textBoxWidth(centerLabel, 13, 24);
  const centerCallout = pickCenterCallout(
    cx,
    cy,
    centerLabelWidth,
    width,
    height,
    landmarks.map((lm) => {
      const [lx, ly] = project(lm.lat, lm.lon);
      const label = truncateLabel(lm.name, LANDMARK_LABEL_MAX);
      const labelWidth = textBoxWidth(label, 11, 20);
      return [
        { x: lx - 23, y: ly - 23, width: 46, height: 46 },
        { x: lx - labelWidth / 2, y: ly + 23, width: labelWidth, height: 18 },
      ];
    }).flat(),
  );
  lines.push(
    `<circle cx="${cx}" cy="${cy}" r="11" fill="#d63838" stroke="#fff" stroke-width="3"/>`,
  );
  lines.push(
    `<line data-destination-tail="true" x1="${centerCallout.anchorX.toFixed(1)}" y1="${centerCallout.anchorY.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#d63838" stroke-width="2.5" stroke-linecap="round"/>`,
  );
  lines.push(
    `<rect x="${centerCallout.x.toFixed(1)}" y="${centerCallout.y.toFixed(1)}" width="${centerCallout.width}" height="${centerCallout.height}" rx="3" fill="#d63838"/>`,
  );
  lines.push(
    `<text x="${(centerCallout.x + centerCallout.width / 2).toFixed(1)}" y="${(centerCallout.y + 17).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${escapeXml(centerLabel)}</text>`,
  );

  lines.push(`</svg>`);
  return lines.join("\n");
}

function pathData(
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

function selectDisplayRoads(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): MapLayout["roads"] {
  const drawable = roads.filter((road) => road.points.length >= 2);
  if (drawable.length <= MAX_ROADS_WITHOUT_FILTER) return drawable;

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
  for (const item of source) {
    if (picked.length >= MAX_VISIBLE_ROADS) break;
    if (item.road.name) {
      const count = pickedByName.get(item.road.name) ?? 0;
      if (count >= MAX_ROADS_PER_NAME) continue;
      pickedByName.set(item.road.name, count + 1);
    }
    picked.push(item.road);
  }

  return picked;
}

function clippedRoadLength(
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

function truncateLabel(label: string, maxChars: number): string {
  const trimmed = label.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= maxChars) return trimmed;
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
}

function textBoxWidth(label: string, fontSize: number, padding: number): number {
  const units = Array.from(label).reduce((sum, ch) => {
    return sum + (ch.charCodeAt(0) < 128 ? 0.58 : 1);
  }, 0);
  return Math.max(28, Math.ceil(units * fontSize + padding));
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CenterCallout extends Box {
  anchorX: number;
  anchorY: number;
}

function pickCenterCallout(
  cx: number,
  cy: number,
  labelWidth: number,
  width: number,
  height: number,
  obstacles: Box[],
): CenterCallout {
  const boxHeight = 24;
  const candidates: CenterCallout[] = [
    {
      x: cx - labelWidth / 2,
      y: cy - 48,
      width: labelWidth,
      height: boxHeight,
      anchorX: cx,
      anchorY: cy - 24,
    },
    {
      x: cx - labelWidth / 2,
      y: cy + 24,
      width: labelWidth,
      height: boxHeight,
      anchorX: cx,
      anchorY: cy + 24,
    },
    {
      x: cx - labelWidth - 28,
      y: cy - boxHeight / 2,
      width: labelWidth,
      height: boxHeight,
      anchorX: cx - 28,
      anchorY: cy,
    },
    {
      x: cx + 28,
      y: cy - boxHeight / 2,
      width: labelWidth,
      height: boxHeight,
      anchorX: cx + 28,
      anchorY: cy,
    },
  ];

  return candidates
    .map((candidate, index) => ({
      candidate,
      score: boxScore(candidate, width, height, obstacles) + index * 0.01,
    }))
    .sort((a, b) => a.score - b.score)[0].candidate;
}

function boxScore(box: Box, width: number, height: number, obstacles: Box[]): number {
  let score = 0;
  const margin = 18;
  if (box.x < margin) score += (margin - box.x) * 100;
  if (box.y < margin) score += (margin - box.y) * 100;
  if (box.x + box.width > width - margin) {
    score += (box.x + box.width - (width - margin)) * 100;
  }
  if (box.y + box.height > height - margin) {
    score += (box.y + box.height - (height - margin)) * 100;
  }

  for (const obstacle of obstacles) {
    score += overlapArea(box, obstacle) * 20;
  }
  return score;
}

function overlapArea(a: Box, b: Box): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

/**
 * Pick a single label position per unique road name.
 *
 * Overpass `out geom;` returns the *full* geometry of each way, which routinely
 * runs kilometres past the destination's bbox. The previous implementation
 * placed labels at the middle index of the longest segment, which silently
 * landed them outside the viewBox when the way extended past it (e.g. a
 * "테헤란로" label at x=-533 on a 600px frame — SVG clips strokes but not
 * text, so the label just disappeared).
 *
 * Fix: clip every segment between consecutive way nodes to the inset viewBox
 * (Liang–Barsky), keep the longest clipped sub-segment per road name, and
 * label its midpoint. Roads whose entire geometry projects outside the frame
 * produce no label — but the strokes still draw and SVG clips them. Node-only
 * filtering (the earlier attempt at this fix) was too coarse: a way like
 * Teheran-ro can pass straight through the bbox while none of its OSM nodes
 * happen to fall inside, and that approach dropped the label entirely.
 */
const LABEL_INSET_PX = 30;

/**
 * Liang–Barsky line-segment clipping against the rectangle [minX,minY,maxX,maxY].
 * Returns the clipped endpoints, or null if the segment misses the rectangle.
 */
function clipSegment(
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

function roadLabelPositions(
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

    if (!bestMid) continue; // entire road off-frame — no legible label site

    const prev = best.get(road.name);
    if (prev && prev.len >= bestLen) continue;
    best.set(road.name, { x: bestMid[0], y: bestMid[1], len: bestLen });
  }

  const out = new Map<string, { x: number; y: number }>();
  for (const [name, { x, y }] of best) out.set(name, { x, y });
  return out;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
