/**
 * One place where a cairn request to an OSM upstream becomes a response body:
 * cache lookup -> rate-limit gate -> retrying fetch -> cache store.
 *
 * `geocode.ts` and `overpass.ts` differ only in endpoint, HTTP method, and
 * error wording, so they both go through here. Keeping the order in a single
 * function is what guarantees a cache hit never touches the network and never
 * consumes a rate-limit slot.
 */

import {
  CacheMissError,
  cacheKey,
  readCacheEntry,
  writeCacheEntry,
} from "./cache.js";
import {
  fetchTextWithRetry,
  nominatimGate,
  overpassGate,
  type FetchOptions,
  type Gate,
} from "./http.js";
import { HTTP_USER_AGENT } from "./metadata.js";
import type { ResolvedUpstream } from "./upstream-config.js";

export interface UpstreamRequest {
  /** Cache subdirectory, e.g. "geocode" or "overpass". */
  namespace: string;
  url: string;
  /** Parts that change the response body; used to build the cache key. */
  keyParts: readonly string[];
  /** Human-readable request description used in offline-miss errors. */
  description: string;
  errorLabel: string;
  gate: Gate;
  gateIntervalMs: number;
  init?: FetchOptions;
}

export async function fetchUpstreamText(
  cfg: ResolvedUpstream,
  req: UpstreamRequest,
): Promise<string> {
  // The endpoint is part of the key: pointing at a different mirror must not
  // serve another mirror's cached answer.
  const key = cacheKey([req.url, ...req.keyParts]);

  const cached = await readCacheEntry(cfg, req.namespace, key);
  if (cached !== undefined) return cached;

  if (cfg.cacheMode === "offline") {
    throw new CacheMissError(req.description);
  }

  const body = await fetchTextWithRetry(req.url, {
    init: req.init,
    attempts: cfg.attempts,
    baseDelayMs: cfg.retryBaseDelayMs,
    gate: req.gate,
    gateIntervalMs: req.gateIntervalMs,
    errorLabel: req.errorLabel,
  });

  await writeCacheEntry(cfg, req.namespace, key, body);
  return body;
}

/** Nominatim GET. `url` already carries the query string. */
export function nominatimRequest(
  cfg: ResolvedUpstream,
  url: string,
  description: string,
  acceptLanguage?: string,
): UpstreamRequest {
  return {
    namespace: "geocode",
    url,
    // Accept-Language changes the returned names, so it belongs in the key.
    keyParts: [acceptLanguage ?? ""],
    description,
    errorLabel: "Geocoding failed",
    gate: nominatimGate,
    gateIntervalMs: cfg.nominatimMinIntervalMs,
    init: {
      headers: {
        "User-Agent": HTTP_USER_AGENT,
        ...(acceptLanguage ? { "Accept-Language": acceptLanguage } : {}),
      },
      timeoutMs: 8000,
    },
  };
}

/** Overpass POST. The QL query is both the body and the cache key. */
export function overpassRequest(
  cfg: ResolvedUpstream,
  query: string,
  timeoutMs: number,
): UpstreamRequest {
  return {
    namespace: "overpass",
    url: cfg.overpassUrl,
    keyParts: [query],
    description: "this Overpass query",
    errorLabel: "Overpass query failed",
    gate: overpassGate,
    gateIntervalMs: cfg.overpassMinIntervalMs,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": HTTP_USER_AGENT,
        Accept: "application/json",
      },
      body: `data=${encodeURIComponent(query)}`,
      timeoutMs,
    },
  };
}
