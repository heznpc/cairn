import { describe, expect, it } from "vitest";
import type { Landmark } from "../types.js";
import {
  pickCenterCallout,
  placeLandmarkLabels,
  type ProjectedLandmark,
} from "./label-layout.js";

const landmark: Landmark = {
  id: "lm",
  name: "Landmark",
  lat: 0,
  lon: 0,
  category: "landmark",
  importance: 0.5,
  tags: {},
};

function projected(overrides: Partial<ProjectedLandmark> = {}): ProjectedLandmark {
  return {
    lm: landmark,
    anchorX: 100,
    anchorY: 100,
    x: 100,
    y: 100,
    displaced: false,
    labelLines: ["Landmark"],
    labelWidth: 60,
    labelHeight: 20,
    labelHidden: false,
    ...overrides,
  };
}

describe("label layout", () => {
  it("places landmark labels below the marker when there is room", () => {
    const [box] = placeLandmarkLabels([projected()], 240, 200, [], false);

    expect(box).toEqual({ x: 70, y: 123, width: 60, height: 20 });
  });

  it("routes landmark labels away from existing obstacles", () => {
    const [box] = placeLandmarkLabels(
      [projected()],
      240,
      200,
      [{ x: 70, y: 123, width: 60, height: 20 }],
      false,
    );

    expect(box).toEqual({ x: 70, y: 57, width: 60, height: 20 });
  });

  it("keeps hidden landmark labels as zero-size boxes", () => {
    const [box] = placeLandmarkLabels([projected({ labelHidden: true })], 240, 200, [], false);

    expect(box).toEqual({ x: 100, y: 100, width: 0, height: 0, hidden: true });
  });

  it("hides low-importance labels when every candidate is too cluttered", () => {
    const [box] = placeLandmarkLabels(
      [projected()],
      240,
      200,
      [{ x: 0, y: 0, width: 240, height: 200 }],
      true,
    );

    expect(box.hidden).toBe(true);
  });

  it("places the destination callout above the center by default", () => {
    expect(pickCenterCallout(100, 100, 60, 240, 200, [])).toEqual({
      x: 70,
      y: 52,
      width: 60,
      height: 24,
      anchorX: 100,
      anchorY: 76,
    });
  });

  it("routes the destination callout away from occupied space", () => {
    expect(
      pickCenterCallout(100, 100, 60, 240, 200, [{ x: 70, y: 52, width: 60, height: 24 }]),
    ).toEqual({
      x: 70,
      y: 124,
      width: 60,
      height: 24,
      anchorX: 100,
      anchorY: 124,
    });
  });
});
