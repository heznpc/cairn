import type { MapLayout, RenderLayoutMode, RenderPreset } from "../types.js";
import { landmarkIcon, markerStyle } from "./icons.js";
import {
  pickCenterCallout,
  placeLandmarkLabels,
  type ProjectedLandmark,
} from "./label-layout.js";
import {
  roadObstacleBoxes,
  roadPathData,
  roadStyle,
  selectDisplayRoads,
  selectGeographicRoads,
  roadLabelPositions,
} from "./road-layout.js";
import {
  APPROACH_RANK,
  DESTINATION,
  INK,
  PAPER,
  PAPER_EDGE,
  type PresetSpec,
} from "./theme.js";
import {
  type Box,
  destinationLabel,
  labelText,
  textBoxWidth,
  truncateLabel,
  wrapLandmarkLabel,
} from "./text.js";
import type { Projector } from "./projection.js";

const ROAD_LABEL_MAX = 12;
const CENTER_LABEL_MAX = 12;

export interface StandardMapRenderContext {
  width: number;
  height: number;
  presetName: RenderPreset;
  preset: PresetSpec;
  renderLayout: RenderLayoutMode;
  project: Projector;
  center: { x: number; y: number };
}

export function renderStandardMapSVG(
  layout: MapLayout,
  ctx: StandardMapRenderContext,
): string {
  const {
    width,
    height,
    presetName,
    preset,
    renderLayout,
    project,
    center: { x: cx, y: cy },
  } = ctx;
  const roads = layout.roads ?? [];

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
  const centerLabel = truncateLabel(layout.center.label, CENTER_LABEL_MAX);
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

function chooseApproachLandmark(
  landmarks: MapLayout["landmarks"],
  cx: number,
  cy: number,
  project: Projector,
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
