import { describe, it, expect } from "vitest";
import { renderSVG } from "./render.js";
import type { MapLayout } from "./types.js";
import {
  filledTextOccurrences,
  roadCorePathCount,
  roadCorePathData,
} from "../test/helpers/svg.js";

describe("renderSVG — roads", () => {
  const bbox = { north: 37.51, south: 37.49, east: 127.01, west: 126.99 };

  function layoutWithRoads(roads: MapLayout["roads"]): MapLayout {
    return {
      center: { lat: 37.5, lon: 127.0, label: "C" },
      landmarks: [],
      roads,
      bbox,
    };
  }

  const primaryRoad = {
    id: "r1",
    name: "테헤란로",
    class: "primary" as const,
    points: [
      { lat: 37.495, lon: 126.995 },
      { lat: 37.5, lon: 127.0 },
      { lat: 37.505, lon: 127.005 },
    ],
  };

  it("renders a road as an SVG path with a stroke", () => {
    const svg = renderSVG(layoutWithRoads([primaryRoad]));
    expect(roadCorePathCount(svg)).toBe(1);
    expect(svg).toMatch(/<path data-road-layer="core" d="M[\d.]+,[\d.]+ L[\d.]+,[\d.]+/);
    expect(svg).toContain('stroke-linecap="round"');
  });

  it("moves landmark markers off road corridors without cutting the road", () => {
    const road = {
      id: "main",
      name: "큰길",
      class: "primary" as const,
      points: [
        { lat: 37.5, lon: 126.991 },
        { lat: 37.5, lon: 127.009 },
      ],
    };
    const svg = renderSVG({
      ...layoutWithRoads([road]),
      landmarks: [
        {
          id: "station",
          name: "역",
          lat: 37.5,
          lon: 127.006,
          category: "station",
          importance: 1,
          tags: {},
        },
      ],
    });
    const marker = svg.match(
      /<circle cx="([\d.]+)" cy="([\d.]+)" r="17" data-landmark-marker="0" data-anchor-x="([\d.]+)" data-anchor-y="([\d.]+)" data-displaced="true"/,
    );

    expect(marker, "road-safe marker missing").not.toBeNull();
    const markerY = Number(marker![2]);
    const anchorY = Number(marker![4]);
    expect(Math.abs(markerY - anchorY)).toBeGreaterThanOrEqual(29.5);
    expect(svg).toContain('data-landmark-leader="0"');
    expect(svg.indexOf('data-landmark-leader="0"')).toBeLessThan(
      svg.indexOf('data-road-layer="core"'),
    );
    expect(svg.indexOf('data-road-layer="core"')).toBeLessThan(
      svg.indexOf('data-landmark-marker="0"'),
    );
  });

  it("straightens kinked OSM road geometry into a clean diagram spine", () => {
    const kinked = {
      id: "kink",
      name: "구불로",
      class: "primary" as const,
      points: [
        { lat: 37.5, lon: 126.992 },
        { lat: 37.503, lon: 126.997 },
        { lat: 37.497, lon: 127.003 },
        { lat: 37.5, lon: 127.008 },
      ],
    };

    const svg = renderSVG(layoutWithRoads([kinked]));
    const [d] = roadCorePathData(svg);

    expect(d).toMatch(/^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
    expect(d.split(" L")).toHaveLength(2);
  });

  it("labels a named primary road exactly once", () => {
    const svg = renderSVG(layoutWithRoads([primaryRoad]));
    expect(filledTextOccurrences(svg, "테헤란로")).toBe(1);
  });

  it("does not label residential roads", () => {
    const residential = {
      id: "r2",
      name: "골목길",
      class: "residential" as const,
      points: [
        { lat: 37.499, lon: 126.999 },
        { lat: 37.501, lon: 127.001 },
      ],
    };
    const svg = renderSVG(layoutWithRoads([residential]));
    // The road is drawn (a path) but its name is not labeled.
    expect(roadCorePathCount(svg)).toBe(1);
    expect(svg).not.toContain("골목길");
  });

  it("labels a split road (same name, many segments) only once, at the longest", () => {
    const short = {
      id: "s",
      name: "강남대로",
      class: "secondary" as const,
      points: [
        { lat: 37.4999, lon: 126.9999 },
        { lat: 37.5001, lon: 127.0001 },
      ],
    };
    const long = {
      id: "l",
      name: "강남대로",
      class: "secondary" as const,
      points: [
        { lat: 37.491, lon: 126.991 },
        { lat: 37.509, lon: 127.009 },
      ],
    };
    const svg = renderSVG(layoutWithRoads([short, long]));
    // Diagram mode drops the tiny duplicate segment as visual noise, while
    // keeping the long labeled spine.
    expect(roadCorePathCount(svg)).toBe(1);
    expect(filledTextOccurrences(svg, "강남대로")).toBe(1);
  });

  it("skips roads with fewer than 2 points", () => {
    const degenerate = {
      id: "d",
      name: "점",
      class: "primary" as const,
      points: [{ lat: 37.5, lon: 127.0 }],
    };
    const svg = renderSVG(layoutWithRoads([degenerate]));
    expect(roadCorePathCount(svg)).toBe(0);
  });

  // Regression: Overpass `out geom;` returns the full geometry of a way, so a
  // single road can extend kilometres past the bbox. The previous renderer
  // placed labels at the middle index of the longest segment, which landed
  // them outside the viewBox. SVG clips strokes but not text, so the label
  // silently disappeared.
  it("clamps a road label to the viewBox even when most of the way is offscreen", () => {
    const sprawling = {
      id: "way",
      name: "테헤란로",
      class: "primary" as const,
      points: [
        { lat: 37.5, lon: 126.95 },
        { lat: 37.5, lon: 126.99 },
        { lat: 37.5, lon: 127.0 },
        { lat: 37.5, lon: 127.01 },
        { lat: 37.5, lon: 127.05 },
      ],
    };
    const svg = renderSVG(layoutWithRoads([sprawling]));
    const m = svg.match(
      /<text x="([-\d.]+)" y="([-\d.]+)"[^>]*font-size="10"[^>]*>테헤란로/,
    );
    expect(m, "road label missing").not.toBeNull();
    const lx = Number(m![1]);
    const ly = Number(m![2]);
    expect(lx, "label x must be within viewBox").toBeGreaterThanOrEqual(0);
    expect(lx, "label x must be within viewBox").toBeLessThanOrEqual(600);
    expect(ly, "label y must be within viewBox").toBeGreaterThanOrEqual(0);
    expect(ly, "label y must be within viewBox").toBeLessThanOrEqual(400);
  });

  it("omits offscreen road paths and labels in diagram mode", () => {
    const allOffscreen = {
      id: "ghost",
      name: "유령로",
      class: "primary" as const,
      points: [
        { lat: 37.5, lon: 126.90 },
        { lat: 37.5, lon: 126.95 },
      ],
    };
    const svg = renderSVG(layoutWithRoads([allOffscreen]));
    expect(roadCorePathCount(svg)).toBe(0);
    expect(svg).not.toContain("유령로");
  });

  it("places a primary road label at the geometric midpoint of its in-viewBox run", () => {
    const centered = {
      id: "c",
      name: "중앙로",
      class: "primary" as const,
      points: [
        { lat: 37.5, lon: 126.992 },
        { lat: 37.5, lon: 127.008 },
      ],
    };
    const svg = renderSVG(layoutWithRoads([centered]));
    const m = svg.match(
      /<text x="([\d.]+)" y="([\d.]+)"[^>]*font-size="10"[^>]*>중앙로/,
    );
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeCloseTo(300, 0);
    expect(Number(m![2])).toBeCloseTo(200, 0);
  });

  it("filters dense Overpass road sets down to a readable yakdo skeleton", () => {
    const roads = Array.from({ length: 30 }, (_, i) => ({
      id: `r${i}`,
      name: i % 3 === 0 ? "테헤란로" : `골목${i}`,
      class: i % 5 === 0 ? "primary" as const : "residential" as const,
      points: [
        { lat: 37.49 + i * 0.0003, lon: 126.99 },
        { lat: 37.49 + i * 0.0003, lon: 127.01 },
      ],
    }));

    const svg = renderSVG(layoutWithRoads(roads));

    expect(roadCorePathCount(svg)).toBeLessThanOrEqual(10);
  });

  it("preserves dense road geometry in geographic layout mode", () => {
    const roads = Array.from({ length: 30 }, (_, i) => ({
      id: `r${i}`,
      name: `도로${i}`,
      class: "residential" as const,
      points: [
        { lat: 37.49 + i * 0.0003, lon: 126.99 },
        { lat: 37.49 + i * 0.0003, lon: 127.01 },
      ],
    }));

    const svg = renderSVG(layoutWithRoads(roads), { layout: "geographic" });

    expect(roadCorePathCount(svg)).toBe(30);
  });

  it("caps the geographic road count so a dense area can't emit an unbounded SVG", () => {
    const roads = Array.from({ length: 150 }, (_, i) => ({
      id: `r${i}`,
      name: `도로${i}`,
      class: "residential" as const,
      points: [
        { lat: 37.49 + i * 0.00003, lon: 126.99 },
        { lat: 37.49 + i * 0.00003, lon: 127.01 },
      ],
    }));

    const svg = renderSVG(layoutWithRoads(roads), { layout: "geographic" });

    expect(roadCorePathCount(svg)).toBeLessThanOrEqual(80);
  });

  it("caps the geographic total vertex budget when ways carry heavy geometry", () => {
    const roads = Array.from({ length: 40 }, (_, i) => ({
      id: `r${i}`,
      name: `도로${i}`,
      class: "residential" as const,
      points: Array.from({ length: 200 }, (_, j) => ({
        lat: 37.49 + i * 0.00003 + j * 0.000001,
        lon: 126.99 + j * 0.0001,
      })),
    }));

    const svg = renderSVG(layoutWithRoads(roads), { layout: "geographic" });

    expect(roadCorePathCount(svg)).toBeLessThan(40);
  });

  it("draws the main road tier visibly heavier than minor roads", () => {
    const roads = [
      { id: "p", name: "큰길", class: "primary" as const, points: [{ lat: 37.499, lon: 126.999 }, { lat: 37.501, lon: 127.001 }] },
      { id: "r", name: "골목", class: "residential" as const, points: [{ lat: 37.4995, lon: 126.999 }, { lat: 37.5005, lon: 127.001 }] },
    ];
    // Geographic layout renders every road by class, so both tiers appear.
    const svg = renderSVG(layoutWithRoads(roads), { layout: "geographic" });
    const widths = [...svg.matchAll(/<path data-road-layer="core"[^>]*stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));

    expect(widths).toHaveLength(2);
    // Primary should read as the artery: at least twice the residential width.
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) * 2);
  });

  it("wraps long landmark labels onto two lines instead of a hard ellipsis", () => {
    const longName = "서울대학교병원헬스케어시스템강남센터";
    const svg = renderSVG({
      ...layoutWithRoads([]),
      landmarks: [
        {
          id: "h",
          name: longName,
          lat: 37.5,
          lon: 127.0,
          category: "hospital",
          importance: 0.7,
          tags: {},
        },
      ],
    });

    // Two balanced lines via tspans — the full name stays readable, and the
    // ugly single-line "서울대학교병원헬…" truncation is gone.
    expect(svg).toContain("<tspan");
    expect(svg).toContain("서울대학교병원헬스");
    expect(svg).toContain("케어시스템강남센터");
    expect(svg).not.toContain("…");
    expect(svg).not.toContain(longName);
  });

  it("omits low-importance landmark labels when every placement is too cluttered", () => {
    const cluttered = {
      center: { lat: 37.5, lon: 127.0, label: "스튜디오" },
      landmarks: [
        {
          id: "exit7",
          name: "7번 출구",
          lat: 37.50055,
          lon: 127.00045,
          category: "station_exit",
          importance: 0.95,
          tags: { ref: "7" },
        },
        {
          id: "station",
          name: "역삼역",
          lat: 37.50045,
          lon: 127.00055,
          category: "station",
          importance: 1,
          tags: {},
        },
        {
          id: "hospital",
          name: "서울대학교병원헬스케어센터",
          lat: 37.5002,
          lon: 127.0003,
          category: "hospital",
          importance: 0.7,
          tags: {},
        },
      ],
      roads: [
        {
          id: "teheran",
          name: "테헤란로",
          class: "primary",
          points: [
            { lat: 37.5002, lon: 126.9978 },
            { lat: 37.5006, lon: 126.999 },
            { lat: 37.5001, lon: 127.0004 },
            { lat: 37.5005, lon: 127.002 },
          ],
        },
        {
          id: "nonhyeon",
          name: "논현로",
          class: "secondary",
          points: [
            { lat: 37.5011, lon: 127.00085 },
            { lat: 37.499, lon: 127.0002 },
          ],
        },
      ],
      bbox: { north: 37.5012, south: 37.4988, east: 127.0014, west: 126.9986 },
    } satisfies MapLayout;

    const standard = renderSVG(cluttered);
    // Standard keeps every label (wrapped to two lines), so the hospital name
    // is present — its first wrapped line "서울대학교병원" appears verbatim.
    expect(standard).toContain("서울대학교병원");

    const compact = renderSVG(cluttered, { preset: "compact" });
    expect(compact).toContain('data-landmark-icon="station_exit"');
    expect(compact).toContain('data-landmark-icon="station"');
    expect(compact).not.toContain('data-landmark-icon="hospital"');

    const minimal = renderSVG(cluttered, { preset: "minimal" });
    expect(minimal).toContain('data-landmark-icon="station_exit"');
    expect(minimal).not.toContain('data-landmark-icon="station"');
    expect(minimal).not.toContain('data-landmark-icon="hospital"');
    expect(roadCorePathCount(minimal)).toBe(0);
  });
});
