import { renderSVG } from "./render.js";
import { resolveCanvasSize } from "./render/projection.js";
import type {
  DiagramDocument,
  DiagramOverrides,
  MapLayout,
  RenderOptions,
} from "./types.js";

export interface CreateDiagramDocumentOptions extends RenderOptions {
  overrides?: DiagramOverrides;
}

export function createDiagramDocument(
  map: MapLayout,
  options: CreateDiagramDocumentOptions = {},
): DiagramDocument {
  const canvas = resolveCanvasSize(options);
  return {
    version: 1,
    map: cloneMap(map),
    canvas,
    render: {
      layout: options.layout ?? "diagram",
      template: options.template ?? options.preset ?? "standard",
      theme: options.theme ?? "paper",
      focus: options.focus ?? false,
    },
    overrides: cloneOverrides(options.overrides ?? {}),
  };
}

export function applyDiagramOverrides(
  map: MapLayout,
  overrides: DiagramOverrides,
): MapLayout {
  const destinationLabel = overrides.destination?.label;
  return {
    center: {
      ...map.center,
      label: destinationLabel ?? map.center.label,
    },
    landmarks: map.landmarks.flatMap((landmark) => {
      const override = overrides.landmarks?.[landmark.id];
      if (override?.hidden) return [];
      return [{
        ...landmark,
        name: override?.label ?? landmark.name,
        tags: { ...landmark.tags },
      }];
    }),
    roads: map.roads.flatMap((road) => {
      const override = overrides.roads?.[road.id];
      if (override?.hidden) return [];
      return [{
        ...road,
        name: override?.label ?? road.name,
        points: road.points.map((point) => ({ ...point })),
      }];
    }),
    bbox: { ...map.bbox },
  };
}

export function renderDiagramDocument(document: DiagramDocument): string {
  if (document.version !== 1) {
    throw new Error(`Unsupported DiagramDocument version: ${String(document.version)}`);
  }
  const map = applyDiagramOverrides(document.map, document.overrides);
  const landmarkPositions = Object.fromEntries(
    Object.entries(document.overrides.landmarks ?? {})
      .filter((entry): entry is [string, { position: { x: number; y: number } }] =>
        entry[1].position !== undefined,
      )
      .map(([id, override]) => [id, { ...override.position }]),
  );
  return renderSVG(map, {
    width: document.canvas.width,
    height: document.canvas.height,
    layout: document.render.layout,
    template: document.render.template,
    theme: document.render.theme,
    focus: document.render.focus,
    landmarkPositions,
  });
}

function cloneMap(map: MapLayout): MapLayout {
  return {
    center: { ...map.center },
    landmarks: map.landmarks.map((landmark) => ({
      ...landmark,
      tags: { ...landmark.tags },
    })),
    roads: map.roads.map((road) => ({
      ...road,
      points: road.points.map((point) => ({ ...point })),
    })),
    bbox: { ...map.bbox },
  };
}

function cloneOverrides(overrides: DiagramOverrides): DiagramOverrides {
  return {
    destination: overrides.destination ? { ...overrides.destination } : undefined,
    landmarks: overrides.landmarks
      ? Object.fromEntries(
          Object.entries(overrides.landmarks).map(([id, override]) => [
            id,
            {
              ...override,
              position: override.position ? { ...override.position } : undefined,
            },
          ]),
        )
      : undefined,
    roads: overrides.roads
      ? Object.fromEntries(
          Object.entries(overrides.roads).map(([id, override]) => [id, { ...override }]),
        )
      : undefined,
  };
}
