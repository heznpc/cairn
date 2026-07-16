import { describe, expect, it } from "vitest";
import { baseRenderLayout } from "../../test/fixtures/render.js";
import { createProjection } from "./projection.js";
import {
  buildStandardMapScene,
  type StandardMapRenderContext,
} from "./standard-scene.js";
import { TEMPLATES, THEMES } from "./theme.js";

function renderContext(
  overrides: Partial<StandardMapRenderContext> = {},
): StandardMapRenderContext {
  const width = overrides.width ?? 600;
  const height = overrides.height ?? 400;
  const projection = createProjection(baseRenderLayout, width, height, { layout: "diagram" });
  return {
    width,
    height,
    templateName: "standard",
    template: TEMPLATES.standard,
    themeName: "paper",
    theme: THEMES.paper,
    renderLayout: "diagram",
    project: projection.project,
    center: projection.center,
    ...overrides,
  };
}

describe("buildStandardMapScene", () => {
  it("exposes layout decisions without parsing SVG", () => {
    const context = renderContext();
    const scene = buildStandardMapScene(baseRenderLayout, context);

    expect(scene.destination).toMatchObject({
      x: context.center.x,
      y: context.center.y,
      label: "여기",
    });
    expect(scene.destination.callout.width).toBeGreaterThan(0);
    expect(scene.landmarks.map((landmark) => landmark.lm.id)).toEqual(["1", "2"]);
    expect(scene.landmarks.every((landmark) => landmark.labelBox.width >= 0)).toBe(true);
    expect(scene.approach?.landmarkId).toBe("1");
    expect(scene.approach?.points).not.toBeNull();
  });

  it("applies editor positions and explicit approach selection in the scene", () => {
    const scene = buildStandardMapScene(baseRenderLayout, renderContext({
      landmarkPositions: { "2": { x: 0.1, y: 0.8 } },
      approachLandmarkId: "2",
    }));
    const cafe = scene.landmarks.find((landmark) => landmark.lm.id === "2");

    expect(cafe).toMatchObject({ x: 60, y: 320, displaced: true });
    expect(scene.approach?.landmarkId).toBe("2");
  });

  it("materializes selected road geometry as scene paths", () => {
    const layout = {
      ...baseRenderLayout,
      roads: [{
        id: "main",
        name: "테헤란로",
        class: "primary" as const,
        points: [
          { lat: 37.5, lon: 126.999 },
          { lat: 37.5, lon: 127.001 },
        ],
      }],
    };
    const projection = createProjection(layout, 600, 400, { layout: "diagram" });
    const scene = buildStandardMapScene(layout, renderContext({
      project: projection.project,
      center: projection.center,
    }));

    expect(scene.roads).toHaveLength(1);
    expect(scene.roads[0].source.id).toBe("main");
    expect(scene.roads[0].path).toMatch(/^M/);
    expect(scene.roadLabels[0].label).toBe("테헤란로");
  });

  it("coalesces a nearby station and exit into one actionable transit marker", () => {
    const layout = {
      ...baseRenderLayout,
      landmarks: [
        {
          id: "exit-7",
          name: "7번 출구",
          lat: 37.50055,
          lon: 127.00045,
          category: "station_exit" as const,
          importance: 0.95,
          tags: { ref: "7" },
        },
        {
          id: "station",
          name: "역삼역",
          lat: 37.50045,
          lon: 127.00055,
          category: "station" as const,
          importance: 1,
          tags: {},
        },
        baseRenderLayout.landmarks[1],
      ],
    };
    const projection = createProjection(layout, 600, 400, { layout: "diagram" });
    const scene = buildStandardMapScene(layout, renderContext({
      project: projection.project,
      center: projection.center,
    }));
    const exit = scene.landmarks.find((landmark) => landmark.lm.id === "exit-7");

    expect(scene.landmarks.map((landmark) => landmark.lm.id)).toEqual(["exit-7", "2"]);
    expect(exit?.lm.name).toBe("역삼역 7번 출구");
    expect(scene.approach?.landmarkId).toBe("exit-7");
    expect(scene.approach?.points).not.toBeNull();
    expect(polylineIntersectsBox(scene.approach!.points!, exit!.labelBox)).toBe(false);
  });

  it("preserves an explicitly selected station while coalescing its exits", () => {
    const layout = {
      ...baseRenderLayout,
      landmarks: [
        {
          id: "exit-7",
          name: "7번 출구",
          lat: 37.50055,
          lon: 127.00045,
          category: "station_exit" as const,
          importance: 0.95,
          tags: {},
        },
        baseRenderLayout.landmarks[0],
      ],
    };
    const projection = createProjection(layout, 600, 400, { layout: "diagram" });
    const scene = buildStandardMapScene(layout, renderContext({
      project: projection.project,
      center: projection.center,
      approachLandmarkId: "1",
    }));

    expect(scene.landmarks.map((landmark) => landmark.lm.id)).toEqual(["1"]);
    expect(scene.approach?.landmarkId).toBe("1");
  });
});

function polylineIntersectsBox(
  points: Array<{ x: number; y: number }>,
  box: { x: number; y: number; width: number; height: number },
): boolean {
  for (let segmentIndex = 1; segmentIndex < points.length; segmentIndex++) {
    const start = points[segmentIndex - 1];
    const end = points[segmentIndex];
    for (let index = 0; index <= 20; index++) {
      const progress = index / 20;
      const x = start.x + (end.x - start.x) * progress;
      const y = start.y + (end.y - start.y) * progress;
      if (
        x >= box.x && x <= box.x + box.width &&
        y >= box.y && y <= box.y + box.height
      ) {
        return true;
      }
    }
  }
  return false;
}
