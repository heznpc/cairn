import { describe, expect, it } from "vitest";
import {
  LANDMARK_MARKER_RADIUS,
  markerLeaderSegment,
  placeLandmarkMarkers,
  pointToSegmentDistance,
  type MarkerAnchor,
  type RoadCorridor,
} from "./marker-layout.js";

const destination = { x: 210, y: 160 };
const options = { width: 240, height: 200, destination };

function marker(overrides: Partial<MarkerAnchor> = {}): MarkerAnchor {
  return { anchorX: 100, anchorY: 100, importance: 0.8, ...overrides };
}

describe("landmark marker layout", () => {
  it("keeps an anchor that already clears every protected road", () => {
    const road: RoadCorridor = {
      start: { x: 20, y: 150 },
      end: { x: 220, y: 150 },
      halfWidth: 8,
    };

    expect(placeLandmarkMarkers([marker({ anchorY: 60 })], [road], options)[0]).toMatchObject({
      anchorX: 100,
      anchorY: 60,
      x: 100,
      y: 60,
      displaced: false,
    });
  });

  it("moves a marker outside the rendered road corridor", () => {
    const road: RoadCorridor = {
      start: { x: 20, y: 100 },
      end: { x: 220, y: 100 },
      halfWidth: 8,
    };
    const placed = placeLandmarkMarkers([marker()], [road], options)[0];

    expect(placed).not.toBeNull();
    expect(placed!.displaced).toBe(true);
    expect(pointToSegmentDistance(placed!, road)).toBeGreaterThanOrEqual(
      LANDMARK_MARKER_RADIUS + road.halfWidth + 4,
    );
  });

  it("keeps markers apart while giving the more important marker first choice", () => {
    const placed = placeLandmarkMarkers(
      [
        marker({ importance: 0.4 }),
        marker({ importance: 1 }),
      ],
      [],
      options,
    );

    expect(placed[1]).toMatchObject({ x: 100, y: 100, displaced: false });
    expect(placed[0]).not.toBeNull();
    expect(Math.hypot(placed[0]!.x - placed[1]!.x, placed[0]!.y - placed[1]!.y))
      .toBeGreaterThanOrEqual(LANDMARK_MARKER_RADIUS * 2 + 6);
  });

  it("returns no placement when every candidate would erase a road", () => {
    const roads: RoadCorridor[] = [40, 50, 60].map((y) => ({
      start: { x: 0, y },
      end: { x: 100, y },
      halfWidth: 10,
    }));

    expect(
      placeLandmarkMarkers(
        [marker({ anchorX: 50, anchorY: 50 })],
        roads,
        { width: 100, height: 100, destination: { x: 90, y: 90 } },
      )[0],
    ).toBeNull();
  });

  it("trims a displaced marker leader before the glyph boundary", () => {
    const leader = markerLeaderSegment({
      ...marker(),
      x: 100,
      y: 58,
      displaced: true,
    });

    expect(leader).toEqual({
      start: { x: 100, y: 98 },
      end: { x: 100, y: 77 },
    });
  });
});
