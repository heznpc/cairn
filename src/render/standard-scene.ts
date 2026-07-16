import type {
  MapLayout,
  NormalizedPosition,
  RenderLayoutMode,
  RenderTemplate,
  RenderTheme,
} from "../types.js";
import { selectApproachLandmark } from "./approach.js";
import { buildApproachRoute } from "./approach-route.js";
import {
  pickCenterCallout,
  placeLandmarkLabels,
  type LabelBox,
  type ProjectedLandmark,
} from "./label-layout.js";
import {
  markerLeaderSegment,
  placeLandmarkMarkers,
  roadMarkerCorridors,
} from "./marker-layout.js";
import {
  pointsToPathData,
  roadObstacleBoxes,
  roadPathPoints,
  selectDisplayRoads,
  selectGeographicRoads,
  roadLabelPositions,
  type Point,
} from "./road-layout.js";
import type { TemplateSpec, ThemeSpec } from "./theme.js";
import {
  type CenterCallout,
  type Box,
  textBoxWidth,
  truncateLabel,
  wrapLandmarkLabel,
} from "./text.js";
import type { Projector } from "./projection.js";

const ROAD_LABEL_MAX = 12;
const CENTER_LABEL_MAX = 12;
const TRANSIT_CLUSTER_DISTANCE_PX = 72;

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
  approachLandmarkId?: string;
}

export interface StandardSceneRoad {
  source: MapLayout["roads"][number];
  points: Point[];
  path: string;
}

export interface StandardSceneRoadLabel {
  label: string;
  x: number;
  y: number;
}

export interface StandardSceneLandmark extends ProjectedLandmark {
  labelBox: LabelBox;
  leader: ReturnType<typeof markerLeaderSegment>;
}

export interface StandardMapScene {
  width: number;
  height: number;
  templateName: RenderTemplate;
  template: TemplateSpec;
  themeName: RenderTheme;
  theme: ThemeSpec;
  renderLayout: RenderLayoutMode;
  roads: StandardSceneRoad[];
  roadLabels: StandardSceneRoadLabel[];
  landmarks: StandardSceneLandmark[];
  approach: {
    landmarkId: string;
    mode: "inferred-road" | "direct";
    points: Point[] | null;
  } | null;
  destination: {
    x: number;
    y: number;
    label: string;
    callout: CenterCallout;
  };
}

export function buildStandardMapScene(
  layout: MapLayout,
  ctx: StandardMapRenderContext,
): StandardMapScene {
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
    approachLandmarkId,
  } = ctx;
  const sourceRoads = layout.roads ?? [];
  const displayRoads = renderLayout === "geographic"
    ? selectGeographicRoads(sourceRoads, project, width, height)
    : selectDisplayRoads(
        sourceRoads,
        project,
        width,
        height,
        { x: cx, y: cy },
        template.maxVisibleRoads,
      );
  const skeletonRoads = template.showRoadSkeleton ? displayRoads : [];
  const sceneRoads = skeletonRoads.flatMap((road) => {
    const points = roadPathPoints(
      road,
      project,
      renderLayout,
      width,
      height,
      template.roadGeometry,
    );
    return points ? [{ source: road, points, path: pointsToPathData(points) }] : [];
  });
  const selectedLandmarks = selectTemplateLandmarks(
    layout.landmarks,
    template,
    approachLandmarkId,
  );
  const landmarks = renderLayout === "diagram"
    ? coalesceTransitCluster(selectedLandmarks, project, approachLandmarkId)
    : selectedLandmarks;
  const rawProjectedLandmarks = landmarks.map((landmark) => {
    const [anchorX, anchorY] = project(landmark.lat, landmark.lon);
    const labelLines = wrapLandmarkLabel(landmark.name, template.landmarkLabelMax);
    const labelWidth = Math.max(...labelLines.map((line) => textBoxWidth(line, 11, 20)));
    const manualPosition = landmarkPositions?.[landmark.id];
    return {
      lm: landmark,
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
      labelHidden: landmark.importance < template.labelImportanceMin,
    };
  });

  const roadLabelEntries = template.showRoadLabels
    ? [...roadLabelPositions(skeletonRoads, project, width, height)].map(([name, position]) => ({
        label: truncateLabel(name, ROAD_LABEL_MAX),
        ...position,
      }))
    : [];
  const roadLabelObstacles: Box[] = roadLabelEntries.map(({ label, x, y }) => {
    const boxWidth = textBoxWidth(label, 10, 14);
    return { x: x - boxWidth / 2, y: y - 9, width: boxWidth, height: 16 };
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
      importance: lm.id === approachLandmarkId ? 2 : lm.importance,
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
  const approachLandmark = renderLayout === "diagram"
    ? selectApproachLandmark(
        projectedLandmarks.map((landmark) => ({
          value: landmark,
          id: landmark.lm.id,
          category: landmark.lm.category,
          importance: landmark.lm.importance,
          distance: Math.hypot(landmark.x - cx, landmark.y - cy),
        })),
        {
          explicitId: approachLandmarkId,
          minimumDistance: 48,
          missingExplicitMessage: (id) => `Could not place approach landmark: ${id}`,
        },
      )
    : null;
  const approachRoute = approachLandmark
    ? buildApproachRoute({
        start: { x: approachLandmark.x, y: approachLandmark.y },
        startAnchor: { x: approachLandmark.anchorX, y: approachLandmark.anchorY },
        destination: { x: cx, y: cy },
        roads: sceneRoads.map((road) => road.points),
        startTrim: template.approachStartTrim,
        endTrim: template.approachEndTrim,
      })
    : null;
  const approachObstacles = approachRoute
    ? polylineObstacleBoxes(approachRoute.points, template.approachCasingWidth / 2 + 4)
    : [];
  const landmarkMarkerBoxes = projectedLandmarks.map(({ x, y }) => ({
    x: x - 23,
    y: y - 23,
    width: 46,
    height: 46,
  }));
  const roadObstacles = renderLayout === "diagram" && template.avoidRoadLabels
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
      ...approachObstacles,
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
    [
      ...landmarkMarkerBoxes,
      ...landmarkLabelBoxes,
      ...roadObstacles,
      ...roadLabelObstacles,
      ...approachObstacles,
    ],
  );
  const sceneLandmarks = projectedLandmarks.map((landmark, index) => ({
    ...landmark,
    labelBox: landmarkLabelBoxes[index],
    leader: markerLeaderSegment({
      anchorX: landmark.anchorX,
      anchorY: landmark.anchorY,
      x: landmark.x,
      y: landmark.y,
      importance: landmark.lm.importance,
      displaced: landmark.displaced,
    }),
  }));

  return {
    width,
    height,
    templateName,
    template,
    themeName,
    theme,
    renderLayout,
    roads: sceneRoads,
    roadLabels: roadLabelEntries,
    landmarks: sceneLandmarks,
    approach: approachLandmark
      ? {
          landmarkId: approachLandmark.lm.id,
          mode: approachRoute?.mode ?? "direct",
          points: approachRoute?.points ?? null,
        }
      : null,
    destination: { x: cx, y: cy, label: centerLabel, callout: centerCallout },
  };
}

