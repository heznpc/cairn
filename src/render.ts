import type { LandmarkCategory, MapLayout, RenderOptions, RoadClass } from "./types.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";

const MARKER_STYLE: Record<LandmarkCategory, { color: string }> = {
  station: { color: "#3f6ea8" },
  station_exit: { color: "#2f7c72" },
  bus_stop: { color: "#4b7f89" },
  cafe: { color: "#8a7159" },
  convenience: { color: "#5b7c48" },
  restaurant: { color: "#9a6a41" },
  school: { color: "#6e6ea8" },
  hospital: { color: "#9f4b4b" },
  park: { color: "#5d8a5a" },
  landmark: { color: "#8a6e3f" },
  building: { color: "#666" },
};

const FALLBACK_MARKER = { color: "#666" };

const ROAD_RANK: Record<RoadClass, number> = {
  primary: 5,
  secondary: 4,
  tertiary: 3,
  residential: 2,
  path: 1,
};

const APPROACH_RANK: Record<LandmarkCategory, number> = {
  station_exit: 10,
  station: 9,
  bus_stop: 7,
  landmark: 5,
  hospital: 4,
  school: 4,
  park: 3,
  convenience: 3,
  cafe: 2,
  restaurant: 2,
  building: 1,
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
  const renderLayout = opts.layout ?? "diagram";

  const project = (lat: number, lon: number): [number, number] => {
    const denomLon = bbox.east - bbox.west || 1e-6;
    const denomLat = bbox.north - bbox.south || 1e-6;
    const x = ((lon - bbox.west) / denomLon) * spanX + 50;
    const y = ((bbox.north - lat) / denomLat) * spanY + 50;
    return [x, y];
  };

  const [cx, cy] = project(center.lat, center.lon);
  const displayRoads =
    renderLayout === "geographic"
      ? roads.filter((road) => road.points.length >= 2)
      : selectDisplayRoads(roads, project, width, height);
  const approach =
    renderLayout === "diagram"
      ? chooseApproachLandmark(landmarks, cx, cy, project)
      : null;
  const projectedLandmarks = landmarks.map((lm) => {
    const [x, y] = project(lm.lat, lm.lon);
    const label = truncateLabel(lm.name, LANDMARK_LABEL_MAX);
    return {
      lm,
      x,
      y,
      label,
      labelWidth: textBoxWidth(label, 11, 20),
    };
  });
  const landmarkMarkerBoxes = projectedLandmarks.map(({ x, y }) => ({
    x: x - 23,
    y: y - 23,
    width: 46,
    height: 46,
  }));
  const landmarkLabelBoxes = placeLandmarkLabels(projectedLandmarks, width, height, [
    ...landmarkMarkerBoxes,
    { x: cx - 18, y: cy - 18, width: 36, height: 36 },
  ]);
  const centerLabel = truncateLabel(center.label, CENTER_LABEL_MAX);
  const centerLabelWidth = textBoxWidth(centerLabel, 13, 24);
  const centerCallout = pickCenterCallout(
    cx,
    cy,
    centerLabelWidth,
    width,
    height,
    [...landmarkMarkerBoxes, ...landmarkLabelBoxes],
  );

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif">`,
  );
  lines.push(
    `<defs><marker id="cairn-approach-arrowhead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 Z" fill="#d94b35"/></marker></defs>`,
  );
  lines.push(`<metadata>Map data © OpenStreetMap contributors, ODbL.</metadata>`);
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
  for (const { x: lx, y: ly } of projectedLandmarks) {
    lines.push(
      `<line x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#d7cfbf" stroke-width="1.25" stroke-dasharray="4,5"/>`,
    );
  }

  if (approach) {
    const segment = trimSegment(approach.x, approach.y, cx, cy, 27, 21);
    if (segment) {
      lines.push(
        `<path data-approach-arrow="casing" d="M${segment.x1.toFixed(1)},${segment.y1.toFixed(1)} L${segment.x2.toFixed(1)},${segment.y2.toFixed(1)}" fill="none" stroke="#fffdf7" stroke-width="11" stroke-linecap="round"/>`,
      );
      lines.push(
        `<path data-approach-arrow="core" d="M${segment.x1.toFixed(1)},${segment.y1.toFixed(1)} L${segment.x2.toFixed(1)},${segment.y2.toFixed(1)}" fill="none" stroke="#d94b35" stroke-width="5" stroke-linecap="round" marker-end="url(#cairn-approach-arrowhead)"/>`,
      );
    }
  }

  // Landmarks
  for (const [index, item] of projectedLandmarks.entries()) {
    const { lm, x: lx, y: ly, label } = item;
    const marker = MARKER_STYLE[lm.category] ?? FALLBACK_MARKER;
    const labelBox = landmarkLabelBoxes[index];
    lines.push(
      `<circle cx="${lx}" cy="${ly}" r="17" fill="#fff" stroke="${marker.color}" stroke-width="2.2"/>`,
    );
    lines.push(landmarkIcon(lm.category, lx, ly, marker.color));
    lines.push(
      `<rect x="${labelBox.x.toFixed(1)}" y="${labelBox.y.toFixed(1)}" width="${labelBox.width}" height="${labelBox.height}" rx="2" fill="#fffdf8" stroke="#e3ddd0" stroke-width="0.8"/>`,
    );
    lines.push(
      `<text x="${(labelBox.x + labelBox.width / 2).toFixed(1)}" y="${(labelBox.y + 13).toFixed(1)}" text-anchor="middle" font-size="11" fill="#333" font-weight="500">${escapeXml(label)}</text>`,
    );
  }

  // Center marker (destination)
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
  lines.push(
    `<text data-attribution="osm" x="${(width - 18).toFixed(1)}" y="${(height - 8).toFixed(1)}" text-anchor="end" font-size="8" fill="#aaa396">© OpenStreetMap contributors</text>`,
  );

  lines.push(`</svg>`);
  return lines.join("\n");
}

