import { describe, it, expect } from "vitest";
import { renderSVG } from "./render.js";
import { createProjection } from "./render/projection.js";
import type { MapLayout } from "./types.js";

describe("renderSVG — focus projection", () => {
  const bbox = { north: 37.51, south: 37.49, east: 127.01, west: 126.99 };
  const CENTER_RE = /<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="13"/;
  const LANDMARK_RE = /<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="17"/;

  const focusLayout: MapLayout = {
    center: { lat: 37.5, lon: 127.0, label: "C" },
    landmarks: [
      { id: "n", name: "근처", lat: 37.502, lon: 127.002, category: "station", importance: 1, tags: {} },
    ],
    roads: [],
    bbox,
  };

  const distanceFromCenter = (svg: string): number => {
    const c = svg.match(CENTER_RE)!;
    const l = svg.match(LANDMARK_RE)!;
    return Math.hypot(Number(l[1]) - Number(c[1]), Number(l[2]) - Number(c[2]));
  };

  it("leaves output identical when focus is off (opt-in, default linear)", () => {
    expect(renderSVG(focusLayout)).toBe(renderSVG(focusLayout, { focus: false }));
  });

  it("keeps the destination fixed at the projection center under focus", () => {
    const off = renderSVG(focusLayout).match(CENTER_RE)!;
    const on = renderSVG(focusLayout, { focus: true }).match(CENTER_RE)!;
    expect(Number(on[1])).toBeCloseTo(Number(off[1]), 5);
    expect(Number(on[2])).toBeCloseTo(Number(off[2]), 5);
  });

  it("magnifies the near field, pushing a near landmark outward from center", () => {
    const svgOn = renderSVG(focusLayout, { focus: true });
    expect(distanceFromCenter(svgOn)).toBeGreaterThan(distanceFromCenter(renderSVG(focusLayout)));
    expect(svgOn).not.toMatch(/NaN/);
  });

  it("bounds far projected points to the focus radius", () => {
    const farLayout: MapLayout = {
      ...focusLayout,
      landmarks: [
        { id: "far", name: "먼 곳", lat: 37.5, lon: 127.06, category: "landmark", importance: 1, tags: {} },
      ],
    };

    const focusRadius = Math.hypot(600, 400) / 2;
    const point = farLayout.landmarks[0];
    const off = createProjection(farLayout, 600, 400).project(point.lat, point.lon);
    const on = createProjection(farLayout, 600, 400, { focus: true }).project(point.lat, point.lon);
    const center = createProjection(farLayout, 600, 400).center;
    expect(Math.hypot(off[0] - center.x, off[1] - center.y)).toBeGreaterThan(focusRadius);
    expect(Math.hypot(on[0] - center.x, on[1] - center.y)).toBeLessThanOrEqual(focusRadius + 0.1);
  });

  it("ignores focus in geographic layout (raw geometry preserved)", () => {
    expect(renderSVG(focusLayout, { layout: "geographic", focus: true })).toBe(
      renderSVG(focusLayout, { layout: "geographic" }),
    );
  });
});
