import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./overpass.js", () => ({
  OVERPASS_TIMEOUT_MS: 30_000,
  overpassFetch: vi.fn(),
}));

import { overpassFetch } from "./overpass.js";
import { roadsFromElements, DEFAULT_SIMPLIFY_EPSILON, findRoads } from "./roads.js";

const mockedOverpassFetch = vi.mocked(overpassFetch);

beforeEach(() => {
  mockedOverpassFetch.mockReset();
});

// Minimal Overpass `out geom;` way element.
function way(
  id: number,
  highway: string | undefined,
  geometry: Array<{ lat: number; lon: number }>,
  name?: string,
) {
  const tags: Record<string, string> = {};
  if (highway) tags.highway = highway;
  if (name) tags.name = name;
  return { id, type: "way", tags, geometry };
}

const line = [
  { lat: 37.5, lon: 127.0 },
  { lat: 37.501, lon: 127.001 },
];

describe("roadsFromElements", () => {
  it("maps OSM highway values to RoadClass tiers", () => {
    const roads = roadsFromElements([
      way(1, "motorway", line),
      way(2, "primary", line),
      way(3, "secondary", line),
      way(4, "tertiary", line),
      way(5, "residential", line),
      way(6, "living_street", line),
    ]);
    const byId = Object.fromEntries(roads.map((r) => [r.id, r.class]));
    expect(byId["1"]).toBe("primary"); // motorway → primary
    expect(byId["2"]).toBe("primary");
    expect(byId["3"]).toBe("secondary");
    expect(byId["4"]).toBe("tertiary");
    expect(byId["5"]).toBe("residential");
    expect(byId["6"]).toBe("residential"); // living_street → residential
  });

  it("classifies *_link variants with their parent tier", () => {
    const roads = roadsFromElements([
      way(1, "primary_link", line),
      way(2, "secondary_link", line),
    ]);
    expect(roads.find((r) => r.id === "1")?.class).toBe("primary");
    expect(roads.find((r) => r.id === "2")?.class).toBe("secondary");
  });

  it("falls back to 'path' for an unknown highway value", () => {
    const roads = roadsFromElements([way(1, "footway", line)]);
    expect(roads).toHaveLength(1);
    expect(roads[0].class).toBe("path");
  });

  it("carries the road name through when present, undefined when absent", () => {
    const roads = roadsFromElements([
      way(1, "primary", line, "테헤란로"),
      way(2, "primary", line),
    ]);
    expect(roads.find((r) => r.id === "1")?.name).toBe("테헤란로");
    expect(roads.find((r) => r.id === "2")?.name).toBeUndefined();
  });

  it("drops ways with fewer than 2 geometry points", () => {
    const roads = roadsFromElements([
      way(1, "primary", [{ lat: 37.5, lon: 127.0 }]),
      way(2, "primary", []),
      way(3, "primary", line),
    ]);
    expect(roads.map((r) => r.id)).toEqual(["3"]);
  });

  it("skips elements that fail schema validation, keeping the rest", () => {
    const roads = roadsFromElements([
      way(1, "primary", line),
      { id: "not-a-number", tags: {}, geometry: line }, // bad id type
      { garbage: true },
      way(2, "secondary", line),
    ]);
    expect(roads.map((r) => r.id).sort()).toEqual(["1", "2"]);
  });

  it("simplifies geometry with Douglas-Peucker", () => {
    // 5 near-colinear points → simplified to 2 endpoints.
    const wiggly = [
      { lat: 37.5, lon: 127.0 },
      { lat: 37.5005, lon: 127.00001 },
      { lat: 37.501, lon: 126.99999 },
      { lat: 37.5015, lon: 127.00001 },
      { lat: 37.502, lon: 127.0 },
    ];
    const roads = roadsFromElements([way(1, "primary", wiggly)], DEFAULT_SIMPLIFY_EPSILON);
    expect(roads[0].points.length).toBeLessThan(wiggly.length);
    expect(roads[0].points[0]).toEqual(wiggly[0]);
    expect(roads[0].points[roads[0].points.length - 1]).toEqual(wiggly[4]);
  });

  it("returns an empty array for no elements", () => {
    expect(roadsFromElements([])).toEqual([]);
  });
});

describe("findRoads", () => {
  it("clamps the effective Overpass radius to the public maximum", async () => {
    mockedOverpassFetch.mockResolvedValue([]);

    await findRoads(37.5, 127, 6000);

    const [query, timeoutMs] = mockedOverpassFetch.mock.calls[0];
    expect(query).toContain("around:5000,37.5,127");
    expect(timeoutMs).toBe(30_000);
  });
});
