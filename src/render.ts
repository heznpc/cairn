import type { LandmarkCategory, MapLayout, RenderOptions, RenderPreset, RoadClass } from "./types.js";
import {
  MAX_CANVAS_DIMENSION_PX,
  MIN_CANVAS_DIMENSION_PX,
} from "./limits.js";

const PAPER = "#fffef9";
const PAPER_EDGE = "#e5ded2";
const LABEL_HALO = PAPER;
const INK = "#25221d";
const DESTINATION = "#d63b31";
const MUTED_INK = "#5f5a52";
const TRANSIT_INK = "#216f86";
const EXIT_INK = "#207665";

// Road hierarchy is load-bearing for a 약도: the reader has to see the main
// artery at a glance. Widen the width gap and darken the top tiers so primary
// reads as "the big road you navigate by", while residential/path recede into
// pale filler. Kept in a warm-gray range so the linework still prints like ink.
const BASE_ROAD_STYLE: Record<RoadClass, { width: number; color: string }> = {
  primary: { width: 12, color: "#a29b8c" },
  secondary: { width: 7.5, color: "#c1baac" },
  tertiary: { width: 4, color: "#d8d1c4" },
  residential: { width: 3, color: "#e6dfd3" },
  path: { width: 2.5, color: "#ece6db" },
};

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

interface PresetSpec {
  roadScale: number;
  roadGeometry: "spine" | "orthogonal";
  showFrame: boolean;
  showRoadSkeleton: boolean;
  destinationLabel: "filled" | "outlined";
  destinationTailWidth: number;
  approachWidth: number;
  approachCasingWidth: number;
  approachStartTrim: number;
  approachEndTrim: number;
  landmarkLabelMax: number;
  labelImportanceMin: number;
  maxLandmarks: number;
  preferredCategories?: ReadonlySet<LandmarkCategory>;
  showRoadLabels: boolean;
  avoidRoadLabels: boolean;
  hideClutteredLabels: boolean;
  maxVisibleRoads: number;
}

const PRESETS: Record<RenderPreset, PresetSpec> = {
  standard: {
    roadScale: 1,
    roadGeometry: "spine",
    showFrame: true,
    showRoadSkeleton: true,
    destinationLabel: "filled",
    destinationTailWidth: 2.5,
    approachWidth: 3.5,
    approachCasingWidth: 8,
    approachStartTrim: 36,
    approachEndTrim: 30,
    landmarkLabelMax: 9,
    labelImportanceMin: 0,
    maxLandmarks: 5,
    showRoadLabels: true,
    // Treat road spines as label obstacles so landmark names route around the
    // skeleton instead of printing on top of it. Standard keeps every label
    // (hideClutteredLabels stays false) — this tidies placement, not content.
    avoidRoadLabels: true,
    hideClutteredLabels: false,
    maxVisibleRoads: 5,
  },
  compact: {
    roadScale: 1.04,
    roadGeometry: "spine",
    showFrame: true,
    showRoadSkeleton: true,
    destinationLabel: "filled",
    destinationTailWidth: 2.6,
    approachWidth: 3.8,
    approachCasingWidth: 9,
    approachStartTrim: 30,
    approachEndTrim: 24,
    landmarkLabelMax: 8,
    labelImportanceMin: 0.85,
    maxLandmarks: 2,
    preferredCategories: new Set(["station_exit", "station", "bus_stop"]),
    showRoadLabels: true,
    avoidRoadLabels: true,
    hideClutteredLabels: true,
    maxVisibleRoads: 3,
  },
  minimal: {
    roadScale: 0.82,
    roadGeometry: "spine",
    showFrame: false,
    showRoadSkeleton: false,
    destinationLabel: "outlined",
    destinationTailWidth: 1.8,
    approachWidth: 4.2,
    approachCasingWidth: 9.5,
    approachStartTrim: 24,
    approachEndTrim: 12,
    landmarkLabelMax: 8,
    labelImportanceMin: 0.9,
    maxLandmarks: 1,
    preferredCategories: new Set(["station_exit", "station", "bus_stop"]),
    showRoadLabels: false,
    avoidRoadLabels: true,
    hideClutteredLabels: true,
    maxVisibleRoads: 0,
  },
  schematic: {
    roadScale: 0.95,
    roadGeometry: "orthogonal",
    showFrame: true,
    showRoadSkeleton: true,
    destinationLabel: "filled",
    destinationTailWidth: 2.2,
    approachWidth: 3.5,
    approachCasingWidth: 8,
    approachStartTrim: 34,
    approachEndTrim: 28,
    landmarkLabelMax: 8,
    labelImportanceMin: 0.5,
    maxLandmarks: 4,
    showRoadLabels: true,
    avoidRoadLabels: true,
    hideClutteredLabels: true,
    maxVisibleRoads: 4,
  },
  badge: {
    roadScale: 0.9,
    roadGeometry: "spine",
    showFrame: true,
    showRoadSkeleton: false,
    destinationLabel: "filled",
    destinationTailWidth: 2,
    approachWidth: 4,
    approachCasingWidth: 9,
    approachStartTrim: 24,
    approachEndTrim: 12,
    landmarkLabelMax: 8,
    labelImportanceMin: 0.9,
    maxLandmarks: 1,
    preferredCategories: new Set(["station_exit", "station", "bus_stop"]),
    showRoadLabels: false,
    avoidRoadLabels: true,
    hideClutteredLabels: true,
    maxVisibleRoads: 0,
  },
};

