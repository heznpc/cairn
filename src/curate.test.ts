import { describe, it, expect } from "vitest";
import { curate } from "./curate.js";
import type { Landmark, LandmarkCategory } from "./types.js";

const center = { lat: 37.5, lon: 127.0 };

// ~1 degree latitude ≈ 111km. ~0.00135° ≈ 150m, our sweet spot.
const metersToLat = (m: number) => m / 111_000;

function lm(
  id: string,
  category: LandmarkCategory,
  importance: number,
  distanceMeters: number,
): Landmark {
  return {
    id,
    name: id,
    lat: center.lat + metersToLat(distanceMeters),
    lon: center.lon,
    category,
    importance,
    tags: {},
  };
}

describe("curate", () => {
  it("returns empty for empty input", () => {
    expect(curate(center, [], 5)).toEqual([]);
  });

  it("returns all when input < limit", () => {
    const lms = [lm("a", "cafe", 0.5, 100), lm("b", "station", 1.0, 200)];
    const out = curate(center, lms, 5);
    expect(out).toHaveLength(2);
  });

  it("prefers higher importance over distance at the sweet spot", () => {
    // Both at sweet spot (150m), one is a station (1.0), one is a cafe (0.5)
    const station = lm("station", "station", 1.0, 150);
    const cafe = lm("cafe", "cafe", 0.5, 150);
    const out = curate(center, [cafe, station], 1);
    expect(out[0].id).toBe("station");
  });

  it("picks unique categories first, then allows up to 2 per category", () => {
    // 3 cafes + 2 stations; limit 5 → expect 2 stations + 2 cafes max, plus
    // one more from elsewhere if available. With only cafe+station here,
    // result is 2 of each = 4 picked (2nd pass cap), not 5.
    const all = [
      lm("c1", "cafe", 0.5, 100),
      lm("c2", "cafe", 0.5, 120),
      lm("c3", "cafe", 0.5, 140),
      lm("s1", "station", 1.0, 200),
      lm("s2", "station", 1.0, 250),
    ];
    const out = curate(center, all, 5);
    const cats = out.map((l) => l.category);
    expect(cats.filter((c) => c === "cafe").length).toBeLessThanOrEqual(2);
    expect(cats.filter((c) => c === "station").length).toBeLessThanOrEqual(2);
    // Best of each category present
    expect(out.find((l) => l.id === "s1")).toBeDefined();
  });

  it("never returns more than `limit`", () => {
    const all = [
      lm("station", "station", 1.0, 200),
      lm("hospital", "hospital", 0.7, 180),
      lm("park", "park", 0.65, 220),
      lm("cafe", "cafe", 0.5, 150),
      lm("shop", "convenience", 0.5, 160),
    ];
    expect(curate(center, all, 3)).toHaveLength(3);
  });

  it("caps at 2 per category even if it means missing `limit`", () => {
    // Diversity is load-bearing: 10 buildings with limit=3 still yields only 2,
    // because the 2-per-category cap is preferred over filling the limit with
    // homogeneous picks.
    const all = Array.from({ length: 10 }, (_, i) =>
      lm(`x${i}`, "building", 0.3, 100 + i * 20),
    );
    expect(curate(center, all, 3)).toHaveLength(2);
  });

  it("penalizes very-far landmarks via distance score", () => {
    // Same importance, one at sweet spot, one way outside decay window
    const close = lm("close", "cafe", 0.5, 150);
    const far = lm("far", "cafe", 0.5, 800);
    const out = curate(center, [far, close], 1);
    expect(out[0].id).toBe("close");
  });
});
