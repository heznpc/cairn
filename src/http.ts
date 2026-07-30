/**
 * Shared HTTP helpers: AbortController-based timeouts and per-upstream
 * rate-limit gates.
 *
 * The gates serialize callers through a promise chain that inserts a fixed
 * delay between consecutive starts.
 *
 * SCOPE: the chains are module-scoped, i.e. per Node process. Parallel CLI
 * invocations (`cairn addr1 & cairn addr2`) each get their own chain and
 * bypass the gate. This is acceptable for the v0.x CLI/MCP single-process
 * use case; a future shared-host deployment would need a filesystem lock
 * or an out-of-process semaphore.
 */

const NOMINATIM_MIN_INTERVAL_MS = 1100; // OSM 1 req/s policy + 100ms margin
// Overpass's "reasonable use" policy is gentler than Nominatim's hard 1 req/s,
// but the `find_landmarks` tool description invites bursty curation loops, so
// we serialize at 1s spacing to keep a single host LLM from inadvertently
// 429'ing the public instance.
const OVERPASS_MIN_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 8000;

let nominatimChain: Promise<void> = Promise.resolve();
let overpassChain: Promise<void> = Promise.resolve();

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
  if (externalSignal) {
    externalSignal.addEventListener("abort", onAbort);
    // addEventListener only fires on transition, not on pre-aborted state —
    // honor an already-aborted caller signal explicitly. Without this, fetch
    // would run to completion, wasting a rate-limit slot and a socket.
    if (externalSignal.aborted) controller.abort();
  }

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

function makeGate(
  getChain: () => Promise<void>,
  setChain: (p: Promise<void>) => void,
  defaultIntervalMs: number,
): (intervalMs?: number) => Promise<void> {
  return (intervalMs = defaultIntervalMs) => {
    const wait = getChain();
    setChain(
      wait.then(
        () => new Promise<void>((resolve) => setTimeout(resolve, intervalMs)),
      ),
    );
    return wait;
  };
}

export type Gate = (intervalMs?: number) => Promise<void>;

// Transient upstream conditions. 429 is the public OSM instances throttling us;
// 502/503/504 is Overpass shedding load, which it does routinely on dense
// queries. Retrying these is the difference between "cairn is flaky" and
// "cairn works on a busy afternoon".
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 8_000;
// Trust `Retry-After` only up to a bound: a very long value would look like a
// hang to the caller, and failing with a clear message is more useful.
const MAX_RETRY_AFTER_MS = 30_000;

export interface RetryFetchOptions {
  init?: FetchOptions;
  /** Total attempts including the first. */
  attempts: number;
  /** First backoff step; doubles per retry. 0 retries immediately. */
  baseDelayMs: number;
  gate: Gate;
  gateIntervalMs: number;
  /** Prefix for HTTP errors, e.g. "Geocoding failed". */
  errorLabel: string;
}

/**
 * Fetch a response body, honoring the upstream rate-limit gate on every
 * attempt and retrying transient failures with exponential backoff.
 *
 * The gate is re-acquired per attempt on purpose: a retry is a new request and
 * must respect the same spacing policy as the first one.
 */
export async function fetchTextWithRetry(
  url: string,
  opts: RetryFetchOptions,
): Promise<string> {
  const { init, attempts, baseDelayMs, gate, gateIntervalMs, errorLabel } = opts;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    await gate(gateIntervalMs);

    let res: Response;
    try {
      res = await fetchWithTimeout(url, init);
    } catch (err) {
      // Timeouts and socket errors are transient by nature. A caller-initiated
      // abort is not, so surface it immediately instead of burning retries.
      lastError = err instanceof Error ? err : new Error(String(err));
      if (init?.signal?.aborted || attempt === attempts) throw lastError;
      await sleep(backoffMs(attempt, baseDelayMs));
      continue;
    }

    if (res.ok) return await res.text();

    const httpError = new Error(`${errorLabel}: ${res.status} ${res.statusText}`);
    if (!RETRYABLE_STATUS.has(res.status) || attempt === attempts) throw httpError;
    lastError = httpError;
    await sleep(retryAfterMs(res) ?? backoffMs(attempt, baseDelayMs));
  }

  throw lastError ?? new Error(`${errorLabel}: no attempts were made`);
}

/** Exponential backoff with jitter, so parallel clients don't resynchronize. */
export function backoffMs(attempt: number, baseDelayMs: number): number {
  if (baseDelayMs <= 0) return 0;
  const step = Math.min(baseDelayMs * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return step + Math.random() * Math.min(baseDelayMs, 250);
}

function retryAfterMs(res: Response): number | undefined {
  const header = res.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for the Nominatim rate-limit gate. Serializes geocode() calls with
 * 1.1s minimum spacing, honoring OSM's 1 req/sec absolute QPS policy even
 * under concurrent in-process MCP tool calls.
 */
export const nominatimGate = makeGate(
  () => nominatimChain,
  (p) => {
    nominatimChain = p;
  },
  NOMINATIM_MIN_INTERVAL_MS,
);

/**
 * Wait for the Overpass rate-limit gate. Prevents bursty find_landmarks
 * curation loops from a single host LLM from 429'ing the public instance.
 */
export const overpassGate = makeGate(
  () => overpassChain,
  (p) => {
    overpassChain = p;
  },
  OVERPASS_MIN_INTERVAL_MS,
);

// Test-only: reset gates so unit tests don't bleed state between cases.
export function _resetNominatimGate(): void {
  nominatimChain = Promise.resolve();
}
export function _resetOverpassGate(): void {
  overpassChain = Promise.resolve();
}
