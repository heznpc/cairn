import { describe, expect, it } from "vitest";
import type { Road } from "../types.js";
import {
  clipSegment,
  diagramRoadSpine,
  roadLabelPositions,
  roadPathData,
  selectDisplayRoads,
  selectGeographicRoads,
} from "./road-layout.js";

const WIDTH = 200;
const HEIGHT = 200;
const project = (lat: number, lon: number): [number, number] => [lon, lat];

function road(
  id: string,
  roadClass: Road["class"],
  points: Road["points"],
  name = id,
): Road {
  return { id, name, class: roadClass, points };
}

describe("road layout", () => {
  it("clips line segments to a rectangular viewBox", () => {
    expect(clipSegment(-10, 50, 110, 50, 0, 0, 100, 100)).toEqual([
      [0, 50],
      [100, 50],
    ]);
    expect(clipSegment(-10, -10, -5, -5, 0, 0, 100, 100)).toBeNull();
  });

  it("turns the longest clipped run into a diagram spine", () => {
    const spine = diagramRoadSpine(
      road("main", "primary", [
        { lat: 100, lon: -40 },
        { lat: 100, lon: 240 },
      ]),
      project,
      WIDTH,
      HEIGHT,
    );

    expect(spine).not.toBeNull();
    expect(spine!.start).toEqual({ x: 16, y: 100 });
    expect(spine!.end).toEqual({ x: 184, y: 100 });
    expect(spine!.length).toBeCloseTo(168);
  });

  it("keeps raw geometry in geographic paths and simplifies diagram paths", () => {
    const kinked = road("kinked", "primary", [
      { lat: 40, lon: 20 },
      { lat: 120, lon: 80 },
      { lat: 160, lon: 180 },
    ]);

    expect(roadPathData(kinked, project, "geographic", WIDTH, HEIGHT)).toBe(
      "M20.0,40.0 L80.0,120.0 L180.0,160.0",
    );
    expect(roadPathData(kinked, project, "diagram", WIDTH, HEIGHT)).toBe(
      "M20.0,40.0 L180.0,160.0",
    );
  });

  it("selects a readable diagram road skeleton around the destination", () => {
    const roads = [
      road("primary", "primary", [
        { lat: 100, lon: 10 },
        { lat: 100, lon: 190 },
      ]),
      road("secondary", "secondary", [
        { lat: 10, lon: 100 },
        { lat: 190, lon: 100 },
      ]),
      road("tertiary", "tertiary", [
        { lat: 130, lon: 10 },
        { lat: 130, lon: 190 },
      ]),
      road("residential", "residential", [
        { lat: 80, lon: 10 },
        { lat: 80, lon: 190 },
      ]),
    ];

    const picked = selectDisplayRoads(roads, project, WIDTH, HEIGHT, { x: 100, y: 100 }, 3);

    expect(picked.map((item) => item.id)).toEqual(["primary", "secondary", "tertiary"]);
  });

  it("caps geographic road count while preserving original order for ties", () => {
    const roads = Array.from({ length: 90 }, (_, index) =>
      road(`road-${index}`, "residential", [
        { lat: index, lon: 0 },
        { lat: index, lon: 200 },
      ]),
    );

    const picked = selectGeographicRoads(roads, project, WIDTH, HEIGHT);

    expect(picked).toHaveLength(80);
    expect(picked.map((item) => item.id)).toEqual(roads.slice(0, 80).map((item) => item.id));
  });

  it("caps geographic vertex budget for heavy road geometry", () => {
    const roads = Array.from({ length: 40 }, (_, index) =>
      road(
        `road-${index}`,
        "residential",
        Array.from({ length: 200 }, (_, pointIndex) => ({
          lat: index + pointIndex * 0.01,
          lon: pointIndex,
        })),
      ),
    );

    const picked = selectGeographicRoads(roads, project, WIDTH, HEIGHT);
    const totalPoints = picked.reduce((sum, item) => sum + item.points.length, 0);

    expect(picked.length).toBeLessThan(40);
    expect(totalPoints).toBeLessThanOrEqual(3000);
  });

  it("places each road name at the longest visible segment midpoint", () => {
    const positions = roadLabelPositions(
      [
        road("short", "primary", [
          { lat: 60, lon: 80 },
          { lat: 60, lon: 120 },
        ], "Main"),
        road("long", "primary", [
          { lat: 100, lon: -20 },
          { lat: 100, lon: 220 },
        ], "Main"),
        road("alley", "residential", [
          { lat: 120, lon: 0 },
          { lat: 120, lon: 200 },
        ], "Alley"),
      ],
      project,
      WIDTH,
      HEIGHT,
    );

    expect([...positions.keys()]).toEqual(["Main"]);
    expect(positions.get("Main")).toEqual({ x: 100, y: 100 });
  });
});
