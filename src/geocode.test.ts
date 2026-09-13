import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { geocode, searchGeocode, AmbiguousGeocodeError } from "./geocode.js";
import { _resetNominatimGate, _resetOverpassGate } from "./http.js";

function mockFetchJson(body: unknown, init: ResponseInit = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      statusText: init.statusText,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  _resetNominatimGate();
  _resetOverpassGate();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("geocode", () => {
  const matches = [
    { osm_type: "relation", osm_id: 1, lat: "42.1", lon: "-72.6", display_name: "Springfield, Massachusetts" },
    { osm_type: "relation", osm_id: 2, lat: "39.8", lon: "-89.6", display_name: "Springfield, Illinois" },
  ];

  it("returns candidate identities and refuses to silently choose an ambiguous address", async () => {
    const fetch = mockFetchJson(matches);
    const result = await searchGeocode("Springfield");
    expect(result.ambiguous).toBe(true);
    expect(result.candidates.map((candidate) => candidate.candidateId)).toEqual(["relation:1", "relation:2"]);
    expect(String(fetch.mock.calls[0][0])).toContain("limit=5");
    await expect(geocode("Springfield")).rejects.toBeInstanceOf(AmbiguousGeocodeError);
    await expect(geocode("Springfield")).rejects.toThrow(/--candidate.*\nrelation:1:.*\nrelation:2:/);
  });

  it("selects the same OSM identity after search ranking changes", async () => {
    mockFetchJson([...matches].reverse());
    expect(await geocode("Springfield", { candidateId: "relation:1" })).toMatchObject({
      lat: 42.1, lon: -72.6, displayName: "Springfield, Massachusetts",
    });
  });

  it("rejects a stale candidate instead of substituting the first result", async () => {
    mockFetchJson([matches[1]]);
    await expect(geocode("Springfield", { candidateId: "relation:1" })).rejects.toThrow(/no longer in the results/);
  });

  it("deduplicates the same OSM object without collapsing nearby distinct places", async () => {
    mockFetchJson([matches[0], matches[0]]);
    expect((await searchGeocode("Springfield")).ambiguous).toBe(false);
    mockFetchJson([matches[0], { ...matches[0], osm_id: 3, lon: "-72.60001" }]);
    expect((await searchGeocode("nearby")).ambiguous).toBe(true);
  });

  it("keeps interpolated house numbers on the same OSM way selectable separately", async () => {
    mockFetchJson([
      { osm_type: "way", osm_id: 1, class: "place", type: "house", lat: "37.5", lon: "127", display_name: "10 Example Street" },
      { osm_type: "way", osm_id: 1, class: "place", type: "house", lat: "37.5001", lon: "127", display_name: "12 Example Street" },
    ]);
    const result = await searchGeocode("Example Street");
    expect(result.ambiguous).toBe(true);
    expect(new Set(result.candidates.map((candidate) => candidate.candidateId)).size).toBe(2);
  });

  it("parses the first Nominatim hit and preserves the raw payload", async () => {
    const raw = {
      lat: "37.566535",
      lon: "126.9779692",
      display_name: "Seoul, South Korea",
      address: { city: "Seoul", country_code: "kr" },
    };
    mockFetchJson([raw]);

    const result = await geocode("Seoul");

    expect(result).toMatchObject({
      lat: 37.566535,
      lon: 126.9779692,
      displayName: "Seoul, South Korea",
      raw,
    });
  });

  it("throws when Nominatim returns no hits", async () => {
    mockFetchJson([]);

    await expect(geocode("nowhere")).rejects.toThrow(
      /No geocoding results/,
    );
  });

  it("throws on an unexpected Nominatim envelope", async () => {
    mockFetchJson({ error: "not an array" });

    await expect(geocode("Seoul")).rejects.toThrow(
      /unexpected response shape/,
    );
  });

  it("throws when the first hit is missing required fields", async () => {
    mockFetchJson([{ lat: "37.5", lon: "127.0" }]);

    await expect(geocode("Seoul")).rejects.toThrow(
      /unexpected response shape/,
    );
  });

  it("rejects non-finite coordinate strings instead of returning NaN", async () => {
    mockFetchJson([
      { lat: "37.5abc", lon: "127.0", display_name: "bad lat" },
    ]);

    await expect(geocode("bad")).rejects.toThrow(/invalid lat/);
  });

  it("rejects out-of-range coordinates", async () => {
    mockFetchJson([
      { lat: "91", lon: "127.0", display_name: "bad lat" },
    ]);

    await expect(geocode("bad")).rejects.toThrow(/invalid lat/);
  });

  it("throws a status-aware error on non-2xx responses", async () => {
    mockFetchJson({ error: "rate limited" }, {
      status: 429,
      statusText: "Too Many Requests",
    });

    await expect(geocode("Seoul")).rejects.toThrow(
      /Geocoding failed: 429 Too Many Requests/,
    );
  });
});
