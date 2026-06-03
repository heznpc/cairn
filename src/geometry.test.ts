import { describe, it, expect } from "vitest";
import { douglasPeucker, type GeoPoint } from "./geometry.js";

// Seoul-ish latitude so the cos-lat correction is exercised.
const BASE_LAT = 37.5;
const BASE_LON = 127.0;

// ~0.00001° ≈ 1.1m in latitude.
const deg = (m: number) => m / 111_000;

describe("douglasPeucker", () => {
  it("returns the input unchanged when it has 2 or fewer points", () => {
    const two: GeoPoint[] = [
      { lat: BASE_LAT, lon: BASE_LON },
      { lat: BASE_LAT + deg(100), lon: BASE_LON },
    ];
    expect(douglasPeucker(two, deg(5))).toEqual(two);
    expect(douglasPeucker([two[0]], deg(5))).toEqual([two[0]]);
    expect(douglasPeucker([], deg(5))).toEqual([]);
  });

  it("collapses a near-straight line to its two endpoints", () => {
    // 5 colinear points along a meridian, plus sub-meter jitter well under epsilon.
    const pts: GeoPoint[] = [
      { lat: BASE_LAT + deg(0), lon: BASE_LON },
      { lat: BASE_LAT + deg(25), lon: BASE_LON + deg(0.1) },
      { lat: BASE_LAT + deg(50), lon: BASE_LON - deg(0.1) },
      { lat: BASE_LAT + deg(75), lon: BASE_LON + deg(0.1) },
      { lat: BASE_LAT + deg(100), lon: BASE_LON },
    ];
    const out = douglasPeucker(pts, deg(5));
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(pts[0]);
    expect(out[1]).toEqual(pts[4]);
  });

  it("preserves a sharp corner that exceeds epsilon", () => {
    // An L-shape: the corner is ~100m off the line connecting the endpoints.
    const pts: GeoPoint[] = [
      { lat: BASE_LAT, lon: BASE_LON },
      { lat: BASE_LAT + deg(100), lon: BASE_LON }, // corner
      { lat: BASE_LAT + deg(100), lon: BASE_LON + deg(100) },
    ];
    const out = douglasPeucker(pts, deg(5));
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual(pts[1]);
  });

  it("drops a corner that falls within epsilon", () => {
    // Same L-shape but the deviation (~1m) is under a generous 50m epsilon.
    const pts: GeoPoint[] = [
      { lat: BASE_LAT, lon: BASE_LON },
      { lat: BASE_LAT + deg(50), lon: BASE_LON + deg(1) }, // barely off-line
      { lat: BASE_LAT + deg(100), lon: BASE_LON },
    ];
    const out = douglasPeucker(pts, deg(50));
    expect(out).toHaveLength(2);
  });

  it("keeps more points at a tighter epsilon than a looser one", () => {
    const pts: GeoPoint[] = Array.from({ length: 11 }, (_, i) => ({
      lat: BASE_LAT + deg(i * 10),
      // sinusoidal wiggle ~20m amplitude
      lon: BASE_LON + deg(20 * Math.sin(i)),
    }));
    const tight = douglasPeucker(pts, deg(2));
    const loose = douglasPeucker(pts, deg(40));
    expect(tight.length).toBeGreaterThan(loose.length);
    // endpoints always retained
    expect(loose[0]).toEqual(pts[0]);
    expect(loose[loose.length - 1]).toEqual(pts[10]);
  });

  it("does not mutate the input array", () => {
    const pts: GeoPoint[] = [
      { lat: BASE_LAT, lon: BASE_LON },
      { lat: BASE_LAT + deg(50), lon: BASE_LON },
      { lat: BASE_LAT + deg(100), lon: BASE_LON },
    ];
    const copy = JSON.parse(JSON.stringify(pts));
    douglasPeucker(pts, deg(5));
    expect(pts).toEqual(copy);
  });
});
