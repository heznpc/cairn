import type { MapLayout, RenderOptions } from "./types.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";
import { landmarkIcon, markerStyle } from "./render/icons.js";
import {
  roadObstacleBoxes,
  roadPathData,
  roadStyle,
  selectDisplayRoads,
  selectGeographicRoads,
  roadLabelPositions,
} from "./render/road-layout.js";
import { renderBadgeSVG, renderRouteStripSVG } from "./render/templates.js";
import {
  APPROACH_RANK,
  DESTINATION,
  INK,
  PAPER,
  PAPER_EDGE,
  PRESETS,
  type PresetSpec,
} from "./render/theme.js";
import {
  boxScore,
  type Box,
  type CenterCallout,
  destinationLabel,
  labelText,
  textBoxWidth,
  truncateLabel,
  wrapLandmarkLabel,
} from "./render/text.js";

// Minimum canvas dimension — projection uses (width - 100) and (height - 100)
// as the plotting span (50px margin on each side). At width=100 the span is
// zero, below that it's negative and coordinates flip. handlers.ts and cli.ts
// inputSchemas enforce 100 at the entry points; this clamp is defense in
// depth for direct pipeline.ts callers (tests, future internal users) and
// guarantees a strictly-positive plotting span.
const MIN_SPAN = 1;
const ROAD_LABEL_MAX = 12;
const CENTER_LABEL_MAX = 12;

function safeDimension(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(
    Math.max(value ?? fallback, MIN_CANVAS_DIMENSION_PX),
    MAX_CANVAS_DIMENSION_PX,
  );
}

// Distortion factor for the destination fisheye. Higher = stronger magnification
// of the focus area. Kept gentle so the map still reads as spatial, not warped.
const FOCUS_STRENGTH = 1.2;

// Sarkar–Brown graphical fisheye around a focus point (px space). Magnifies
// near the focus and compresses the periphery; the focus itself is a fixed
// point, the mapping is monotonic in radius, and warped points stay within
// `radius` of the focus (bounded). Pure and deterministic — unit-testable via
// the exported renderSVG behaviour.
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

