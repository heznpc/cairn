import { describe, expect, it } from "vitest";
import { selectApproachLandmark, type ApproachCandidate } from "./approach.js";

function candidate(
  id: string,
  category: ApproachCandidate<string>["category"],
  importance: number,
  distance?: number,
): ApproachCandidate<string> {
  return { value: id, id, category, importance, distance };
}

describe("selectApproachLandmark", () => {
  it("uses transit category as the primary signal", () => {
    expect(selectApproachLandmark([
      candidate("cafe", "cafe", 1, 240),
      candidate("station", "station", 0.2, 60),
    ])).toBe("station");
  });

  it("uses projected distance to keep a same-category approach leg legible", () => {
    expect(selectApproachLandmark([
      candidate("near", "station_exit", 1, 30),
      candidate("far", "station_exit", 0.5, 140),
    ], { minimumDistance: 48 })).toBe("far");
  });

  it("uses importance when a template has no projected geometry", () => {
    expect(selectApproachLandmark([
      candidate("minor", "bus_stop", 0.4),
      candidate("major", "bus_stop", 0.9),
    ])).toBe("major");
  });

  it("honors an explicit landmark and reports an unknown id", () => {
    const candidates = [
      candidate("station", "station", 1),
      candidate("cafe", "cafe", 0.1),
    ];
    expect(selectApproachLandmark(candidates, { explicitId: "cafe" })).toBe("cafe");
    expect(() => selectApproachLandmark(candidates, { explicitId: "missing" }))
      .toThrow("Unknown approach landmark id: missing");
  });
});
