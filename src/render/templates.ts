import type { MapLayout, RenderTemplate, RenderTheme } from "../types.js";
import { selectApproachLandmark } from "./approach.js";
import { bestRoadName } from "./road-layout.js";
import {
  type TemplateSpec,
  type ThemeSpec,
} from "./theme.js";
import {
  type CenterCallout,
  labelText,
  textBoxWidth,
  truncateLabel,
} from "./text.js";
import {
  renderApproachPath,
  renderDestinationMarker,
  renderLandmarkMarker,
  renderOsmAttribution,
  svgDocumentStart,
} from "./svg-primitives.js";

const ROAD_LABEL_MAX = 12;
const CENTER_LABEL_MAX = 12;

export function renderRouteStripSVG(
  layout: MapLayout,
  width: number,
  height: number,
  templateName: RenderTemplate,
  template: TemplateSpec,
  themeName: RenderTheme,
  theme: ThemeSpec,
  approachLandmarkId?: string,
): string {
  const start = selectTemplateApproachLandmark(layout.landmarks, approachLandmarkId);
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

  const lines = svgDocumentStart({
    width,
    height,
    templateName,
    themeName,
    theme,
    data: { "route-strip": true },
  });
  lines.push(
    `<path data-strip-road="anchor" d="M${roadStartX.toFixed(1)},${roadY.toFixed(1)} H${roadEndX.toFixed(1)}" fill="none" stroke="${theme.roads.primary}" stroke-width="9" stroke-linecap="round"/>`,
  );
  if (roadName) {
    lines.push(labelText(truncateLabel(roadName, ROAD_LABEL_MAX), width * 0.50, roadY - 12, 10, theme.roadLabel, 600, theme.background));
  }

  const routeD = `M${startEdgeX.toFixed(1)},${sy.toFixed(1)} L${bendX.toFixed(1)},${sy.toFixed(1)} L${destEdgeX.toFixed(1)},${dy.toFixed(1)}`;
  lines.push(...renderApproachPath(routeD, theme, {
    casingWidth: 11,
    coreWidth: 4.4,
    layerDataName: "strip-route",
    lineJoin: true,
  }));

  lines.push(...renderLandmarkMarker({
    x: sx,
    y: sy,
    radius: 18,
    category: startCategory,
    theme,
  }));
  lines.push(labelText(startLabel, sx, sy + 38, 11, theme.ink, 500, theme.background));

  lines.push(...renderDestinationMarker({
    x: dx,
    y: dy,
    label: centerLabel,
    callout: destBox,
    tailWidth: 1.8,
    template,
    theme,
  }));
  lines.push(renderOsmAttribution(width, height, theme));
  lines.push(`</svg>`);
  return lines.join("\n");
}

export function renderBadgeSVG(
  layout: MapLayout,
  width: number,
  height: number,
  templateName: RenderTemplate,
  template: TemplateSpec,
  themeName: RenderTheme,
  theme: ThemeSpec,
  approachLandmarkId?: string,
): string {
  const start = selectTemplateApproachLandmark(layout.landmarks, approachLandmarkId);
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

  const lines = svgDocumentStart({
    width,
    height,
    templateName,
    themeName,
    theme,
    data: { "badge-map": true },
  });
  lines.push(
    `<rect data-badge-panel="true" x="18" y="18" width="${width - 36}" height="${height - 36}" fill="none" stroke="${theme.frame}" stroke-width="1"/>`,
  );
  lines.push(
    `<path data-badge-road="primary" d="M${(width * 0.14).toFixed(1)},${roadY.toFixed(1)} H${(width * 0.86).toFixed(1)}" fill="none" stroke="${theme.roads.primary}" stroke-width="8.5" stroke-linecap="round"/>`,
  );
  lines.push(
    `<path data-badge-road="secondary" d="M${crossX.toFixed(1)},${(height * 0.22).toFixed(1)} V${(height * 0.78).toFixed(1)}" fill="none" stroke="${theme.roads.secondary}" stroke-width="5.5" stroke-linecap="round"/>`,
  );
  if (roadName) {
    lines.push(labelText(truncateLabel(roadName, ROAD_LABEL_MAX), width * 0.50, roadY - 12, 10, theme.roadLabel, 600, theme.background));
  }

  const routeD = `M${startEdgeX.toFixed(1)},${sy.toFixed(1)} L${bendX.toFixed(1)},${sy.toFixed(1)} L${destEdgeX.toFixed(1)},${dy.toFixed(1)}`;
  lines.push(...renderApproachPath(routeD, theme, {
    casingWidth: 10,
    coreWidth: 4,
    layerDataName: "badge-route",
    lineJoin: true,
  }));

  lines.push(...renderLandmarkMarker({
    x: sx,
    y: sy,
    radius: 17,
    category: startCategory,
    theme,
  }));
  lines.push(labelText(startLabel, sx, sy + 36, 11, theme.ink, 500, theme.background));

  lines.push(...renderDestinationMarker({
    x: dx,
    y: dy,
    label: centerLabel,
    callout: destBox,
    tailWidth: 2,
    template,
    theme,
  }));
  lines.push(renderOsmAttribution(width, height, theme));
  lines.push(`</svg>`);
  return lines.join("\n");
}

function selectTemplateApproachLandmark(
  landmarks: MapLayout["landmarks"],
  approachLandmarkId?: string,
): MapLayout["landmarks"][number] | null {
  return selectApproachLandmark(
    landmarks.map((landmark) => ({
      value: landmark,
      id: landmark.id,
      category: landmark.category,
      importance: landmark.importance,
    })),
    { explicitId: approachLandmarkId },
  );
}
