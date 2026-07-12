import type {
  MapLayout,
  NormalizedPosition,
  RenderLayoutMode,
  RenderTemplate,
  RenderTheme,
} from "../types.js";
import { selectApproachLandmark } from "./approach.js";
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
  roadObstacleBoxes,
  roadPathData,
  selectDisplayRoads,
  selectGeographicRoads,
  roadLabelPositions,
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

export interface StandardSceneSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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
    segment: StandardSceneSegment | null;
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
  const landmarks = selectTemplateLandmarks(
    layout.landmarks,
    template,
    approachLandmarkId,
  );
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
    [...landmarkMarkerBoxes, ...landmarkLabelBoxes, ...roadObstacles, ...roadLabelObstacles],
  );
  const sceneRoads = skeletonRoads.flatMap((road) => {
    const path = roadPathData(
      road,
      project,
      renderLayout,
      width,
      height,
      template.roadGeometry,
    );
    return path ? [{ source: road, path }] : [];
  });
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
          segment: trimSegment(
            approachLandmark.x,
            approachLandmark.y,
            cx,
            cy,
            template.approachStartTrim,
            template.approachEndTrim,
          ),
        }
      : null,
    destination: { x: cx, y: cy, label: centerLabel, callout: centerCallout },
  };
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

function trimSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  startTrim: number,
  endTrim: number,
): StandardSceneSegment | null {
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
