import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { geocode } from "./geocode.js";
import { overpassFetch } from "./overpass.js";
import { _resetNominatimGate, _resetOverpassGate } from "./http.js";
import type { UpstreamOptions } from "./upstream-config.js";

const hit = {
  lat: "37.566535",
  lon: "126.9779692",
  display_name: "Seoul, South Korea",
  address: { country_code: "kr" },
};

let cacheDir: string;

// Retries are exercised here, so opt out of the suite-wide CAIRN_ATTEMPTS=1 and
// use a zero backoff plus zero gate spacing to keep it wall-clock free.
function upstream(overrides: UpstreamOptions = {}): UpstreamOptions {
  return {
    cacheDir,
    cacheMode: "off",
    attempts: 3,
    retryBaseDelayMs: 0,
    nominatimMinIntervalMs: 0,
    overpassMinIntervalMs: 0,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200, statusText?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

// A Response body can only be read once, so every call needs a fresh object.
// `mockResolvedValue` would hand the same instance to the second request.
function mockJson(body: unknown, status = 200, statusText?: string) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => jsonResponse(body, status, statusText));
}

beforeEach(async () => {
  _resetNominatimGate();
  _resetOverpassGate();
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "cairn-upstream-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(cacheDir, { recursive: true, force: true });
});

describe("retrying transient upstream failures", () => {
  it("retries a 429 and succeeds on a later attempt", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({}, 429, "Too Many Requests"))
      .mockResolvedValueOnce(jsonResponse([hit]));

    const result = await geocode("Seoul", { upstream: upstream() });

    expect(result.lat).toBeCloseTo(37.566535);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries an Overpass 504, which the public instance returns under load", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({}, 504, "Gateway Timeout"))
      .mockResolvedValueOnce(jsonResponse({ elements: [{ id: 1 }] }));

    const elements = await overpassFetch("[out:json];out;", 1000, upstream());

    expect(elements).toEqual([{ id: 1 }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured attempts and reports the status", async () => {
    const fetchSpy = mockJson({}, 429, "Too Many Requests");

    await expect(
      geocode("Seoul", { upstream: upstream({ attempts: 2 }) }),
    ).rejects.toThrow(/Geocoding failed: 429 Too Many Requests/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not retry a client error that will not fix itself", async () => {
    const fetchSpy = mockJson({}, 400, "Bad Request");

    await expect(geocode("Seoul", { upstream: upstream() })).rejects.toThrow(
      /Geocoding failed: 400 Bad Request/,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

});

describe("caching upstream responses", () => {
  it("serves a repeated geocode from disk without a second request", async () => {
    const fetchSpy = mockJson([hit]);
    const opts = { upstream: upstream({ cacheMode: "auto" as const }) };

    const first = await geocode("Seoul", opts);
    const second = await geocode("Seoul", opts);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second.displayName).toBe(first.displayName);
  });

  it("keys the cache on the requested language", async () => {
    const fetchSpy = mockJson([hit]);
    const opts = { upstream: upstream({ cacheMode: "auto" as const }) };

    await geocode("Seoul", { ...opts, language: "ko" });
    await geocode("Seoul", { ...opts, language: "ja" });

    // Different Accept-Language returns different names, so it must not reuse.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("keys the cache on the endpoint so mirrors do not share answers", async () => {
    const fetchSpy = mockJson([hit]);

    await geocode("Seoul", {
      upstream: upstream({ cacheMode: "auto", nominatimUrl: "https://a.test/search" }),
    });
    await geocode("Seoul", {
      upstream: upstream({ cacheMode: "auto", nominatimUrl: "https://b.test/search" }),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("refresh mode re-fetches and overwrites the stored entry", async () => {
    const fetchSpy = mockJson([hit]);

    await geocode("Seoul", { upstream: upstream({ cacheMode: "auto" }) });
    await geocode("Seoul", { upstream: upstream({ cacheMode: "refresh" }) });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("offline mode answers from cache without touching the network", async () => {
    const fetchSpy = mockJson([hit]);
    await geocode("Seoul", { upstream: upstream({ cacheMode: "auto" }) });
    fetchSpy.mockClear();

    const result = await geocode("Seoul", { upstream: upstream({ cacheMode: "offline" }) });

    expect(result.displayName).toBe("Seoul, South Korea");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("offline mode fails with an actionable message on a miss", async () => {
    const fetchSpy = mockJson([hit]);

    await expect(
      geocode("Nowhere", { upstream: upstream({ cacheMode: "offline" }) }),
    ).rejects.toThrow(/Offline mode: no cached response for "Nowhere"/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
