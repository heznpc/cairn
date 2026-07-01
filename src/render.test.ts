import { describe, it, expect } from "vitest";
import { renderSVG } from "./render.js";
import type { MapLayout } from "./types.js";

const layout: MapLayout = {
  center: { lat: 37.5, lon: 127.0, label: "여기" },
  landmarks: [
    {
      id: "1",
      name: "역삼역",
      lat: 37.5005,
      lon: 127.0005,
      category: "station",
      importance: 1.0,
      tags: {},
    },
    {
      id: "2",
      name: "스타벅스",
      lat: 37.4998,
      lon: 127.0008,
      category: "cafe",
      importance: 0.5,
      tags: {},
    },
  ],
  roads: [],
  bbox: {
    north: 37.5013,
    south: 37.4988,
    east: 127.0018,
    west: 126.999,
  },
};

function roadCorePathCount(svg: string): number {
  return svg.match(/data-road-layer="core"/g)?.length ?? 0;
}

function roadCorePathData(svg: string): string[] {
  return [...svg.matchAll(/<path data-road-layer="core" d="([^"]+)"/g)].map((m) => m[1]);
}

function filledTextOccurrences(svg: string, label: string): number {
  return [...svg.matchAll(new RegExp(`<text [^>]*fill="(?!none)[^"]*"[^>]*>${label}`, "g"))].length;
}

