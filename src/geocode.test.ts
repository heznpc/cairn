import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { geocode } from "./geocode.js";
import { _resetNominatimGate, _resetOverpassGate } from "./http.js";

function mockFetchJson(body: unknown, init: ResponseInit = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
