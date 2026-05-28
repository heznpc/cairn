import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  nominatimGate,
  _resetNominatimGate,
  _resetOverpassGate,
  fetchWithTimeout,
} from "./http.js";

// Helper: drain microtasks so `then(() => ...)` callbacks attached to an
// already-resolved promise actually run. vi.advanceTimersByTimeAsync flushes
// timers but each `setTimeout(resolve, ...)` only resolves the next link in
// the chain; we still need to let .then callbacks fire before reading state.
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

// Module-top reset: every test, every describe, starts with a clean
// nominatimChain / overpassChain. Without this, fake-timer state from one
// describe can leave a chain pointing at a forever-pending promise for the
// next.
beforeEach(() => {
  _resetNominatimGate();
  _resetOverpassGate();
});

// Restore any vi.spyOn from a failed assertion path. Without this, a thrown
// `expect(...).rejects.toThrow(...)` skips the per-test mockRestore() and
// leaks the fetch stub into subsequent tests, producing cascading failures
// that mask the original bug.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("nominatimGate", () => {
  beforeEach(() => {
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

  it("honors a pre-aborted external signal (addEventListener fires only on transition)", async () => {
    // Regression: addEventListener("abort", ...) does NOT fire when the
    // signal is already aborted at attach time. Without the explicit
    // `if (externalSignal.aborted) controller.abort()` guard, fetch would
    // run to completion ignoring caller-side cancellation.
    let fetchInvokedWithAbortedSignal = false;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      fetchInvokedWithAbortedSignal = !!init?.signal?.aborted;
      // Mirror real fetch: if signal is already aborted, reject immediately.
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return Promise.resolve(new Response("late", { status: 200 }));
    });

    const ac = new AbortController();
    ac.abort();
    await expect(
      fetchWithTimeout("https://example.test/x", { signal: ac.signal }),
    ).rejects.toThrow();
    expect(fetchInvokedWithAbortedSignal).toBe(true);
  });
});
