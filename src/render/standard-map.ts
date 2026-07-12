import type { MapLayout } from "../types.js";
import { markerStyle } from "./icons.js";
import { roadStyle } from "./road-layout.js";
import {
  buildStandardMapScene,
  type StandardMapRenderContext,
  type StandardMapScene,
} from "./standard-scene.js";
import {
  renderApproachPath,
  renderDestinationMarker,
  renderLandmarkMarker,
  renderOsmAttribution,
  svgDocumentStart,
} from "./svg-primitives.js";
import { labelText } from "./text.js";

export type { StandardMapRenderContext, StandardMapScene } from "./standard-scene.js";

export function renderStandardMapSVG(
  layout: MapLayout,
  context: StandardMapRenderContext,
): string {
  return renderStandardMapSceneSVG(buildStandardMapScene(layout, context));
}

export function renderStandardMapSceneSVG(scene: StandardMapScene): string {
  const {
    width,
    height,
    templateName,
    template,
    themeName,
    theme,
    roads,
    roadLabels,
    landmarks,
    approach,
    destination,
  } = scene;
  const lines = svgDocumentStart({
    width,
    height,
    templateName,
    themeName,
    theme,
  });

  if (template.showFrame) {
    lines.push(
      `<rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="${theme.frame}" stroke-width="1"/>`,
    );
  }

  for (const [index, landmark] of landmarks.entries()) {
    if (!landmark.leader) continue;
    const marker = markerStyle(landmark.lm.category, theme);
    lines.push(
      `<line data-landmark-leader="${index}" x1="${landmark.leader.start.x.toFixed(1)}" y1="${landmark.leader.start.y.toFixed(1)}" x2="${landmark.leader.end.x.toFixed(1)}" y2="${landmark.leader.end.y.toFixed(1)}" stroke="${marker.color}" stroke-width="1.25" stroke-linecap="round"/>`,
    );
  }

  for (const road of roads) {
    const style = roadStyle(road.source.class, template, theme);
    lines.push(
      `<path data-road-layer="casing" d="${road.path}" data-road-geometry="${template.roadGeometry}" fill="none" stroke="${theme.background}" stroke-width="${style.width + 5 * template.roadScale}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    lines.push(
      `<path data-road-layer="core" d="${road.path}" data-road-geometry="${template.roadGeometry}" fill="none" stroke="${style.color}" stroke-width="${style.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  for (const roadLabel of roadLabels) {
    lines.push(
      labelText(
        roadLabel.label,
        roadLabel.x,
        roadLabel.y,
        10,
        theme.roadLabel,
        600,
        theme.background,
      ),
    );
  }

  if (approach?.segment) {
    const path = `M${approach.segment.x1.toFixed(1)},${approach.segment.y1.toFixed(1)} L${approach.segment.x2.toFixed(1)},${approach.segment.y2.toFixed(1)}`;
    lines.push(...renderApproachPath(path, theme, {
      casingWidth: template.approachCasingWidth,
      coreWidth: template.approachWidth,
    }));
  }

  for (const [index, landmark] of landmarks.entries()) {
    lines.push(...renderLandmarkMarker({
      x: landmark.x,
      y: landmark.y,
      radius: 17,
      category: landmark.lm.category,
      theme,
      data: {
        "landmark-marker": index,
        "anchor-x": landmark.anchorX.toFixed(1),
        "anchor-y": landmark.anchorY.toFixed(1),
        displaced: landmark.displaced,
      },
    }));
    if (!landmark.labelBox.hidden) {
      lines.push(
        labelText(
          landmark.labelLines,
          landmark.labelBox.x + landmark.labelBox.width / 2,
          landmark.labelBox.y + 13,
          11,
          theme.ink,
          500,
          theme.background,
        ),
      );
    }
  }

  lines.push(...renderDestinationMarker({
    x: destination.x,
    y: destination.y,
    label: destination.label,
    callout: destination.callout,
    tailWidth: template.destinationTailWidth,
    template,
    theme,
  }));
  lines.push(renderOsmAttribution(width, height, theme));
  lines.push(`</svg>`);
  return lines.join("\n");
}
