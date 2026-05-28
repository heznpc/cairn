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
 * or an out-of-process semaphore. Surfaced in CLAUDE.md / NOTES.md.
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
  intervalMs: number,
): () => Promise<void> {
  return () => {
    const wait = getChain();
    setChain(
      wait.then(
        () => new Promise<void>((resolve) => setTimeout(resolve, intervalMs)),
      ),
    );
    return wait;
  };
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