// A printed 약도 should feel curated, not like an OSM tile. Standard keeps
// tiny synthetic layouts readable, while compact/minimal presets still honor
// their smaller road budgets so the output form actually changes.
const MAX_ROADS_WITHOUT_FILTER = 5;
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
const ROAD_LABEL_MAX = 12;
const CENTER_LABEL_MAX = 12;
const ROAD_CLIP_INSET_PX = 16;
const MIN_DIAGRAM_ROAD_RUN_PX = 56;
const PARALLEL_ROAD_DEDUPE_PX = 28;
const MINOR_ROAD_FOCUS_DISTANCE_PX = 100;

interface Point {
  x: number;
  y: number;
}

interface RoadSpine {
  start: Point;
  end: Point;
  length: number;
}

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
  const presetName = opts.preset ?? "standard";
  const preset = PRESETS[presetName];
  const spanX = Math.max(width - 100, MIN_SPAN);
  const spanY = Math.max(height - 100, MIN_SPAN);
  const { bbox, center } = layout;
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
  if (renderLayout === "diagram" && presetName === "minimal") {
    return renderRouteStripSVG(layout, width, height, presetName);
  }
  if (renderLayout === "diagram" && presetName === "badge") {
    return renderBadgeSVG(layout, width, height, presetName);
  }

  const displayRoads =
    renderLayout === "geographic"
      ? roads.filter((road) => road.points.length >= 2)
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

