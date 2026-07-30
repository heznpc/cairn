import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./overpass.js", () => ({
  OVERPASS_TIMEOUT_MS: 30_000,
  overpassFetch: vi.fn(),
}));

import { overpassFetch } from "./overpass.js";
import { findLandmarks, STATION_SEARCH_RADIUS_MULTIPLIER } from "./landmarks.js";

function node(id: number, tags?: Record<string, string>) {
  return { id, lat: 37.5 + id * 0.0001, lon: 127.0 + id * 0.0001, tags };
}

const mockedOverpassFetch = vi.mocked(overpassFetch);

beforeEach(() => {
  mockedOverpassFetch.mockReset();
});

describe("findLandmarks", () => {
  it("expands only the station search radius by the named multiplier", async () => {
    mockedOverpassFetch.mockResolvedValue([]);

    await findLandmarks(37.5, 127, 400);

    const [query, timeoutMs] = mockedOverpassFetch.mock.calls[0];
    const stationRadius = Math.round(400 * STATION_SEARCH_RADIUS_MULTIPLIER);
    expect(query).toContain(
      `nwr["public_transport"="station"](around:${stationRadius},37.5,127);`,
    );
    expect(query).toContain(
      `nwr["railway"~"^(subway_entrance|train_station_entrance)$"](around:${stationRadius},37.5,127);`,
    );
    expect(query).toContain(`nwr["railway"="tram_stop"](around:${stationRadius},37.5,127);`);
    expect(query).toContain(`nwr["highway"="bus_stop"](around:400,37.5,127);`);
    // Ways and relations need a representative point, not full geometry.
    expect(query).toContain("out center;");
    expect(timeoutMs).toBe(30_000);
  });

  it("queries ways and relations, not just nodes", async () => {
    mockedOverpassFetch.mockResolvedValue([]);

    await findLandmarks(48.86, 2.34, 400);

    const [query] = mockedOverpassFetch.mock.calls[0];
    // Parks, hospitals and malls are mapped as polygons in most of the world.
    expect(query).not.toMatch(/(^|\s)node\[/);
    expect(query).toContain(`nwr["leisure"~"^(park|stadium|sports_centre)$"]`);
  });

  it("clamps the effective station and POI search radii to the public maximum", async () => {
    mockedOverpassFetch.mockResolvedValue([]);

    await findLandmarks(37.5, 127, 5000);

    const [query] = mockedOverpassFetch.mock.calls[0];
    expect(query).toContain(`nwr["public_transport"="station"](around:5000,37.5,127);`);
    expect(query).toContain(
      `nwr["railway"~"^(subway_entrance|train_station_entrance)$"](around:5000,37.5,127);`,
    );
    expect(query).toContain(`nwr["shop"~"^(convenience|supermarket|mall|department_store)$"](around:5000,37.5,127);`);
  });

  it("maps supported OSM tags to stable landmark categories and importance", async () => {
    mockedOverpassFetch.mockResolvedValue([
      node(1, { name: "Station", public_transport: "station" }),
      node(11, { railway: "subway_entrance", ref: "3" }),
      node(2, { name: "Bus", highway: "bus_stop" }),
      node(3, { name: "Cafe", amenity: "cafe" }),
      node(4, { name: "Store", shop: "convenience" }),
      node(5, { name: "Restaurant", amenity: "restaurant" }),
      node(6, { name: "School", amenity: "university" }),
      node(7, { name: "Hospital", amenity: "hospital" }),
      node(8, { name: "Park", leisure: "park" }),
      node(9, { name: "Monument", historic: "monument" }),
      node(10, { name: "Office", office: "yes" }),
    ]);

    const landmarks = await findLandmarks(37.5, 127, 400);
    const byId = Object.fromEntries(landmarks.map((l) => [l.id, l]));

    expect(byId["1"]).toMatchObject({ category: "station", importance: 1.0 });
    expect(byId["11"]).toMatchObject({ name: "Exit 3", category: "station_exit", importance: 0.95 });
    expect(byId["2"]).toMatchObject({ category: "bus_stop", importance: 0.4 });
    expect(byId["3"]).toMatchObject({ category: "cafe", importance: 0.5 });
    expect(byId["4"]).toMatchObject({ category: "convenience", importance: 0.5 });
    expect(byId["5"]).toMatchObject({ category: "restaurant", importance: 0.45 });
    expect(byId["6"]).toMatchObject({ category: "school", importance: 0.7 });
    expect(byId["7"]).toMatchObject({ category: "hospital", importance: 0.7 });
    expect(byId["8"]).toMatchObject({ category: "park", importance: 0.65 });
    expect(byId["9"]).toMatchObject({ category: "landmark", importance: 0.85 });
    expect(byId["10"]).toMatchObject({ category: "building", importance: 0.3 });
  });

  it("places ways and relations at their center, with type-scoped ids", async () => {
    mockedOverpassFetch.mockResolvedValue([
      { id: 5, type: "way", center: { lat: 48.87, lon: 2.35 }, tags: { name: "Jardin", leisure: "park" } },
      { id: 5, type: "relation", center: { lat: 48.88, lon: 2.36 }, tags: { name: "Hopital", amenity: "hospital" } },
      // No point to place a marker at, so it is skipped rather than rendered at 0,0.
      { id: 7, type: "way", tags: { name: "Geometryless", leisure: "park" } },
    ]);

    const landmarks = await findLandmarks(48.86, 2.34, 400);

    expect(landmarks).toHaveLength(2);
    expect(landmarks[0]).toMatchObject({
      id: "way/5",
      name: "Jardin",
      lat: 48.87,
      lon: 2.35,
      category: "park",
    });
    // Same numeric id, different element type: ids must not collide.
    expect(landmarks[1]).toMatchObject({ id: "relation/5", category: "hospital" });
  });

  it("drops elements returned twice by overlapping tag filters", async () => {
    const museum = {
      id: 9,
      type: "way",
      center: { lat: 48.86, lon: 2.34 },
      tags: { name: "Musee", tourism: "museum", amenity: "museum" },
    };
    mockedOverpassFetch.mockResolvedValue([museum, museum]);

    expect(await findLandmarks(48.86, 2.34, 400)).toHaveLength(1);
  });

  it("classifies transit and shop tags used outside Korea and Japan", async () => {
    mockedOverpassFetch.mockResolvedValue([
      node(1, { name: "Tram", railway: "tram_stop" }),
      node(2, { name: "Pier", amenity: "ferry_terminal" }),
      node(3, { name: "Entrance", railway: "train_station_entrance" }),
      node(4, { name: "Apotheke", amenity: "pharmacy" }),
      node(5, { name: "Mercado", shop: "supermarket" }),
      node(6, { name: "Mall", shop: "mall" }),
      node(7, { name: "Kirche", amenity: "place_of_worship" }),
      node(8, { name: "Bank", amenity: "bank" }),
      node(9, { name: "Castelo", historic: "castle" }),
      node(10, { name: "Estadio", leisure: "stadium" }),
    ]);

    const byId = Object.fromEntries(
      (await findLandmarks(48.86, 2.34, 400)).map((l) => [l.id, l.category]),
    );

    expect(byId).toMatchObject({
      "1": "tram_stop",
      "2": "ferry",
      "3": "station_exit",
      "4": "pharmacy",
      "5": "supermarket",
      "6": "supermarket",
      // No pictogram of its own: folded into the monument-class landmark rather
      // than inventing denominational iconography.
      "7": "landmark",
      "8": "building",
      "9": "landmark",
      "10": "park",
    });
  });

  it("labels unnamed transit exits in the requested language", async () => {
    const exitNode = node(11, { railway: "subway_entrance", ref: "3" });

    mockedOverpassFetch.mockResolvedValue([exitNode]);
    const [korean] = await findLandmarks(37.5, 127, 400, { language: "ko" });
    expect(korean.name).toBe("3번 출구");

    mockedOverpassFetch.mockResolvedValue([exitNode]);
    const [german] = await findLandmarks(52.5, 13.4, 400, { language: "de-DE" });
    expect(german.name).toBe("Ausgang 3");

    // An OSM `name` always wins over the generated label.
    mockedOverpassFetch.mockResolvedValue([
      node(12, { railway: "subway_entrance", ref: "3", name: "Sortie Rivoli" }),
    ]);
    const [named] = await findLandmarks(48.86, 2.34, 400, { language: "fr" });
    expect(named.name).toBe("Sortie Rivoli");
  });

  it("keeps the intended priority for multi-tag landmarks", async () => {
    mockedOverpassFetch.mockResolvedValue([
      node(1, { name: "Station Cafe", public_transport: "station", amenity: "cafe" }),
      node(2, { name: "Bus Cafe", highway: "bus_stop", amenity: "cafe" }),
      node(3, { name: "Convenience Restaurant", shop: "convenience", amenity: "restaurant" }),
      node(4, { name: "Station Exit Cafe", railway: "subway_entrance", amenity: "cafe" }),
    ]);

    const landmarks = await findLandmarks(37.5, 127, 400);

    expect(landmarks.map((l) => l.category)).toEqual([
      "station",
      "bus_stop",
      "convenience",
      "station_exit",
    ]);
  });

  it("skips anonymous or malformed elements without dropping the whole batch", async () => {
    mockedOverpassFetch.mockResolvedValue([
      node(1, { amenity: "cafe" }),
      { id: "bad", lat: 37.5, lon: 127.0, tags: { name: "Bad" } },
      node(2, { name: "Good Cafe", amenity: "cafe" }),
    ]);

    const landmarks = await findLandmarks(37.5, 127, 400);

    expect(landmarks).toHaveLength(1);
    expect(landmarks[0]).toMatchObject({ id: "2", name: "Good Cafe", category: "cafe" });
  });
});
