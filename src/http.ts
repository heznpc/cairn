/**
 * Shared HTTP helpers: AbortController-based timeouts and a Nominatim
 * rate-limit gate.
 *
 * Nominatim's public instance enforces a 1 req/sec absolute QPS limit. The
 * gate serializes `geocode()` calls through a promise chain that inserts
 * a fixed delay between consecutive starts — even when callers race.
 */

const NOMINATIM_MIN_INTERVAL_MS = 1100; // 1s policy + 100ms safety margin
const DEFAULT_TIMEOUT_MS = 8000;

let nominatimChain: Promise<void> = Promise.resolve();

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  url: string,
  init: FetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...rest } = init;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (externalSignal) externalSignal.addEventListener("abort", onAbort);

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted && !(externalSignal?.aborted)) {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
  }
}

/**
 * Wait for the rate-limit gate before issuing a Nominatim request.
 * The returned promise resolves when it's safe to send the next request;
 * the chain is advanced by NOMINATIM_MIN_INTERVAL_MS regardless of caller
 * fetch duration, so even rapid concurrent callers are serialized.
 */
export function nominatimGate(): Promise<void> {
  const wait = nominatimChain;
  nominatimChain = wait.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, NOMINATIM_MIN_INTERVAL_MS)),
  );
  return wait;
}

// Test-only: reset the gate so unit tests don't bleed state between cases.
export function _resetNominatimGate(): void {
  nominatimChain = Promise.resolve();
}
