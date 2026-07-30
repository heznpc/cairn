import { describe, expect, it } from "vitest";
import { createProjection } from "./projection.js";
import type { MapLayout } from "../types.js";

// Oslo latitude: a degree of longitude covers about half the ground a degree of
// latitude does, so this is where an uncorrected projection distorts worst.
const HIGH_LATITUDE = 60;

function layoutAt(lat: number, lon: number, dLat: number, dLon: number): MapLayout {
  return {
    center: { lat, lon, label: "Here" },
    landmarks: [],
    roads: [],
    bbox: {
      north: lat + dLat,
      south: lat - dLat,
      east: lon + dLon,
      west: lon - dLon,
    },
  };
}

describe("createProjection", () => {
  it("maps equal ground distances to equal pixel distances", () => {
    const layout = layoutAt(HIGH_LATITUDE, 10, 0.01, 0.01);
    const { project } = createProjection(layout, 600, 400);

    // Same ground distance north-south and east-west, expressed in degrees.
    const dLat = 0.002;
    const dLon = dLat / Math.cos((HIGH_LATITUDE * Math.PI) / 180);

    const [originX, originY] = project(HIGH_LATITUDE, 10);
    const [, northY] = project(HIGH_LATITUDE + dLat, 10);
    const [eastX] = project(HIGH_LATITUDE, 10 + dLon);

    expect(Math.abs(eastX - originX)).toBeCloseTo(Math.abs(northY - originY), 6);
  });

  it("keeps the aspect ratio of the ground extent, not of the canvas", () => {
    // A bbox that is square in degrees is *wider than tall* in degrees but
    // taller than wide on the ground at this latitude. The projection must
    // reflect the ground, so the plotted extent is narrower than it is tall.
    const layout = layoutAt(HIGH_LATITUDE, 10, 0.01, 0.01);
    const { project } = createProjection(layout, 600, 400);

    const [westX, northY] = project(layout.bbox.north, layout.bbox.west);
    const [eastX, southY] = project(layout.bbox.south, layout.bbox.east);

    const plottedWidth = eastX - westX;
    const plottedHeight = southY - northY;
    const groundRatio = Math.cos((HIGH_LATITUDE * Math.PI) / 180);

    expect(plottedWidth / plottedHeight).toBeCloseTo(groundRatio, 6);
  });

  it("fits the ground extent inside the canvas and centers the destination", () => {
    const layout = layoutAt(HIGH_LATITUDE, 10, 0.01, 0.01);
    const width = 600;
    const height = 400;
    const { project, center } = createProjection(layout, width, height);

    for (const [lat, lon] of [
      [layout.bbox.north, layout.bbox.west],
      [layout.bbox.north, layout.bbox.east],
      [layout.bbox.south, layout.bbox.west],
      [layout.bbox.south, layout.bbox.east],
    ]) {
      const [x, y] = project(lat, lon);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
    }

    // The destination sits at the bbox center, so it lands at the canvas center.
    expect(center.x).toBeCloseTo(width / 2, 6);
    expect(center.y).toBeCloseTo(height / 2, 6);
  });

  it("preserves ground proportions near the equator too", () => {
    const layout = layoutAt(0, 0, 0.01, 0.01);
    const { project } = createProjection(layout, 600, 400);

    const [westX, northY] = project(layout.bbox.north, layout.bbox.west);
    const [eastX, southY] = project(layout.bbox.south, layout.bbox.east);

    // cos(0) = 1, so a degree-square bbox really is square on the ground.
    expect(eastX - westX).toBeCloseTo(southY - northY, 6);
  });
});
