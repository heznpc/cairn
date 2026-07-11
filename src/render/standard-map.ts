import type {
  MapLayout,
  NormalizedPosition,
  RenderLayoutMode,
  RenderTemplate,
  RenderTheme,
} from "../types.js";
import { landmarkIcon, markerStyle } from "./icons.js";
import {
  pickCenterCallout,
  placeLandmarkLabels,
  type ProjectedLandmark,
} from "./label-layout.js";
import {
  markerLeaderSegment,
  placeLandmarkMarkers,
  roadMarkerCorridors,
} from "./marker-layout.js";
import {
  roadObstacleBoxes,
  roadPathData,
  roadStyle,
  selectDisplayRoads,
  selectGeographicRoads,
  roadLabelPositions,
} from "./road-layout.js";
import { APPROACH_RANK, type TemplateSpec, type ThemeSpec } from "./theme.js";
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
  templateName: RenderTemplate;
  template: TemplateSpec;
  themeName: RenderTheme;
  theme: ThemeSpec;
  renderLayout: RenderLayoutMode;
  project: Projector;
  center: { x: number; y: number };
  landmarkPositions?: Record<string, NormalizedPosition>;
}

export function renderStandardMapSVG(
  layout: MapLayout,
  ctx: StandardMapRenderContext,
): string {
  const {
    width,
    height,
    templateName,
    template,
    themeName,
    theme,
    renderLayout,
    project,
    center: { x: cx, y: cy },
    landmarkPositions,
  } = ctx;
  const roads = layout.roads ?? [];

  const displayRoads =
    renderLayout === "geographic"
      ? selectGeographicRoads(roads, project, width, height)
      : selectDisplayRoads(roads, project, width, height, { x: cx, y: cy }, template.maxVisibleRoads);
  const skeletonRoads = template.showRoadSkeleton ? displayRoads : [];
  const landmarks = selectTemplateLandmarks(layout.landmarks, template);
  const rawProjectedLandmarks = landmarks.map((lm) => {
    const [anchorX, anchorY] = project(lm.lat, lm.lon);
    const labelLines = wrapLandmarkLabel(lm.name, template.landmarkLabelMax);
    const labelWidth = Math.max(...labelLines.map((line) => textBoxWidth(line, 11, 20)));
    const manualPosition = landmarkPositions?.[lm.id];
    return {
      lm,
      anchorX,
      anchorY,
      fixed: manualPosition
        ? {
            x: clamp01(manualPosition.x) * width,
            y: clamp01(manualPosition.y) * height,
          }
        : undefined,
      labelLines,
      labelWidth,
      labelHeight: labelLines.length * 15 + 3,
      labelHidden: lm.importance < template.labelImportanceMin,
    };
  });
  // Road-name labels are drawn later, but reserve their boxes now so landmark
  // markers, landmark labels, and destination labels don't stack on them.
  const roadLabelEntries: Array<[string, { x: number; y: number }]> = template.showRoadLabels
    ? [...roadLabelPositions(skeletonRoads, project, width, height)]
    : [];
  const roadLabelObstacles: Box[] = roadLabelEntries.map(([name, pos]) => {
    const w = textBoxWidth(truncateLabel(name, ROAD_LABEL_MAX), 10, 14);
    return { x: pos.x - w / 2, y: pos.y - 9, width: w, height: 16 };
  });
  const roadCorridors = roadMarkerCorridors(
    skeletonRoads,
    project,
    renderLayout,
    width,
    height,
    template,
    theme,
  );
  const markerPositions = placeLandmarkMarkers(
    rawProjectedLandmarks.map(({ lm, anchorX, anchorY, fixed }) => ({
      anchorX,
      anchorY,
      importance: lm.importance,
      fixed,
    })),
    roadCorridors,
    {
      width,
      height,
      destination: { x: cx, y: cy },
      obstacles: roadLabelObstacles,
    },
  );
  const projectedLandmarks: ProjectedLandmark[] = rawProjectedLandmarks.flatMap(
    (landmark, index) => {
      const position = markerPositions[index];
      return position
        ? [{
            ...landmark,
            x: position.x,
            y: position.y,
            displaced: position.displaced,
          }]
        : [];
    },
  );
  const approach =
    renderLayout === "diagram"
      ? chooseApproachLandmark(projectedLandmarks, cx, cy)
      : null;
  const landmarkMarkerBoxes = projectedLandmarks.map(({ x, y }) => ({
    x: x - 23,
    y: y - 23,
    width: 46,
    height: 46,
  }));
  const roadObstacles =
    renderLayout === "diagram" && template.avoidRoadLabels
      ? roadObstacleBoxes(skeletonRoads, project, width, height)
      : [];
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
    template.hideClutteredLabels,
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
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-preset="${templateName}" data-template="${templateName}" data-theme="${themeName}" font-family="${theme.fontFamily}">`,
  );
  lines.push(
    `<defs><marker id="cairn-approach-arrowhead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 Z" fill="${theme.destination}"/></marker></defs>`,
  );
  lines.push(`<metadata>Map data © OpenStreetMap contributors, ODbL.</metadata>`);
  lines.push(`<rect width="${width}" height="${height}" fill="${theme.background}"/>`);

  // Paper-like frame. This replaces the map-tile grid: the design should read
  // as a diagram that happens to be spatial, not as a zoomed-out web map.
  if (template.showFrame) {
    lines.push(
      `<rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="${theme.frame}" stroke-width="1"/>`,
    );
  }

  // Leaders preserve the landmark's true anchor after its glyph moves out of a
  // road corridor. Draw them below roads so they can never break a route line.
  for (const [index, item] of projectedLandmarks.entries()) {
    const leader = markerLeaderSegment({
      anchorX: item.anchorX,
      anchorY: item.anchorY,
      x: item.x,
      y: item.y,
      importance: item.lm.importance,
      displaced: item.displaced,
    });
    if (!leader) continue;
    const marker = markerStyle(item.lm.category, theme);
    lines.push(
      `<line data-landmark-leader="${index}" x1="${leader.start.x.toFixed(1)}" y1="${leader.start.y.toFixed(1)}" x2="${leader.end.x.toFixed(1)}" y2="${leader.end.y.toFixed(1)}" stroke="${marker.color}" stroke-width="1.25" stroke-linecap="round"/>`,
    );
  }

  // Road skeleton — curated to a few axes, then drawn with a white casing and
  // a warm-gray core so it looks like printed 약도 linework.
  for (const road of skeletonRoads) {
    const d = roadPathData(road, project, renderLayout, width, height, template.roadGeometry);
    if (!d) continue;
    const style = roadStyle(road.class, template, theme);
    lines.push(
      `<path data-road-layer="casing" d="${d}" data-road-geometry="${template.roadGeometry}" fill="none" stroke="${theme.background}" stroke-width="${style.width + 5 * template.roadScale}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    lines.push(
      `<path data-road-layer="core" d="${d}" data-road-geometry="${template.roadGeometry}" fill="none" stroke="${style.color}" stroke-width="${style.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  // Road name labels — one per unique name, placed on the longest in-frame run.
  // Entries were computed above (and reserved as label obstacles).
  for (const [name, pos] of roadLabelEntries) {
    const label = truncateLabel(name, ROAD_LABEL_MAX);
    lines.push(labelText(label, pos.x, pos.y, 10, theme.roadLabel, 600, theme.background));
  }

  if (approach) {
    const segment = trimSegment(
      approach.x,
      approach.y,
      cx,
      cy,
      template.approachStartTrim,
      template.approachEndTrim,
    );
    if (segment) {
      lines.push(
        `<path data-approach-arrow="casing" d="M${segment.x1.toFixed(1)},${segment.y1.toFixed(1)} L${segment.x2.toFixed(1)},${segment.y2.toFixed(1)}" fill="none" stroke="${theme.background}" stroke-width="${template.approachCasingWidth}" stroke-linecap="round"/>`,
      );
      lines.push(
        `<path data-approach-arrow="core" d="M${segment.x1.toFixed(1)},${segment.y1.toFixed(1)} L${segment.x2.toFixed(1)},${segment.y2.toFixed(1)}" fill="none" stroke="${theme.destination}" stroke-width="${template.approachWidth}" stroke-linecap="round" marker-end="url(#cairn-approach-arrowhead)"/>`,
      );
    }
  }

  // Landmarks
  for (const [index, item] of projectedLandmarks.entries()) {
    const { lm, anchorX, anchorY, x: lx, y: ly, labelLines } = item;
    const marker = markerStyle(lm.category, theme);
    const labelBox = landmarkLabelBoxes[index];
    lines.push(
      `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="17" data-landmark-marker="${index}" data-anchor-x="${anchorX.toFixed(1)}" data-anchor-y="${anchorY.toFixed(1)}" data-displaced="${item.displaced}" fill="${theme.background}" stroke="${marker.color}" stroke-width="${marker.emphasis ? 2 : 1.25}"/>`,
    );
    lines.push(landmarkIcon(lm.category, lx, ly, marker.color));
    if (!labelBox.hidden) {
      lines.push(labelText(labelLines, labelBox.x + labelBox.width / 2, labelBox.y + 13, 11, theme.ink, 500, theme.background));
    }
  }

  // Center marker (destination) — the focal point. Solid saturated red, larger
  // than the hollow landmark markers and ringed in paper so it reads as "here"
  // at a glance rather than competing with the surrounding POIs.
  lines.push(
    `<circle cx="${cx}" cy="${cy}" r="13" fill="${theme.destination}" stroke="${theme.background}" stroke-width="3.5"/>`,
  );
  lines.push(
    `<line data-destination-tail="true" x1="${centerCallout.anchorX.toFixed(1)}" y1="${centerCallout.anchorY.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${theme.destination}" stroke-width="${template.destinationTailWidth}" stroke-linecap="round"/>`,
  );
  lines.push(destinationLabel(centerLabel, centerCallout, template, theme));
  lines.push(
    `<text data-attribution="osm" x="${(width - 18).toFixed(1)}" y="${(height - 8).toFixed(1)}" text-anchor="end" font-size="8" fill="${theme.attribution}">© OpenStreetMap contributors</text>`,
  );

  lines.push(`</svg>`);
  return lines.join("\n");
}

function selectTemplateLandmarks(
  landmarks: MapLayout["landmarks"],
  template: TemplateSpec,
): MapLayout["landmarks"] {
  const preferred = template.preferredCategories
    ? landmarks.filter((lm) => template.preferredCategories!.has(lm.category))
    : [];
  const filtered = preferred.length > 0 ? preferred : landmarks;
  return filtered.slice(0, template.maxLandmarks);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function chooseApproachLandmark(
  landmarks: ProjectedLandmark[],
  cx: number,
  cy: number,
): ProjectedLandmark | null {
  let best: { landmark: ProjectedLandmark; score: number } | null = null;
  for (const landmark of landmarks) {
    const distance = Math.hypot(landmark.x - cx, landmark.y - cy);
    if (distance < 48) continue;
    const score = APPROACH_RANK[landmark.lm.category] * 1000 + Math.min(distance, 260);
    if (!best || score > best.score) best = { landmark, score };
  }
  return best?.landmark ?? null;
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
