import type { MapLayout, RenderOptions } from "./types.js";
import { createProjection, resolveCanvasSize } from "./render/projection.js";
import { renderStandardMapSVG } from "./render/standard-map.js";
import { renderBadgeSVG, renderRouteStripSVG } from "./render/templates.js";
import { TEMPLATES, THEMES } from "./render/theme.js";

export function renderSVG(layout: MapLayout, opts: RenderOptions = {}): string {
  const { width, height } = resolveCanvasSize(opts);
  const templateName = opts.template ?? opts.preset ?? "standard";
  const template = TEMPLATES[templateName];
  const themeName = opts.theme ?? "paper";
  const theme = THEMES[themeName];
  const renderLayout = opts.layout ?? "diagram";
  if (renderLayout === "diagram" && templateName === "minimal") {
    return renderRouteStripSVG(layout, width, height, templateName, template, themeName, theme);
  }
  if (renderLayout === "diagram" && templateName === "badge") {
    return renderBadgeSVG(layout, width, height, templateName, template, themeName, theme);
  }

  const projection = createProjection(layout, width, height, {
    layout: renderLayout,
    focus: opts.focus,
  });
  return renderStandardMapSVG(layout, {
    width,
    height,
    templateName,
    template,
    themeName,
    theme,
    renderLayout,
    project: projection.project,
    center: projection.center,
    landmarkPositions: opts.landmarkPositions,
  });
}
