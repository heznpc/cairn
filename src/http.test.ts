import { describe, it, expect, beforeEach, vi } from "vitest";
import { nominatimGate, _resetNominatimGate, fetchWithTimeout } from "./http.js";

beforeEach(() => {
  _resetNominatimGate();
});

describe("nominatimGate", () => {
  it("lets the first caller through immediately", async () => {
    const start = Date.now();
    await nominatimGate();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("serializes consecutive callers with ~1.1s spacing", async () => {
    await nominatimGate(); // first call, immediate

    const start = Date.now();
    await nominatimGate(); // second call, must wait
    const gap = Date.now() - start;

    expect(gap).toBeGreaterThanOrEqual(1000);
    expect(gap).toBeLessThan(1500);
  }, 5000);

  it("serializes three callers in order with cumulative spacing", async () => {
    const stamps: number[] = [];
    const t0 = Date.now();

    const p1 = nominatimGate().then(() => stamps.push(Date.now() - t0));
    const p2 = nominatimGate().then(() => stamps.push(Date.now() - t0));
    const p3 = nominatimGate().then(() => stamps.push(Date.now() - t0));

    await Promise.all([p1, p2, p3]);

    expect(stamps[0]).toBeLessThan(50);
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(1000);
    expect(stamps[2] - stamps[1]).toBeGreaterThanOrEqual(1000);
  }, 6000);
});

describe("fetchWithTimeout", () => {
  it("aborts with a useful message when the request exceeds timeoutMs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    await expect(
      fetchWithTimeout("https://example.test/slow", { timeoutMs: 50 }),
    ).rejects.toThrow(/timed out after 50ms/);

    fetchSpy.mockRestore();
  });

  it("returns the response when fetch resolves before timeout", async () => {
    const fakeResponse = new Response("ok", { status: 200 });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeResponse);

    const res = await fetchWithTimeout("https://example.test/fast", {
      timeoutMs: 1000,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");

    fetchSpy.mockRestore();
  });
});
