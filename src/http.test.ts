import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nominatimGate, _resetNominatimGate, fetchWithTimeout } from "./http.js";

// Helper: drain microtasks so `then(() => ...)` callbacks attached to an
// already-resolved promise actually run. vi.advanceTimersByTimeAsync flushes
// timers but each `setTimeout(resolve, ...)` only resolves the next link in
// the chain; we still need to let .then callbacks fire before reading state.
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("nominatimGate", () => {
  beforeEach(() => {
    _resetNominatimGate();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets the first caller through immediately", async () => {
    let resolved = false;
    nominatimGate().then(() => {
      resolved = true;
    });
    await flushMicrotasks();
    expect(resolved).toBe(true);
  });

  it("blocks the second caller until the 1.1s gate window elapses", async () => {
    await nominatimGate(); // first, immediate

    let secondResolved = false;
    nominatimGate().then(() => {
      secondResolved = true;
    });

    // Just shy of the window: still blocked.
    await vi.advanceTimersByTimeAsync(1099);
    await flushMicrotasks();
    expect(secondResolved).toBe(false);

    // Crossing the window resolves it.
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(secondResolved).toBe(true);
  });

  it("serializes three callers, each waiting the full window for the previous", async () => {
    const order: string[] = [];
    nominatimGate().then(() => order.push("a"));
    nominatimGate().then(() => order.push("b"));
    nominatimGate().then(() => order.push("c"));

    await flushMicrotasks();
    expect(order).toEqual(["a"]);

    await vi.advanceTimersByTimeAsync(1100);
    await flushMicrotasks();
    expect(order).toEqual(["a", "b"]);

    await vi.advanceTimersByTimeAsync(1100);
    await flushMicrotasks();
    expect(order).toEqual(["a", "b", "c"]);
  });
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
