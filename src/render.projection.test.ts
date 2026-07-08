import { describe, it, expect } from "vitest";
import { renderSVG } from "./render.js";
import type { MapLayout } from "./types.js";

// Projection regression coverage — the basic render tests count circles and
// check that text is present, but say nothing about where each circle lands.
describe("renderSVG — projection", () => {
  // Center marker uses r="13", landmarks use r="17" — that's how we distinguish.
  const CENTER_RE = /<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="13"/;
  const LANDMARK_RE = /<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="17"/g;

  // 0.02° bbox in each axis, destination at the exact center.
  // With default width=600 / height=400 and the 50px margin baked into projection.ts,
  // (lat=37.5, lon=127.0) must land at (cx=300, cy=200).
  const bbox = { north: 37.51, south: 37.49, east: 127.01, west: 126.99 };

  function projectionLayout(
    landmarks: MapLayout["landmarks"] = [],
    roads: MapLayout["roads"] = [],
  ): MapLayout {
    return {
      center: { lat: 37.5, lon: 127.0, label: "C" },
      landmarks,
      roads,
      bbox,
    };
  }

  it("places the destination at the SVG center when it is the bbox center", () => {
    const svg = renderSVG(projectionLayout());
    const m = svg.match(CENTER_RE);
    expect(m, "center marker missing").not.toBeNull();
    expect(Number(m![1])).toBeCloseTo(300, 5);
    expect(Number(m![2])).toBeCloseTo(200, 5);
  });

  it("respects width and height when projecting the center", () => {
    const svg = renderSVG(projectionLayout(), { width: 800, height: 600 });
    const m = svg.match(CENTER_RE);
    // With width=800, height=600: cx=(800-100)/2+50=400, cy=(600-100)/2+50=300.
    expect(Number(m![1])).toBeCloseTo(400, 5);
    expect(Number(m![2])).toBeCloseTo(300, 5);
  });

  it("survives a degenerate (zero-span) bbox via the 1e-6 fallback", () => {
    // Production hits this when a layout has one landmark co-located with the
    // destination (single-POI rendering), or when padLat/padLon cancel out.
    const collapsed: MapLayout = {
      center: { lat: 37.5, lon: 127.0, label: "C" },
      landmarks: [],
      roads: [],
      bbox: { north: 37.5, south: 37.5, east: 127.0, west: 127.0 },
    };
    const svg = renderSVG(collapsed);
    const m = svg.match(CENTER_RE);
    expect(m, "center marker missing on degenerate bbox").not.toBeNull();
    expect(Number.isFinite(Number(m![1])), "cx must be finite").toBe(true);
    expect(Number.isFinite(Number(m![2])), "cy must be finite").toBe(true);
    expect(svg).not.toMatch(/NaN/);
  });

  it("places north-of-center above and east-of-center to the right (SVG y is flipped)", () => {
    const north = {
      id: "n",
      name: "north",
      lat: 37.505, // north of center
      lon: 127.0,
      category: "station" as const,
      importance: 1.0,
      tags: {},
    };
    const east = {
      id: "e",
      name: "east",
      lat: 37.5,
      lon: 127.005, // east of center
      category: "cafe" as const,
      importance: 0.5,
      tags: {},
    };
    const svg = renderSVG(projectionLayout([north, east]));
    const matches = [...svg.matchAll(LANDMARK_RE)];
    expect(matches).toHaveLength(2);

    // Order matches the input order (render iterates layout.landmarks).
    const [nx, ny] = [Number(matches[0][1]), Number(matches[0][2])];
    const [ex, ey] = [Number(matches[1][1]), Number(matches[1][2])];

    // North landmark: same x as center (300), smaller y than center (200) —
    // SVG y axis grows downward, so north is up = lower y.
    expect(nx).toBeCloseTo(300, 5);
    expect(ny).toBeLessThan(200);

    // East landmark: same y as center (200), larger x than center.
    expect(ex).toBeGreaterThan(300);
    expect(ey).toBeCloseTo(200, 5);
  });
});
