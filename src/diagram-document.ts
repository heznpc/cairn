import { renderSVG } from "./render.js";
import { resolveCanvasSize } from "./render/projection.js";
export {
  parseDiagramDocument,
  parseDiagramDocumentPatch,
} from "./diagram-schema.js";
import type {
  DiagramDocument,
  DiagramDocumentPatch,
  DiagramOverrides,
  LandmarkOverride,
  MapLayout,
  RenderOptions,
  RoadOverride,
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
      ...(options.approachLandmarkId
        ? { approachLandmarkId: options.approachLandmarkId }
        : {}),
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
  const approachLandmarkId = document.render.approachLandmarkId;
  if (approachLandmarkId) {
    if (!document.map.landmarks.some((landmark) => landmark.id === approachLandmarkId)) {
      throw new Error(`Unknown approach landmark id: ${approachLandmarkId}`);
    }
    if (document.overrides.landmarks?.[approachLandmarkId]?.hidden) {
      throw new Error(`Approach landmark is hidden: ${approachLandmarkId}`);
    }
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
    approachLandmarkId,
    landmarkPositions,
  });
}

export function applyDiagramDocumentPatch(
  document: DiagramDocument,
  patch: DiagramDocumentPatch,
): DiagramDocument {
  const next = cloneDocument(document);
  const landmarkIds = new Set(next.map.landmarks.map((landmark) => landmark.id));

  if (patch.canvas) {
    next.canvas = resolveCanvasSize({
      width: patch.canvas.width ?? next.canvas.width,
      height: patch.canvas.height ?? next.canvas.height,
    });
  }
  if (patch.render) {
    const { approachLandmarkId, ...renderPatch } = patch.render;
    next.render = { ...next.render, ...renderPatch };
    if (approachLandmarkId !== undefined) {
      if (approachLandmarkId === null) delete next.render.approachLandmarkId;
      else {
        if (!landmarkIds.has(approachLandmarkId)) {
          throw new Error(`Unknown approach landmark id: ${approachLandmarkId}`);
        }
        next.render.approachLandmarkId = approachLandmarkId;
      }
    }
  }
  if (patch.destinationLabel !== undefined) {
    if (patch.destinationLabel === null) {
      delete next.overrides.destination;
    } else {
      next.overrides.destination = { label: patch.destinationLabel };
    }
  }

  for (const [id, overridePatch] of Object.entries(patch.landmarks ?? {})) {
    if (!landmarkIds.has(id)) throw new Error(`Unknown landmark id: ${id}`);
    next.overrides.landmarks ??= {};
    const merged = mergeLandmarkOverride(next.overrides.landmarks[id], overridePatch);
    if (Object.keys(merged).length === 0) delete next.overrides.landmarks[id];
    else next.overrides.landmarks[id] = merged;
  }
  if (next.overrides.landmarks && Object.keys(next.overrides.landmarks).length === 0) {
    delete next.overrides.landmarks;
  }

  const roadIds = new Set(next.map.roads.map((road) => road.id));
  for (const [id, overridePatch] of Object.entries(patch.roads ?? {})) {
    if (!roadIds.has(id)) throw new Error(`Unknown road id: ${id}`);
    next.overrides.roads ??= {};
    const merged = mergeRoadOverride(next.overrides.roads[id], overridePatch);
    if (Object.keys(merged).length === 0) delete next.overrides.roads[id];
    else next.overrides.roads[id] = merged;
  }
  if (next.overrides.roads && Object.keys(next.overrides.roads).length === 0) {
    delete next.overrides.roads;
  }

  if (
    next.render.approachLandmarkId &&
    next.overrides.landmarks?.[next.render.approachLandmarkId]?.hidden
  ) {
    throw new Error(`Approach landmark is hidden: ${next.render.approachLandmarkId}`);
  }

  return next;
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

function cloneDocument(document: DiagramDocument): DiagramDocument {
  return {
    version: 1,
    map: cloneMap(document.map),
    canvas: { ...document.canvas },
    render: { ...document.render },
    overrides: cloneOverrides(document.overrides),
  };
}

function mergeLandmarkOverride(
  current: LandmarkOverride | undefined,
  patch: NonNullable<DiagramDocumentPatch["landmarks"]>[string],
): LandmarkOverride {
  const merged: LandmarkOverride = {
    ...current,
    position: current?.position ? { ...current.position } : undefined,
  };
  applyClearable(merged, "hidden", patch.hidden);
  applyClearable(merged, "label", patch.label);
  applyClearable(merged, "locked", patch.locked);
  if (patch.position !== undefined) {
    if (patch.position === null) delete merged.position;
    else merged.position = { ...patch.position };
  }
  return removeUndefined(merged);
}

function mergeRoadOverride(
  current: RoadOverride | undefined,
  patch: NonNullable<DiagramDocumentPatch["roads"]>[string],
): RoadOverride {
  const merged: RoadOverride = { ...current };
  applyClearable(merged, "hidden", patch.hidden);
  applyClearable(merged, "label", patch.label);
  return removeUndefined(merged);
}

function applyClearable<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | null | undefined,
): void {
  if (value === undefined) return;
  if (value === null) delete target[key];
  else target[key] = value;
}

function removeUndefined<T extends object>(value: T): T {
  for (const key of Object.keys(value) as Array<keyof T>) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
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
