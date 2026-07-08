import type { MapLayout, RenderOptions } from "./types.js";
import { createProjection, resolveCanvasSize } from "./render/projection.js";
import { renderStandardMapSVG } from "./render/standard-map.js";
import { renderBadgeSVG, renderRouteStripSVG } from "./render/templates.js";
import { PRESETS } from "./render/theme.js";

export function renderSVG(layout: MapLayout, opts: RenderOptions = {}): string {
  const { width, height } = resolveCanvasSize(opts);
  const presetName = opts.preset ?? "standard";
  const preset = PRESETS[presetName];
  const renderLayout = opts.layout ?? "diagram";
  if (renderLayout === "diagram" && presetName === "minimal") {
    return renderRouteStripSVG(layout, width, height, presetName);
  }
  if (renderLayout === "diagram" && presetName === "badge") {
    return renderBadgeSVG(layout, width, height, presetName);
  }

  const projection = createProjection(layout, width, height, {
    layout: renderLayout,
    focus: opts.focus,
  });
  return renderStandardMapSVG(layout, {
    width,
    height,
    presetName,
    preset,
    renderLayout,
    project: projection.project,
    center: projection.center,
  });
}
