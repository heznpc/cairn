import type { LandmarkCategory, RenderTemplate, RenderTheme } from "../types.js";
import { landmarkIcon, markerStyle } from "./icons.js";
import type { TemplateSpec, ThemeSpec } from "./theme.js";
import {
  destinationLabel,
  type CenterCallout,
} from "./text.js";

export interface SvgDocumentFrameOptions {
  width: number;
  height: number;
  templateName: RenderTemplate;
  themeName: RenderTheme;
  theme: ThemeSpec;
  data?: Readonly<Record<string, string | number | boolean>>;
}

export function svgDocumentStart(options: SvgDocumentFrameOptions): string[] {
  const { width, height, templateName, themeName, theme, data } = options;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-preset="${templateName}" data-template="${templateName}" data-theme="${themeName}"${svgDataAttributes(data)} font-family="${theme.fontFamily}">`,
    `<defs><marker id="cairn-approach-arrowhead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 Z" fill="${theme.destination}"/></marker></defs>`,
    `<metadata>Map data © OpenStreetMap contributors, ODbL.</metadata>`,
    `<rect width="${width}" height="${height}" fill="${theme.background}"/>`,
  ];
}

export interface ApproachPathOptions {
  casingWidth: number;
  coreWidth: number;
  layerDataName?: string;
  lineJoin?: boolean;
  data?: Readonly<Record<string, string | number | boolean>>;
}

export function renderApproachPath(
  path: string,
  theme: ThemeSpec,
  options: ApproachPathOptions,
): string[] {
  const { casingWidth, coreWidth, layerDataName, lineJoin = false, data } = options;
  const casingLayer = layerDataName ? ` data-${layerDataName}="casing"` : "";
  const coreLayer = layerDataName ? ` data-${layerDataName}="core"` : "";
  const sharedData = svgDataAttributes(data);
  const join = lineJoin ? ` stroke-linejoin="round"` : "";
  return [
    `<path data-approach-arrow="casing"${casingLayer}${sharedData} d="${path}" fill="none" stroke="${theme.background}" stroke-width="${casingWidth}" stroke-linecap="round"${join}/>`,
    `<path data-approach-arrow="core"${coreLayer}${sharedData} d="${path}" fill="none" stroke="${theme.destination}" stroke-width="${coreWidth}" stroke-linecap="round"${join} marker-end="url(#cairn-approach-arrowhead)"/>`,
  ];
}

export interface LandmarkMarkerOptions {
  x: number;
  y: number;
  radius: number;
  category: LandmarkCategory;
  theme: ThemeSpec;
  data?: Readonly<Record<string, string | number | boolean>>;
}

export function renderLandmarkMarker(options: LandmarkMarkerOptions): string[] {
  const { x, y, radius, category, theme, data } = options;
  const marker = markerStyle(category, theme);
  return [
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}"${svgDataAttributes(data)} fill="${theme.background}" stroke="${marker.color}" stroke-width="${marker.emphasis ? 2 : 1.25}"/>`,
    landmarkIcon(category, x, y, marker.color),
  ];
}

export interface DestinationMarkerOptions {
  x: number;
  y: number;
  label: string;
  callout: CenterCallout;
  tailWidth: number;
  template: TemplateSpec;
  theme: ThemeSpec;
}

export function renderDestinationMarker(options: DestinationMarkerOptions): string[] {
  const { x, y, label, callout, tailWidth, template, theme } = options;
  return [
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="${theme.destination}" stroke="${theme.background}" stroke-width="3.5"/>`,
    `<line data-destination-tail="true" x1="${callout.anchorX.toFixed(1)}" y1="${callout.anchorY.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${theme.destination}" stroke-width="${tailWidth}" stroke-linecap="round"/>`,
    destinationLabel(label, callout, template, theme),
  ];
}

export function renderOsmAttribution(
  width: number,
  height: number,
  theme: ThemeSpec,
): string {
  return `<text data-attribution="osm" x="${(width - 18).toFixed(1)}" y="${(height - 8).toFixed(1)}" text-anchor="end" font-size="8" fill="${theme.attribution}">© OpenStreetMap contributors</text>`;
}

function svgDataAttributes(
  attributes?: Readonly<Record<string, string | number | boolean>>,
): string {
  if (!attributes) return "";
  return Object.entries(attributes)
    .map(([name, value]) => ` data-${name}="${escapeXmlAttribute(String(value))}"`)
    .join("");
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
