import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./geocode.js", () => ({
  geocode: vi.fn(),
}));
vi.mock("./landmarks.js", () => ({
  findLandmarks: vi.fn(),
}));
vi.mock("./roads.js", () => ({
  findRoads: vi.fn(),
}));
vi.mock("./curate.js", () => ({
  curate: vi.fn(),
}));
vi.mock("./render.js", () => ({
  renderSVG: vi.fn(),
}));

import { geocode } from "./geocode.js";
import { findLandmarks } from "./landmarks.js";
import { findRoads } from "./roads.js";
import { curate } from "./curate.js";
import { renderSVG } from "./render.js";
import { generateMap, ROAD_SEARCH_RADIUS_MULTIPLIER } from "./pipeline.js";
import type { Landmark } from "./types.js";

const mockedGeocode = vi.mocked(geocode);
const mockedFindLandmarks = vi.mocked(findLandmarks);
const mockedFindRoads = vi.mocked(findRoads);
const mockedCurate = vi.mocked(curate);
const mockedRenderSVG = vi.mocked(renderSVG);

const geo = { lat: 37.5, lon: 127.0, displayName: "Test Address" };
const landmark: Landmark = {
  id: "1",
  name: "역삼역",
  lat: 37.501,
  lon: 127.001,
  category: "station",
  importance: 1.0,
  tags: {},
};

beforeEach(() => {
  vi.resetAllMocks();
  mockedGeocode.mockResolvedValue(geo);
  mockedFindLandmarks.mockResolvedValue([landmark]);
  mockedCurate.mockReturnValue([landmark]);
  mockedFindRoads.mockResolvedValue([]);
  mockedRenderSVG.mockReturnValue("<svg></svg>");
});

describe("generateMap", () => {
  it("expands the road search radius by the named multiplier", async () => {
    await generateMap("서울 강남구 테헤란로 152", { radiusMeters: 333 });

    expect(mockedFindLandmarks).toHaveBeenCalledWith(geo.lat, geo.lon, 333);
    expect(mockedFindRoads).toHaveBeenCalledWith(
      geo.lat,
      geo.lon,
      Math.round(333 * ROAD_SEARCH_RADIUS_MULTIPLIER),
    );
  });

  it("does not query roads when roads are disabled", async () => {
    const result = await generateMap("서울 강남구 테헤란로 152", { roads: false });

    expect(mockedFindRoads).not.toHaveBeenCalled();
    expect(result.layout.roads).toEqual([]);
  });

  it("passes the render layout option through to renderSVG", async () => {
    await generateMap("서울 강남구 테헤란로 152", { layout: "geographic" });

    expect(mockedRenderSVG).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ layout: "geographic" }),
    );
  });

  it("passes the render theme option through to renderSVG", async () => {
    await generateMap("서울 강남구 테헤란로 152", { theme: "mono" });

    expect(mockedRenderSVG).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ theme: "mono" }),
    );
  });
});
