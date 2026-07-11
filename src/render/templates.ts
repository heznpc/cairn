import type { MapLayout, RenderTemplate, RenderTheme } from "../types.js";
import { landmarkIcon, markerStyle } from "./icons.js";
import { bestRoadName } from "./road-layout.js";
import {
  APPROACH_RANK,
  type TemplateSpec,
  type ThemeSpec,
} from "./theme.js";
import {
  type CenterCallout,
  destinationLabel,
  labelText,
  textBoxWidth,
  truncateLabel,
} from "./text.js";

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
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-preset="${templateName}" data-template="${templateName}" data-theme="${themeName}" data-route-strip="true" font-family="${theme.fontFamily}">`,
  );
  lines.push(
    `<defs><marker id="cairn-approach-arrowhead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 Z" fill="${theme.destination}"/></marker></defs>`,
  );
  lines.push(`<metadata>Map data © OpenStreetMap contributors, ODbL.</metadata>`);
  lines.push(`<rect width="${width}" height="${height}" fill="${theme.background}"/>`);
  lines.push(
    `<path data-strip-road="anchor" d="M${roadStartX.toFixed(1)},${roadY.toFixed(1)} H${roadEndX.toFixed(1)}" fill="none" stroke="${theme.roads.primary}" stroke-width="9" stroke-linecap="round"/>`,
  );
  if (roadName) {
    lines.push(labelText(truncateLabel(roadName, ROAD_LABEL_MAX), width * 0.50, roadY - 12, 10, theme.roadLabel, 600, theme.background));
  }

  const routeD = `M${startEdgeX.toFixed(1)},${sy.toFixed(1)} L${bendX.toFixed(1)},${sy.toFixed(1)} L${destEdgeX.toFixed(1)},${dy.toFixed(1)}`;
  lines.push(
    `<path data-approach-arrow="casing" data-strip-route="casing" d="${routeD}" fill="none" stroke="${theme.background}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  lines.push(
    `<path data-approach-arrow="core" data-strip-route="core" d="${routeD}" fill="none" stroke="${theme.destination}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#cairn-approach-arrowhead)"/>`,
  );

  const marker = markerStyle(startCategory, theme);
  lines.push(
    `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="18" fill="${theme.background}" stroke="${marker.color}" stroke-width="${marker.emphasis ? 2 : 1.25}"/>`,
  );
  lines.push(landmarkIcon(startCategory, sx, sy, marker.color));
  lines.push(labelText(startLabel, sx, sy + 38, 11, theme.ink, 500, theme.background));

  lines.push(
    `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="13" fill="${theme.destination}" stroke="${theme.background}" stroke-width="3.5"/>`,
  );
  lines.push(
    `<line data-destination-tail="true" x1="${destBox.anchorX.toFixed(1)}" y1="${destBox.anchorY.toFixed(1)}" x2="${dx.toFixed(1)}" y2="${dy.toFixed(1)}" stroke="${theme.destination}" stroke-width="1.8" stroke-linecap="round"/>`,
  );
  lines.push(destinationLabel(centerLabel, destBox, template, theme));
  lines.push(
    `<text data-attribution="osm" x="${(width - 18).toFixed(1)}" y="${(height - 8).toFixed(1)}" text-anchor="end" font-size="8" fill="${theme.attribution}">© OpenStreetMap contributors</text>`,
  );
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
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-preset="${templateName}" data-template="${templateName}" data-theme="${themeName}" data-badge-map="true" font-family="${theme.fontFamily}">`,
  );
  lines.push(
    `<defs><marker id="cairn-approach-arrowhead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 Z" fill="${theme.destination}"/></marker></defs>`,
  );
  lines.push(`<metadata>Map data © OpenStreetMap contributors, ODbL.</metadata>`);
  lines.push(`<rect width="${width}" height="${height}" fill="${theme.background}"/>`);
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
  lines.push(
    `<path data-approach-arrow="casing" data-badge-route="casing" d="${routeD}" fill="none" stroke="${theme.background}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  lines.push(
    `<path data-approach-arrow="core" data-badge-route="core" d="${routeD}" fill="none" stroke="${theme.destination}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#cairn-approach-arrowhead)"/>`,
  );

  const marker = markerStyle(startCategory, theme);
  lines.push(
    `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="17" fill="${theme.background}" stroke="${marker.color}" stroke-width="${marker.emphasis ? 2 : 1.25}"/>`,
  );
  lines.push(landmarkIcon(startCategory, sx, sy, marker.color));
  lines.push(labelText(startLabel, sx, sy + 36, 11, theme.ink, 500, theme.background));

  lines.push(
    `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="13" fill="${theme.destination}" stroke="${theme.background}" stroke-width="3.5"/>`,
  );
  lines.push(
    `<line data-destination-tail="true" x1="${destBox.anchorX.toFixed(1)}" y1="${destBox.anchorY.toFixed(1)}" x2="${dx.toFixed(1)}" y2="${dy.toFixed(1)}" stroke="${theme.destination}" stroke-width="2" stroke-linecap="round"/>`,
  );
  lines.push(destinationLabel(centerLabel, destBox, template, theme));
  lines.push(
    `<text data-attribution="osm" x="${(width - 18).toFixed(1)}" y="${(height - 8).toFixed(1)}" text-anchor="end" font-size="8" fill="${theme.attribution}">© OpenStreetMap contributors</text>`,
  );
  lines.push(`</svg>`);
  return lines.join("\n");
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