function renderRouteStripSVG(
  layout: MapLayout,
  width: number,
  height: number,
  presetName: RenderPreset,
): string {
  const start = chooseRouteStartLandmark(layout.landmarks);
  const roadName = bestRoadName(layout.roads);
  const centerLabel = truncateLabel(layout.center.label, CENTER_LABEL_MAX);
  const startLabel = truncateLabel(start?.name ?? "출발", 9);
  const startCategory = start?.category ?? "station_exit";
  const startIsRight = start ? start.lon >= layout.center.lon : false;
  const startIsAbove = start ? start.lat >= layout.center.lat : false;

  const sx = width * (startIsRight ? 0.70 : 0.24);
  const sy = height * (startIsAbove ? 0.38 : 0.62);
  const dx = width * (startIsRight ? 0.36 : 0.74);
  const dy = height * (startIsAbove ? 0.58 : 0.42);
  const bendX = sx + (dx - sx) * 0.45;
  const startEdgeX = sx + (dx > sx ? 24 : -24);
  const destEdgeX = dx + (dx > sx ? -22 : 22);
  const roadY = Math.min(height - 58, Math.max(sy, dy) + height * 0.18);
  const roadStartX = width * 0.12;
  const roadEndX = width * 0.88;
  const destWidth = Math.min(Math.max(textBoxWidth(centerLabel, 13, 28), 64), width * 0.34);
  const destBoxX = dx < width / 2
    ? Math.max(24, dx - destWidth - 18)
    : Math.min(dx + 18, width - destWidth - 24);
  const destBox: CenterCallout = {
    x: destBoxX,
    y: Math.max(24, dy - 16),
    width: destWidth,
    height: 26,
    anchorX: dx < width / 2 ? destBoxX + destWidth : destBoxX,
    anchorY: dy,
  };

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-preset="${presetName}" data-route-strip="true" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif">`,
  );
  lines.push(
    `<defs><marker id="cairn-approach-arrowhead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 Z" fill="${DESTINATION}"/></marker></defs>`,
  );
  lines.push(`<metadata>Map data © OpenStreetMap contributors, ODbL.</metadata>`);
  lines.push(`<rect width="${width}" height="${height}" fill="${PAPER}"/>`);
  lines.push(
    `<path data-strip-road="anchor" d="M${roadStartX.toFixed(1)},${roadY.toFixed(1)} H${roadEndX.toFixed(1)}" fill="none" stroke="${BASE_ROAD_STYLE.primary.color}" stroke-width="9" stroke-linecap="round"/>`,
  );
  if (roadName) {
    lines.push(labelText(truncateLabel(roadName, ROAD_LABEL_MAX), width * 0.50, roadY - 12, 10, "#8a857c", 600));
  }

  const routeD = `M${startEdgeX.toFixed(1)},${sy.toFixed(1)} L${bendX.toFixed(1)},${sy.toFixed(1)} L${destEdgeX.toFixed(1)},${dy.toFixed(1)}`;
  lines.push(
    `<path data-approach-arrow="casing" data-strip-route="casing" d="${routeD}" fill="none" stroke="${PAPER}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  lines.push(
    `<path data-approach-arrow="core" data-strip-route="core" d="${routeD}" fill="none" stroke="${DESTINATION}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#cairn-approach-arrowhead)"/>`,
  );

  const marker = markerStyle(startCategory);
  lines.push(
    `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="18" fill="${PAPER}" stroke="${marker.color}" stroke-width="${marker.emphasis ? 2 : 1.25}"/>`,
  );
  lines.push(landmarkIcon(startCategory, sx, sy, marker.color));
  lines.push(labelText(startLabel, sx, sy + 38, 11, INK, 500));

  lines.push(
    `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="10" fill="${DESTINATION}" stroke="${PAPER}" stroke-width="3"/>`,
  );
  lines.push(
    `<line data-destination-tail="true" x1="${destBox.anchorX.toFixed(1)}" y1="${destBox.anchorY.toFixed(1)}" x2="${dx.toFixed(1)}" y2="${dy.toFixed(1)}" stroke="${DESTINATION}" stroke-width="1.8" stroke-linecap="round"/>`,
  );
  lines.push(destinationLabel(centerLabel, destBox, PRESETS.minimal));
  lines.push(
    `<text data-attribution="osm" x="${(width - 18).toFixed(1)}" y="${(height - 8).toFixed(1)}" text-anchor="end" font-size="8" fill="#aaa59d">© OpenStreetMap contributors</text>`,
  );
  lines.push(`</svg>`);
  return lines.join("\n");
}

function renderBadgeSVG(
  layout: MapLayout,
  width: number,
  height: number,
  presetName: RenderPreset,
): string {
  const start = chooseRouteStartLandmark(layout.landmarks);
  const roadName = bestRoadName(layout.roads);
  const centerLabel = truncateLabel(layout.center.label, CENTER_LABEL_MAX);
  const startLabel = truncateLabel(start?.name ?? "출발", 8);
  const startCategory = start?.category ?? "station_exit";
  const startIsRight = start ? start.lon >= layout.center.lon : true;
  const startIsAbove = start ? start.lat >= layout.center.lat : true;

  const dx = width * 0.50;
  const dy = height * 0.48;
  const sx = width * (startIsRight ? 0.70 : 0.30);
  const sy = height * (startIsAbove ? 0.30 : 0.66);
  const bendX = sx + (dx - sx) * 0.55;
  const startEdgeX = sx + (dx > sx ? 23 : -23);
  const destEdgeX = dx + (dx > sx ? -18 : 18);
  const destWidth = Math.min(Math.max(textBoxWidth(centerLabel, 14, 32), 76), width * 0.38);
  const destBox: CenterCallout = {
    x: Math.max(24, Math.min(width - destWidth - 24, dx - destWidth / 2)),
    y: Math.min(height - 60, dy + 24),
    width: destWidth,
    height: 28,
    anchorX: dx,
    anchorY: dy + 24,
  };
  const roadY = height * 0.70;
  const crossX = width * (startIsRight ? 0.62 : 0.38);

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-preset="${presetName}" data-badge-map="true" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif">`,
  );
  lines.push(
    `<defs><marker id="cairn-approach-arrowhead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 Z" fill="${DESTINATION}"/></marker></defs>`,
  );
  lines.push(`<metadata>Map data © OpenStreetMap contributors, ODbL.</metadata>`);
  lines.push(`<rect width="${width}" height="${height}" fill="${PAPER}"/>`);
  lines.push(
    `<rect data-badge-panel="true" x="18" y="18" width="${width - 36}" height="${height - 36}" fill="none" stroke="${PAPER_EDGE}" stroke-width="1"/>`,
  );
  lines.push(
    `<path data-badge-road="primary" d="M${(width * 0.14).toFixed(1)},${roadY.toFixed(1)} H${(width * 0.86).toFixed(1)}" fill="none" stroke="${BASE_ROAD_STYLE.primary.color}" stroke-width="8.5" stroke-linecap="round"/>`,
  );
  lines.push(
    `<path data-badge-road="secondary" d="M${crossX.toFixed(1)},${(height * 0.22).toFixed(1)} V${(height * 0.78).toFixed(1)}" fill="none" stroke="${BASE_ROAD_STYLE.secondary.color}" stroke-width="5.5" stroke-linecap="round"/>`,
  );
  if (roadName) {
    lines.push(labelText(truncateLabel(roadName, ROAD_LABEL_MAX), width * 0.50, roadY - 12, 10, "#8a857c", 600));
  }

  const routeD = `M${startEdgeX.toFixed(1)},${sy.toFixed(1)} L${bendX.toFixed(1)},${sy.toFixed(1)} L${destEdgeX.toFixed(1)},${dy.toFixed(1)}`;
  lines.push(
    `<path data-approach-arrow="casing" data-badge-route="casing" d="${routeD}" fill="none" stroke="${PAPER}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  lines.push(
    `<path data-approach-arrow="core" data-badge-route="core" d="${routeD}" fill="none" stroke="${DESTINATION}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#cairn-approach-arrowhead)"/>`,
  );

  const marker = markerStyle(startCategory);
  lines.push(
    `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="17" fill="${PAPER}" stroke="${marker.color}" stroke-width="${marker.emphasis ? 2 : 1.25}"/>`,
  );
  lines.push(landmarkIcon(startCategory, sx, sy, marker.color));
  lines.push(labelText(startLabel, sx, sy + 36, 11, INK, 500));

  lines.push(
    `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="10" fill="${DESTINATION}" stroke="${PAPER}" stroke-width="3"/>`,
  );
  lines.push(
    `<line data-destination-tail="true" x1="${destBox.anchorX.toFixed(1)}" y1="${destBox.anchorY.toFixed(1)}" x2="${dx.toFixed(1)}" y2="${dy.toFixed(1)}" stroke="${DESTINATION}" stroke-width="2" stroke-linecap="round"/>`,
  );
  lines.push(destinationLabel(centerLabel, destBox, PRESETS.badge));
  lines.push(
    `<text data-attribution="osm" x="${(width - 18).toFixed(1)}" y="${(height - 8).toFixed(1)}" text-anchor="end" font-size="8" fill="#aaa59d">© OpenStreetMap contributors</text>`,
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

function roadStyle(roadClass: RoadClass, preset: PresetSpec): { width: number; color: string } {
  const style = BASE_ROAD_STYLE[roadClass] ?? BASE_ROAD_STYLE.path;
  return { width: style.width * preset.roadScale, color: style.color };
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

function chooseRouteStartLandmark(
  landmarks: MapLayout["landmarks"],
): MapLayout["landmarks"][number] | null {
  return [...landmarks]
    .sort((a, b) =>
      APPROACH_RANK[b.category] * 1000 + b.importance * 100 -
      (APPROACH_RANK[a.category] * 1000 + a.importance * 100),
    )[0] ?? null;
}

function bestRoadName(roads: MapLayout["roads"]): string | null {
  return [...roads]
    .filter((road) => road.name && LABELED_ROAD_CLASSES.has(road.class))
    .sort((a, b) => ROAD_RANK[b.class] - ROAD_RANK[a.class])[0]?.name ?? null;
}

function markerStyle(category: LandmarkCategory): { color: string; emphasis?: boolean } {
  switch (category) {
    case "station":
      return { color: TRANSIT_INK, emphasis: true };
    case "station_exit":
      return { color: EXIT_INK, emphasis: true };
    default:
      return { color: MUTED_INK };
  }
}

function destinationLabel(label: string, box: CenterCallout, preset: PresetSpec): string {
  const x = box.x.toFixed(1);
  const y = box.y.toFixed(1);
  const textX = (box.x + box.width / 2).toFixed(1);
  const textY = (box.y + 17).toFixed(1);
  const escaped = escapeXml(label);
  if (preset.destinationLabel === "outlined") {
    return [
      `<rect data-destination-label="true" x="${x}" y="${y}" width="${box.width}" height="${box.height}" fill="${PAPER}" stroke="${DESTINATION}" stroke-width="1.5"/>`,
      `<text x="${textX}" y="${textY}" text-anchor="middle" font-size="13" font-weight="700" fill="${DESTINATION}">${escaped}</text>`,
    ].join("\n");
  }
  return [
    `<rect data-destination-label="true" x="${x}" y="${y}" width="${box.width}" height="${box.height}" fill="${DESTINATION}"/>`,
    `<text x="${textX}" y="${textY}" text-anchor="middle" font-size="13" font-weight="700" fill="${PAPER}">${escaped}</text>`,
  ].join("\n");
}

function labelText(
  label: string | string[],
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  fontWeight: number,
): string {
  const lines = Array.isArray(label) ? label : [label];
  const attrs = `x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="${fontSize}" font-weight="${fontWeight}"`;
  // A single line keeps the exact flat <text>…</text> shape (other callers and
  // tests match on it); multiple lines stack as tspans down from the baseline.
  const body =
    lines.length === 1
      ? escapeXml(lines[0])
      : lines
          .map(
            (line, i) =>
              `<tspan x="${x.toFixed(1)}" dy="${i === 0 ? 0 : fontSize + 3}">${escapeXml(line)}</tspan>`,
          )
          .join("");
  return [
    `<text ${attrs} fill="none" stroke="${LABEL_HALO}" stroke-width="4" stroke-linejoin="round">${body}</text>`,
    `<text ${attrs} fill="${fill}">${body}</text>`,
  ].join("\n");
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
    const candidates: Box[] = [
      {
        x: lm.x - lm.labelWidth / 2,
        y: lm.y + 23,
        width: lm.labelWidth,
        height: boxHeight,
      },
      {
        x: lm.x - lm.labelWidth / 2,
        y: lm.y - 23 - boxHeight,
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
      // Diagonal escapes: crowded intersections often leave only a corner open.
      {
        x: lm.x + 22,
        y: lm.y + 20,
        width: lm.labelWidth,
        height: boxHeight,
      },
      {
        x: lm.x - lm.labelWidth - 22,
        y: lm.y + 20,
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
      .sort((a, b) => a.score - b.score)[0];
    if (hideClutteredLabels && best.score > 1200 && lm.lm.importance < 0.85) {
      placed.push({ x: lm.x, y: lm.y, width: 0, height: 0, hidden: true });
      continue;
    }
    placed.push(best.candidate);
  }
  return placed;
}

function roadObstacleBoxes(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): Box[] {
  return roads
    .map((road) => diagramRoadSpine(road, project, width, height))
    .filter((spine): spine is RoadSpine => spine !== null)
    .map((spine) => {
      const pad = 9;
      const minX = Math.min(spine.start.x, spine.end.x) - pad;
      const minY = Math.min(spine.start.y, spine.end.y) - pad;
      const maxX = Math.max(spine.start.x, spine.end.x) + pad;
      const maxY = Math.max(spine.start.y, spine.end.y) + pad;
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    });
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

function roadPathData(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  renderLayout: RenderOptions["layout"],
  width: number,
  height: number,
  roadGeometry: PresetSpec["roadGeometry"] = "spine",
): string | null {
  if (renderLayout === "geographic") return rawRoadPathData(road, project);
  if (roadGeometry === "orthogonal") return orthogonalRoadPathData(road, project, width, height);
  return diagramRoadPathData(road, project, width, height);
}

function rawRoadPathData(
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

function diagramRoadPathData(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): string | null {
  const spine = diagramRoadSpine(road, project, width, height);
  if (!spine) return null;
  return `M${spine.start.x.toFixed(1)},${spine.start.y.toFixed(1)} L${spine.end.x.toFixed(1)},${spine.end.y.toFixed(1)}`;
}

function orthogonalRoadPathData(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): string | null {
  const spine = diagramRoadSpine(road, project, width, height);
  if (!spine) return null;
  const dx = spine.end.x - spine.start.x;
  const dy = spine.end.y - spine.start.y;
  if (Math.abs(dx) < 12 || Math.abs(dy) < 12) {
    return `M${spine.start.x.toFixed(1)},${spine.start.y.toFixed(1)} L${spine.end.x.toFixed(1)},${spine.end.y.toFixed(1)}`;
  }
  const elbow = Math.abs(dx) >= Math.abs(dy)
    ? { x: spine.end.x, y: spine.start.y }
    : { x: spine.start.x, y: spine.end.y };
  return [
    `M${spine.start.x.toFixed(1)},${spine.start.y.toFixed(1)}`,
    `L${elbow.x.toFixed(1)},${elbow.y.toFixed(1)}`,
    `L${spine.end.x.toFixed(1)},${spine.end.y.toFixed(1)}`,
  ].join(" ");
}

function diagramRoadSpine(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): RoadSpine | null {
  const runs = clippedRoadRuns(
    road,
    project,
    ROAD_CLIP_INSET_PX,
    ROAD_CLIP_INSET_PX,
    width - ROAD_CLIP_INSET_PX,
    height - ROAD_CLIP_INSET_PX,
  );
  const best = runs
    .map((points) => ({ points, length: polylineLength(points) }))
    .filter((run) => run.length >= MIN_DIAGRAM_ROAD_RUN_PX)
    .sort((a, b) => b.length - a.length)[0];
  if (!best) return null;

  const start = best.points[0];
  const end = best.points[best.points.length - 1];
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < MIN_DIAGRAM_ROAD_RUN_PX) {
    return null;
  }
  return { start, end, length };
}

function selectDisplayRoads(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
  focus: Point,
  maxVisibleRoads: number,
): MapLayout["roads"] {
  const drawable = roads.filter((road) => road.points.length >= 2);
  if (drawable.length <= Math.min(MAX_ROADS_WITHOUT_FILTER, maxVisibleRoads)) return drawable;

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
  const pickedSignatures: Array<{ angleBucket: number; offset: number }> = [];
  for (const item of source) {
    if (picked.length >= maxVisibleRoads) break;
    const spine = diagramRoadSpine(item.road, project, width, height);
    if (!spine) continue;
    if (item.road.class === "residential" || item.road.class === "path") {
      continue;
    }
    if (
      item.road.class === "tertiary" &&
      pointToSegmentDistance(focus, spine.start, spine.end) > MINOR_ROAD_FOCUS_DISTANCE_PX
    ) {
      continue;
    }
    const signature = roadVisualSignature(spine);
    if (pickedSignatures.some((picked) => isParallelDuplicate(signature, picked))) {
      continue;
    }
    if (item.road.name) {
      const count = pickedByName.get(item.road.name) ?? 0;
      if (count >= MAX_ROADS_PER_NAME) continue;
      pickedByName.set(item.road.name, count + 1);
    }
    pickedSignatures.push(signature);
    picked.push(item.road);
  }

  return picked;
}

function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
  const x = start.x + t * dx;
  const y = start.y + t * dy;
  return Math.hypot(point.x - x, point.y - y);
}

function roadVisualSignature(spine: RoadSpine): { angleBucket: number; offset: number } {
  const dx = spine.end.x - spine.start.x;
  const dy = spine.end.y - spine.start.y;
  const angle = ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI;
  const angleBucket = Math.round(angle / (Math.PI / 12));
  const midX = (spine.start.x + spine.end.x) / 2;
  const midY = (spine.start.y + spine.end.y) / 2;
  const normal = angle + Math.PI / 2;
  const offset = midX * Math.cos(normal) + midY * Math.sin(normal);
  return { angleBucket, offset };
}

function isParallelDuplicate(
  a: { angleBucket: number; offset: number },
  b: { angleBucket: number; offset: number },
): boolean {
  return a.angleBucket === b.angleBucket && Math.abs(a.offset - b.offset) < PARALLEL_ROAD_DEDUPE_PX;
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

function clippedRoadRuns(
  road: MapLayout["roads"][number],
  project: (lat: number, lon: number) => [number, number],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Point[][] {
  const projected = road.points.map((p) => {
    const [x, y] = project(p.lat, p.lon);
    return { x, y };
  });

  const runs: Point[][] = [];
  let current: Point[] = [];
  const finishRun = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };

  for (let i = 1; i < projected.length; i++) {
    const clipped = clipSegment(
      projected[i - 1].x,
      projected[i - 1].y,
      projected[i].x,
      projected[i].y,
      minX,
      minY,
      maxX,
      maxY,
    );
    if (!clipped) {
      finishRun();
      continue;
    }

    const [[x0, y0], [x1, y1]] = clipped;
    const start = { x: x0, y: y0 };
    const end = { x: x1, y: y1 };
    const last = current[current.length - 1];
    if (!last) {
      current = [start, end];
    } else if (Math.hypot(last.x - start.x, last.y - start.y) <= 0.5) {
      current.push(end);
    } else {
      finishRun();
      current = [start, end];
    }
  }
  finishRun();
  return runs;
}

function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

function truncateLabel(label: string, maxChars: number): string {
  const trimmed = label.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= maxChars) return trimmed;
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
}

// Wrap a landmark name onto at most two lines instead of hard-truncating with
// an ellipsis (the ugliest "auto-generated" tell). Korean place names are
// usually space-free, so the split is by character count — balanced, but never
// past maxPerLine on the first line; a name too long for two lines ellipsises
// the second. Short names stay on one line (single-element array).
function wrapLandmarkLabel(name: string, maxPerLine: number): string[] {
  const trimmed = name.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= maxPerLine) return [trimmed];
  const splitAt = Math.min(maxPerLine, Math.ceil(chars.length / 2));
  const line1 = chars.slice(0, splitAt).join("");
  const rest = Array.from(chars.slice(splitAt).join("").trimStart());
  const line2 =
    rest.length > maxPerLine
      ? `${rest.slice(0, Math.max(1, maxPerLine - 1)).join("")}…`
      : rest.join("");
  return [line1, line2];
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
    score += overlapArea(box, obstacle) * 30;
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