function coalesceTransitCluster(
  landmarks: MapLayout["landmarks"],
  project: Projector,
  approachLandmarkId?: string,
): MapLayout["landmarks"] {
  const suppressed = new Set<string>();
  const claimedExits = new Set<string>();
  const replacements = new Map<string, MapLayout["landmarks"][number]>();
  const stations = landmarks.filter((landmark) => landmark.category === "station");
  const exits = landmarks.filter((landmark) => landmark.category === "station_exit");

  for (const station of stations) {
    const [stationX, stationY] = project(station.lat, station.lon);
    const nearbyExits = exits.filter((exit) => {
      if (claimedExits.has(exit.id) || suppressed.has(exit.id)) return false;
      const [exitX, exitY] = project(exit.lat, exit.lon);
      return Math.hypot(exitX - stationX, exitY - stationY) <= TRANSIT_CLUSTER_DISTANCE_PX;
    });
    if (nearbyExits.length === 0) continue;

    if (approachLandmarkId === station.id) {
      for (const exit of nearbyExits) suppressed.add(exit.id);
      continue;
    }

    const preferredExit = nearbyExits.find((exit) => exit.id === approachLandmarkId)
      ?? [...nearbyExits].sort((a, b) => b.importance - a.importance)[0];
    claimedExits.add(preferredExit.id);
    suppressed.add(station.id);
    for (const exit of nearbyExits) {
      if (exit.id !== preferredExit.id) suppressed.add(exit.id);
    }
    replacements.set(preferredExit.id, {
      ...preferredExit,
      name: mergedTransitLabel(station.name, preferredExit.name),
    });
  }

  return landmarks
    .filter((landmark) => !suppressed.has(landmark.id))
    .map((landmark) => replacements.get(landmark.id) ?? landmark);
}

function mergedTransitLabel(stationName: string, exitName: string): string {
  const station = stationName.trim();
  const exit = exitName.trim();
  if (!station) return exit;
  if (!exit || exit.includes(station)) return exit || station;
  return `${station} ${exit}`;
}

function polylineObstacleBoxes(points: readonly Point[], radius: number): Box[] {
  const boxes: Box[] = [];
  for (let segmentIndex = 1; segmentIndex < points.length; segmentIndex++) {
    const start = points[segmentIndex - 1];
    const end = points[segmentIndex];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(length / Math.max(8, radius * 1.5)));
    for (let index = 0; index <= steps; index++) {
      const progress = index / steps;
      const x = start.x + (end.x - start.x) * progress;
      const y = start.y + (end.y - start.y) * progress;
      boxes.push({ x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 });
    }
  }
  return boxes;
}

function selectTemplateLandmarks(
  landmarks: MapLayout["landmarks"],
  template: TemplateSpec,
  approachLandmarkId?: string,
): MapLayout["landmarks"] {
  const preferred = template.preferredCategories
    ? landmarks.filter((landmark) => template.preferredCategories!.has(landmark.category))
    : [];
  const filtered = preferred.length > 0 ? preferred : landmarks;
  const selected = filtered.slice(0, template.maxLandmarks);
  if (!approachLandmarkId || selected.some((landmark) => landmark.id === approachLandmarkId)) {
    return selected;
  }
  const approach = landmarks.find((landmark) => landmark.id === approachLandmarkId);
  if (!approach) throw new Error(`Unknown approach landmark id: ${approachLandmarkId}`);
  return [approach, ...selected.filter((landmark) => landmark.id !== approach.id)]
    .slice(0, template.maxLandmarks);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
