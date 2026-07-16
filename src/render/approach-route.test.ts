import { describe, expect, it } from "vitest";
import { buildApproachRoute, polylineLength } from "./approach-route.js";

describe("buildApproachRoute", () => {
  it("routes through intersections of the visible road axes", () => {
    const route = buildApproachRoute({
      start: { x: 0, y: -20 },
      startAnchor: { x: 0, y: 0 },
      destination: { x: 0, y: 120 },
      roads: [
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        [{ x: 100, y: 0 }, { x: 100, y: 100 }],
        [{ x: 100, y: 100 }, { x: 0, y: 100 }],
      ],
      startTrim: 5,
      endTrim: 5,
    });

    expect(route).not.toBeNull();
    expect(route?.mode).toBe("inferred-road");
    expect(route?.points).toContainEqual({ x: 100, y: 0 });
    expect(route?.points).toContainEqual({ x: 100, y: 100 });
    expect(polylineLength(route!.points)).toBeGreaterThan(200);
  });

  it("falls back to a direct cue when road axes are disconnected", () => {
    const route = buildApproachRoute({
      start: { x: 0, y: 0 },
      destination: { x: 100, y: 0 },
      roads: [
        [{ x: 0, y: 20 }, { x: 30, y: 20 }],
        [{ x: 70, y: 20 }, { x: 100, y: 20 }],
      ],
      startTrim: 10,
      endTrim: 10,
    });

    expect(route).toEqual({
      mode: "direct",
      points: [{ x: 10, y: 0 }, { x: 90, y: 0 }],
    });
  });

  it("omits a cue that cannot remain legible after trimming", () => {
    expect(buildApproachRoute({
      start: { x: 0, y: 0 },
      destination: { x: 20, y: 0 },
      roads: [],
      startTrim: 8,
      endTrim: 8,
    })).toBeNull();
  });
});