export function renderSVG(layout: MapLayout, opts: RenderOptions = {}): string {
  const width = safeDimension(opts.width, 600);
  const height = safeDimension(opts.height, 400);
  const presetName = opts.preset ?? "standard";
  const preset = PRESETS[presetName];
  const spanX = Math.max(width - 100, MIN_SPAN);
  const spanY = Math.max(height - 100, MIN_SPAN);
  const { bbox, center } = layout;
  const roads = layout.roads ?? [];
  const renderLayout = opts.layout ?? "diagram";

  const baseProject = (lat: number, lon: number): [number, number] => {
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
  if (renderLayout === "diagram" && presetName === "minimal") {
    return renderRouteStripSVG(layout, width, height, presetName);
  }
  if (renderLayout === "diagram" && presetName === "badge") {
    return renderBadgeSVG(layout, width, height, presetName);
  }

  const displayRoads =
    renderLayout === "geographic"
      ? selectGeographicRoads(roads, project, width, height)
      : selectDisplayRoads(roads, project, width, height, { x: cx, y: cy }, preset.maxVisibleRoads);
  const skeletonRoads = preset.showRoadSkeleton ? displayRoads : [];
  const approach =
    renderLayout === "diagram"
      ? chooseApproachLandmark(layout.landmarks, cx, cy, project)
      : null;
  const landmarks = selectPresetLandmarks(layout.landmarks, preset);
  const projectedLandmarks: ProjectedLandmark[] = landmarks.map((lm) => {
    const [x, y] = project(lm.lat, lm.lon);
    const labelLines = wrapLandmarkLabel(lm.name, preset.landmarkLabelMax);
    const labelWidth = Math.max(...labelLines.map((line) => textBoxWidth(line, 11, 20)));
    return {
      lm,
      x,
      y,
      labelLines,
      labelWidth,
      labelHeight: labelLines.length * 15 + 3,
      labelHidden: lm.importance < preset.labelImportanceMin,
    };
  });
  const landmarkMarkerBoxes = projectedLandmarks.map(({ x, y }) => ({
    x: x - 23,
    y: y - 23,
    width: 46,
    height: 46,
  }));
  const roadObstacles =
    renderLayout === "diagram" && preset.avoidRoadLabels
      ? roadObstacleBoxes(skeletonRoads, project, width, height)
      : [];
  // Road-name labels are drawn later, but reserve their boxes now so landmark
  // and destination labels don't stack on top of them (text-on-text is the
  // worst legibility offender). Computed once and reused for drawing.
  const roadLabelEntries: Array<[string, { x: number; y: number }]> = preset.showRoadLabels
    ? [...roadLabelPositions(skeletonRoads, project, width, height)]
    : [];
  const roadLabelObstacles: Box[] = roadLabelEntries.map(([name, pos]) => {
    const w = textBoxWidth(truncateLabel(name, ROAD_LABEL_MAX), 10, 14);
    return { x: pos.x - w / 2, y: pos.y - 9, width: w, height: 16 };
  });
  const landmarkLabelBoxes = placeLandmarkLabels(
    projectedLandmarks,
    width,
    height,
    [
      ...landmarkMarkerBoxes,
      ...roadObstacles,
      ...roadLabelObstacles,
      { x: cx - 18, y: cy - 18, width: 36, height: 36 },
    ],
    preset.hideClutteredLabels,
  );
  const centerLabel = truncateLabel(center.label, CENTER_LABEL_MAX);
  const centerLabelWidth = textBoxWidth(centerLabel, 13, 24);
  const centerCallout = pickCenterCallout(
    cx,
    cy,
    centerLabelWidth,
    width,
    height,
    [...landmarkMarkerBoxes, ...landmarkLabelBoxes, ...roadObstacles, ...roadLabelObstacles],
  );

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-preset="${presetName}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif">`,
  );
  lines.push(
    `<defs><marker id="cairn-approach-arrowhead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 Z" fill="${DESTINATION}"/></marker></defs>`,
  );
  lines.push(`<metadata>Map data © OpenStreetMap contributors, ODbL.</metadata>`);
  lines.push(`<rect width="${width}" height="${height}" fill="${PAPER}"/>`);

  // Paper-like frame. This replaces the map-tile grid: the design should read
  // as a diagram that happens to be spatial, not as a zoomed-out web map.
  if (preset.showFrame) {
    lines.push(
      `<rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="${PAPER_EDGE}" stroke-width="1"/>`,
    );
  }

  // Road skeleton — curated to a few axes, then drawn with a white casing and
  // a warm-gray core so it looks like printed 약도 linework.
  for (const road of skeletonRoads) {
    const d = roadPathData(road, project, renderLayout, width, height, preset.roadGeometry);
    if (!d) continue;
    const style = roadStyle(road.class, preset);
    lines.push(
      `<path data-road-layer="casing" d="${d}" data-road-geometry="${preset.roadGeometry}" fill="none" stroke="${PAPER}" stroke-width="${style.width + 5 * preset.roadScale}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    lines.push(
      `<path data-road-layer="core" d="${d}" data-road-geometry="${preset.roadGeometry}" fill="none" stroke="${style.color}" stroke-width="${style.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  // Road name labels — one per unique name, placed on the longest in-frame run.
  // Entries were computed above (and reserved as label obstacles).
  for (const [name, pos] of roadLabelEntries) {
    const label = truncateLabel(name, ROAD_LABEL_MAX);
    lines.push(labelText(label, pos.x, pos.y, 10, "#8a857c", 600));
  }

  if (approach) {
    const segment = trimSegment(
      approach.x,
      approach.y,
      cx,
      cy,
      preset.approachStartTrim,
      preset.approachEndTrim,
    );
    if (segment) {
      lines.push(
        `<path data-approach-arrow="casing" d="M${segment.x1.toFixed(1)},${segment.y1.toFixed(1)} L${segment.x2.toFixed(1)},${segment.y2.toFixed(1)}" fill="none" stroke="${PAPER}" stroke-width="${preset.approachCasingWidth}" stroke-linecap="round"/>`,
      );
      lines.push(
        `<path data-approach-arrow="core" d="M${segment.x1.toFixed(1)},${segment.y1.toFixed(1)} L${segment.x2.toFixed(1)},${segment.y2.toFixed(1)}" fill="none" stroke="${DESTINATION}" stroke-width="${preset.approachWidth}" stroke-linecap="round" marker-end="url(#cairn-approach-arrowhead)"/>`,
      );
    }
  }

  // Landmarks
  for (const [index, item] of projectedLandmarks.entries()) {
    const { lm, x: lx, y: ly, labelLines } = item;
    const marker = markerStyle(lm.category);
    const labelBox = landmarkLabelBoxes[index];
    lines.push(
      `<circle cx="${lx}" cy="${ly}" r="17" fill="${PAPER}" stroke="${marker.color}" stroke-width="${marker.emphasis ? 2 : 1.25}"/>`,
    );
    lines.push(landmarkIcon(lm.category, lx, ly, marker.color));
    if (!labelBox.hidden) {
      lines.push(labelText(labelLines, labelBox.x + labelBox.width / 2, labelBox.y + 13, 11, INK, 500));
    }
  }

  // Center marker (destination) — the focal point. Solid saturated red, larger
  // than the hollow landmark markers and ringed in paper so it reads as "here"
  // at a glance rather than competing with the surrounding POIs.
  lines.push(
    `<circle cx="${cx}" cy="${cy}" r="13" fill="${DESTINATION}" stroke="${PAPER}" stroke-width="3.5"/>`,
  );
  lines.push(
    `<line data-destination-tail="true" x1="${centerCallout.anchorX.toFixed(1)}" y1="${centerCallout.anchorY.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${DESTINATION}" stroke-width="${preset.destinationTailWidth}" stroke-linecap="round"/>`,
  );
  lines.push(destinationLabel(centerLabel, centerCallout, preset));
  lines.push(
    `<text data-attribution="osm" x="${(width - 18).toFixed(1)}" y="${(height - 8).toFixed(1)}" text-anchor="end" font-size="8" fill="#aaa59d">© OpenStreetMap contributors</text>`,
  );

  lines.push(`</svg>`);
  return lines.join("\n");
}

function selectPresetLandmarks(
  landmarks: MapLayout["landmarks"],
  preset: PresetSpec,
): MapLayout["landmarks"] {
  const preferred = preset.preferredCategories
    ? landmarks.filter((lm) => preset.preferredCategories!.has(lm.category))
    : [];
  const filtered = preferred.length > 0 ? preferred : landmarks;
  return filtered.slice(0, preset.maxLandmarks);
}

interface ProjectedLandmark {
  lm: MapLayout["landmarks"][number];
  x: number;
  y: number;
  labelLines: string[];
  labelWidth: number;
  labelHeight: number;
  labelHidden: boolean;
}

interface LabelBox extends Box {
  hidden?: boolean;
}

function placeLandmarkLabels(
  landmarks: ProjectedLandmark[],
  width: number,
  height: number,
  baseObstacles: Box[],
  hideClutteredLabels: boolean,
): LabelBox[] {
  const placed: LabelBox[] = [];
  for (const lm of landmarks) {
    if (lm.labelHidden) {
      placed.push({ x: lm.x, y: lm.y, width: 0, height: 0, hidden: true });
      continue;
    }
    const boxHeight = lm.labelHeight;
    // Candidate anchor positions: below, above, right, left, then two diagonal
    // "escapes" for crowded intersections where only a corner is open. Every
    // candidate shares the same width/height, so apply them once via map.
    const positions: Array<{ x: number; y: number }> = [
      { x: lm.x - lm.labelWidth / 2, y: lm.y + 23 },
      { x: lm.x - lm.labelWidth / 2, y: lm.y - 23 - boxHeight },
      { x: lm.x + 24, y: lm.y - boxHeight / 2 },
      { x: lm.x - lm.labelWidth - 24, y: lm.y - boxHeight / 2 },
      { x: lm.x + 22, y: lm.y + 20 },
      { x: lm.x - lm.labelWidth - 22, y: lm.y + 20 },
    ];
    const candidates: Box[] = positions.map((pos) => ({
      ...pos,
      width: lm.labelWidth,
      height: boxHeight,
    }));

    const obstacles = [...baseObstacles, ...placed];
    const best = candidates
      .map((candidate, index) => ({
        candidate,
        score: boxScore(candidate, width, height, obstacles) + index * 0.01,
      }))
      .sort((a, b) => a.score - b.score)[0];
    if (hideClutteredLabels && best.score > 1200 && lm.lm.importance < 0.85) {
      placed.push({ x: lm.x, y: lm.y, width: 0, height: 0, hidden: true });
      continue;
    }
    placed.push(best.candidate);
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