function landmarkIcon(category: LandmarkCategory, x: number, y: number, color: string): string {
  const p = (n: number) => n.toFixed(1);
  const common = `data-landmark-icon="${category}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (category) {
    case "station":
      return `<g ${common} stroke-width="1.7"><rect x="${p(x - 7)}" y="${p(y - 8)}" width="14" height="12" rx="2.5"/><path d="M${p(x - 4)},${p(y - 3)} H${p(x + 4)}"/><path d="M${p(x - 4)},${p(y + 7)} L${p(x - 7)},${p(y + 10)} M${p(x + 4)},${p(y + 7)} L${p(x + 7)},${p(y + 10)}"/></g>`;
    case "station_exit":
      return `<g ${common} stroke-width="2"><path d="M${p(x - 8)},${p(y)} H${p(x + 5)}"/><path d="M${p(x + 1)},${p(y - 5)} L${p(x + 7)},${p(y)} L${p(x + 1)},${p(y + 5)}"/><path d="M${p(x - 8)},${p(y - 8)} V${p(y + 8)}"/></g>`;
    case "bus_stop":
      return `<g ${common} stroke-width="1.7"><rect x="${p(x - 8)}" y="${p(y - 7)}" width="16" height="11" rx="2"/><path d="M${p(x - 5)},${p(y - 1)} H${p(x + 5)} M${p(x - 5)},${p(y + 7)} H${p(x - 3)} M${p(x + 3)},${p(y + 7)} H${p(x + 5)}"/></g>`;
    case "cafe":
      return `<g ${common} stroke-width="1.8"><path d="M${p(x - 7)},${p(y - 3)} H${p(x + 4)} V${p(y + 4)} Q${p(x + 4)},${p(y + 8)} ${p(x - 2)},${p(y + 8)} Q${p(x - 8)},${p(y + 8)} ${p(x - 8)},${p(y + 4)} V${p(y - 3)}"/><path d="M${p(x + 4)},${p(y - 1)} H${p(x + 8)} Q${p(x + 10)},${p(y - 1)} ${p(x + 10)},${p(y + 2)} Q${p(x + 10)},${p(y + 5)} ${p(x + 5)},${p(y + 5)}"/></g>`;
    case "convenience":
      return `<g ${common} stroke-width="1.7"><path d="M${p(x - 7)},${p(y - 1)} L${p(x - 5)},${p(y + 8)} H${p(x + 6)} L${p(x + 8)},${p(y - 1)} Z"/><path d="M${p(x - 4)},${p(y - 1)} Q${p(x)},${p(y - 9)} ${p(x + 4)},${p(y - 1)}"/></g>`;
    case "restaurant":
      return `<g ${common} stroke-width="1.8"><path d="M${p(x - 5)},${p(y - 8)} V${p(y + 8)} M${p(x - 8)},${p(y - 8)} V${p(y - 2)} Q${p(x - 8)},${p(y + 1)} ${p(x - 5)},${p(y + 1)} Q${p(x - 2)},${p(y + 1)} ${p(x - 2)},${p(y - 2)} V${p(y - 8)}"/><path d="M${p(x + 6)},${p(y - 8)} Q${p(x + 2)},${p(y - 3)} ${p(x + 6)},${p(y + 1)} V${p(y + 8)}"/></g>`;
    case "school":
      return `<g ${common} stroke-width="1.7"><path d="M${p(x - 9)},${p(y - 2)} L${p(x)},${p(y - 8)} L${p(x + 9)},${p(y - 2)}"/><path d="M${p(x - 6)},${p(y - 1)} V${p(y + 8)} H${p(x + 6)} V${p(y - 1)}"/></g>`;
    case "hospital":
      return `<g data-landmark-icon="${category}" fill="${color}"><rect x="${p(x - 3)}" y="${p(y - 10)}" width="6" height="20" rx="1"/><rect x="${p(x - 10)}" y="${p(y - 3)}" width="20" height="6" rx="1"/></g>`;
    case "park":
      return `<g ${common} stroke-width="1.8"><path d="M${p(x)},${p(y + 8)} V${p(y - 3)}"/><path d="M${p(x - 8)},${p(y - 1)} Q${p(x)},${p(y - 10)} ${p(x + 8)},${p(y - 1)} Q${p(x + 4)},${p(y + 4)} ${p(x)},${p(y + 1)} Q${p(x - 4)},${p(y + 4)} ${p(x - 8)},${p(y - 1)}"/></g>`;
    case "landmark":
      return `<g ${common} stroke-width="1.7"><path d="M${p(x)},${p(y - 9)} L${p(x + 3)},${p(y - 2)} L${p(x + 10)},${p(y - 2)} L${p(x + 4)},${p(y + 2)} L${p(x + 6)},${p(y + 9)} L${p(x)},${p(y + 5)} L${p(x - 6)},${p(y + 9)} L${p(x - 4)},${p(y + 2)} L${p(x - 10)},${p(y - 2)} L${p(x - 3)},${p(y - 2)} Z"/></g>`;
    case "building":
      return `<g ${common} stroke-width="1.6"><rect x="${p(x - 7)}" y="${p(y - 9)}" width="14" height="18" rx="1.5"/><path d="M${p(x - 3)},${p(y - 4)} H${p(x - 1)} M${p(x + 3)},${p(y - 4)} H${p(x + 5)} M${p(x - 3)},${p(y + 1)} H${p(x - 1)} M${p(x + 3)},${p(y + 1)} H${p(x + 5)} M${p(x)},${p(y + 9)} V${p(y + 4)}"/></g>`;
  }
}

interface ProjectedLandmark {
  lm: MapLayout["landmarks"][number];
  x: number;
  y: number;
  label: string;
  labelWidth: number;
}

function placeLandmarkLabels(
  landmarks: ProjectedLandmark[],
  width: number,
  height: number,
  baseObstacles: Box[],
): Box[] {
  const placed: Box[] = [];
  for (const lm of landmarks) {
    const boxHeight = 18;
    const candidates: Box[] = [
      {
        x: lm.x - lm.labelWidth / 2,
        y: lm.y + 23,
        width: lm.labelWidth,
        height: boxHeight,
      },
      {
        x: lm.x - lm.labelWidth / 2,
        y: lm.y - 41,
        width: lm.labelWidth,
        height: boxHeight,
      },
      {
        x: lm.x + 24,
        y: lm.y - boxHeight / 2,
        width: lm.labelWidth,
        height: boxHeight,
      },
      {
        x: lm.x - lm.labelWidth - 24,
        y: lm.y - boxHeight / 2,
        width: lm.labelWidth,
        height: boxHeight,
      },
    ];

    const obstacles = [...baseObstacles, ...placed];
    const best = candidates
      .map((candidate, index) => ({
        candidate,
        score: boxScore(candidate, width, height, obstacles) + index * 0.01,
      }))
      .sort((a, b) => a.score - b.score)[0].candidate;
    placed.push(best);
  }
  return placed;
}

function chooseApproachLandmark(
  landmarks: MapLayout["landmarks"],
  cx: number,
  cy: number,
  project: (lat: number, lon: number) => [number, number],
): { x: number; y: number } | null {
  let best: { x: number; y: number; score: number } | null = null;
  for (const lm of landmarks) {
    const [x, y] = project(lm.lat, lm.lon);
    const distance = Math.hypot(x - cx, y - cy);
    if (distance < 48) continue;
    const score = APPROACH_RANK[lm.category] * 1000 + Math.min(distance, 260);
    if (!best || score > best.score) best = { x, y, score };
  }
  return best ? { x: best.x, y: best.y } : null;
}

function trimSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  startTrim: number,
  endTrim: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length <= startTrim + endTrim + 8) return null;
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  return {
    x1: x1 + ux * startTrim,
    y1: y1 + uy * startTrim,
    x2: x2 - ux * endTrim,
    y2: y2 - uy * endTrim,
  };
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