describe("renderSVG", () => {
  it("produces a well-formed SVG document", () => {
    const svg = renderSVG(layout);
    expect(svg).toMatch(/^<svg[^>]+>/);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it("includes the center label and landmark names", () => {
    const svg = renderSVG(layout);
    expect(svg).toContain("여기");
    expect(svg).toContain("역삼역");
    expect(svg).toContain("스타벅스");
  });

  it("uses SVG pictograms for landmark markers", () => {
    const svg = renderSVG(layout);
    expect(svg).toContain('data-landmark-icon="station"');
    expect(svg).toContain('data-landmark-icon="cafe"');
    expect(svg).not.toContain(">M<");
  });

  it("includes visible OpenStreetMap attribution", () => {
    const svg = renderSVG(layout);
    expect(svg).toContain('data-attribution="osm"');
    expect(svg).toContain("© OpenStreetMap contributors");
  });

  it("renders one center marker plus one circle per landmark", () => {
    const svg = renderSVG(layout);
    const circles = svg.match(/<circle\b/g) ?? [];
    expect(circles).toHaveLength(layout.landmarks.length + 1);
  });

  it("uses print-style labels instead of UI connector lines and label pills", () => {
    const svg = renderSVG(layout);
    expect(svg).not.toContain('stroke-dasharray="4,5"');
    expect(svg).not.toContain('fill="#fffdf8" stroke="#e3ddd0"');
    expect(svg).toContain('stroke="#fffef9" stroke-width="4"');
  });

  it("uses the strong classic destination label by default", () => {
    const svg = renderSVG(layout);
    expect(svg).toContain('data-destination-label="true"');
    expect(svg).toContain('data-destination-label="true"');
    expect(svg).toContain('fill="#d63b31"');
    expect(svg).toContain('fill="#fffef9">여기</text>');
  });

  it("supports a quieter outlined destination label theme", () => {
    const svg = renderSVG(layout, { theme: "quiet" });
    expect(svg).toContain('data-destination-label="true"');
    expect(svg).toContain('fill="#fffef9" stroke="#b14436"');
    expect(svg).not.toContain('data-destination-label="true" fill="#b14436"');
  });

  it("supports a single-ink mono theme", () => {
    const svg = renderSVG(layout, { theme: "mono" });
    expect(svg).toContain('data-destination-label="true"');
    expect(svg).toContain('fill="#25221d"');
    expect(svg).toContain('data-landmark-icon="station"');
  });

  it("draws a final approach arrow in diagram mode", () => {
    const svg = renderSVG(layout);
    expect(svg).toContain('data-approach-arrow="core"');
    expect(svg).toContain('marker-end="url(#cairn-approach-arrowhead)"');
  });

  it("omits the approach arrow in geographic mode", () => {
    const svg = renderSVG(layout, { layout: "geographic" });
    expect(svg).not.toContain('data-approach-arrow="core"');
  });

  it("escapes XML special characters in labels", () => {
    const escaped = renderSVG({
      ...layout,
      center: { ...layout.center, label: `A&B<C>"D'E` },
      landmarks: [],
    });
    expect(escaped).toContain("A&amp;B&lt;C&gt;&quot;D&apos;E");
    expect(escaped).not.toMatch(/A&B<C>/);
  });

  it("respects width/height options", () => {
    const svg = renderSVG(layout, { width: 800, height: 500 });
    expect(svg).toContain('viewBox="0 0 800 500"');
  });

  it("clamps direct-call canvas dimensions to the supported range", () => {
    const svg = renderSVG(layout, { width: 1_000_000, height: 1_000_000 });
    expect(svg).toContain('viewBox="0 0 4000 4000"');
  });

  it("uses fallback dimensions for non-finite direct-call dimensions", () => {
    const svg = renderSVG(layout, { width: Infinity, height: NaN });
    expect(svg).toContain('viewBox="0 0 600 400"');
  });

  it("handles empty landmarks gracefully", () => {
    const svg = renderSVG({ ...layout, landmarks: [] });
    expect(svg).toContain("<svg");
    expect(svg).toContain("여기");
    // Only the center circle should be present
    expect((svg.match(/<circle\b/g) ?? [])).toHaveLength(1);
  });
});

// Projection regression coverage — the earlier tests count circles and check
// that text is present, but say nothing about *where* each circle lands.
// These tests pin the lat/lon → (cx, cy) mapping by constructing a bbox whose
// geometric center is exactly the destination, then asserting the resulting
// SVG coordinates.

describe("renderSVG — projection", () => {
  // Center marker uses r="10", landmarks use r="17" — that's how we distinguish.
  const CENTER_RE = /<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="10"/;
  const LANDMARK_RE = /<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="17"/g;

  // 0.02° bbox in each axis, destination at the exact center.
  // With default width=600 / height=400 and the 50px margin baked into render.ts,
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

  it("survives a degenerate (zero-span) bbox via the 1e-6 fallback in render.ts", () => {
    // Production hits this when a layout has one landmark co-located with the
    // destination (single-POI rendering), or when padLat/padLon cancel out.
    // The earlier 0.02° bbox tests never reach the `|| 1e-6` fallback, so a
    // regression that removes it would NaN every coordinate without notice.
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

  // Regression: Overpass `out geom;` returns the *full* geometry of a way, so a
  // single road can extend kilometres past the bbox. The previous renderer
  // placed labels at the middle index of the longest segment, which landed
  // them outside the viewBox (e.g. "테헤란로" at x=-533 on a 600px frame). SVG
  // clips strokes but not text, so the label silently disappeared.
  it("clamps a road label to the viewBox even when most of the way is offscreen", () => {
    // bbox 126.99..127.01, 37.49..37.51 — way nodes span lon 126.95..127.05,
    // i.e. 4× the bbox width on each side.
    const sprawling = {
      id: "way",
      name: "테헤란로",
      class: "primary" as const,
      points: [
        { lat: 37.5, lon: 126.95 }, // way west, far outside bbox → projected x ≪ 0
        { lat: 37.5, lon: 126.99 }, // bbox western edge
        { lat: 37.5, lon: 127.0 }, // bbox center
        { lat: 37.5, lon: 127.01 }, // bbox eastern edge
        { lat: 37.5, lon: 127.05 }, // way east, far outside bbox → projected x ≫ width
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
    // Both nodes project far outside the 600x400 frame.
    const allOffscreen = {
      id: "ghost",
      name: "유령로",
      class: "primary" as const,
      points: [
        { lat: 37.5, lon: 126.90 }, // way west: x ≈ -2200
        { lat: 37.5, lon: 126.95 }, // still way west: x ≈ -950
      ],
    };
    const svg = renderSVG(layoutWithRoads([allOffscreen]));
    expect(roadCorePathCount(svg)).toBe(0);
    expect(svg).not.toContain("유령로");
  });

  it("places a primary road label at the geometric midpoint of its in-viewBox run", () => {
    // Single road centered on the destination, fully in-viewBox: midpoint by
    // arclength should sit at the viewBox centre (300, 200).
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

  it("shortens long landmark labels for print-style maps", () => {
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

    expect(svg).toContain("서울대학교병원헬…");
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

    const classic = renderSVG(cluttered);
    expect(classic).toContain("서울대학교병원헬");

    const quiet = renderSVG(cluttered, { theme: "quiet" });
    expect(quiet).toContain('data-landmark-icon="hospital"');
    expect(quiet).not.toContain("서울대학교병원");
  });
});
