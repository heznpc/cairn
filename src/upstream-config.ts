/**
 * How cairn talks to its OSM upstreams: endpoints, rate-limit spacing, retry
 * budget, and on-disk cache policy.
 *
 * Everything has a working default, so `npx cairn <address>` still needs no
 * configuration. The knobs exist for the two cases the public endpoints can't
 * serve: iterating on the same address repeatedly (cache) and pointing at a
 * self-hosted or paid mirror (endpoints + spacing).
 *
 * Precedence is explicit option -> environment variable -> default. Options
 * come from the CLI; environment variables are the right channel for an MCP
 * server, where the operator owns the deployment and the host LLM must not be
 * able to choose a URL.
 */

import os from "node:os";
import path from "node:path";

/**
 * - `auto`    read fresh cache, otherwise fetch and store (default)
 * - `refresh` always fetch, overwrite the cache
 * - `offline` cache only; a miss is an error, never a network call
 * - `off`     never read or write the cache
 */
export type CacheMode = "auto" | "refresh" | "offline" | "off";

const CACHE_MODES: readonly CacheMode[] = ["auto", "refresh", "offline", "off"];

export const DEFAULT_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
export const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Public-instance courtesy limits: Nominatim enforces 1 req/s, Overpass asks
// for "reasonable use". A private mirror has its own budget, so these are
// overridable rather than baked into the request path.
export const DEFAULT_NOMINATIM_MIN_INTERVAL_MS = 1100;
export const DEFAULT_OVERPASS_MIN_INTERVAL_MS = 1000;

// OSM POI/road data around a fixed address changes on the order of weeks, and
// a week keeps an iterate-then-print session entirely offline after the first
// call.
export const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 500;

export interface UpstreamOptions {
  nominatimUrl?: string;
  overpassUrl?: string;
  nominatimMinIntervalMs?: number;
  overpassMinIntervalMs?: number;
  cacheMode?: CacheMode;
  cacheDir?: string;
  cacheTtlMs?: number;
  /** Total attempts per request, including the first. 1 disables retrying. */
  attempts?: number;
  /** First backoff step; doubles per retry. 0 makes retries immediate. */
  retryBaseDelayMs?: number;
}

export interface ResolvedUpstream {
  nominatimUrl: string;
  overpassUrl: string;
  nominatimMinIntervalMs: number;
  overpassMinIntervalMs: number;
  cacheMode: CacheMode;
  cacheDir: string;
  cacheTtlMs: number;
  attempts: number;
  retryBaseDelayMs: number;
}

export function resolveUpstream(opts: UpstreamOptions = {}): ResolvedUpstream {
  return {
    nominatimUrl: httpUrl(
      "CAIRN_NOMINATIM_URL",
      opts.nominatimUrl ?? process.env.CAIRN_NOMINATIM_URL,
      DEFAULT_NOMINATIM_URL,
    ),
    overpassUrl: httpUrl(
      "CAIRN_OVERPASS_URL",
      opts.overpassUrl ?? process.env.CAIRN_OVERPASS_URL,
      DEFAULT_OVERPASS_URL,
    ),
    nominatimMinIntervalMs: intValue(
      "CAIRN_NOMINATIM_MIN_INTERVAL_MS",
      opts.nominatimMinIntervalMs ?? process.env.CAIRN_NOMINATIM_MIN_INTERVAL_MS,
      DEFAULT_NOMINATIM_MIN_INTERVAL_MS,
      0,
    ),
    overpassMinIntervalMs: intValue(
      "CAIRN_OVERPASS_MIN_INTERVAL_MS",
      opts.overpassMinIntervalMs ?? process.env.CAIRN_OVERPASS_MIN_INTERVAL_MS,
      DEFAULT_OVERPASS_MIN_INTERVAL_MS,
      0,
    ),
    cacheMode: cacheMode(opts.cacheMode ?? process.env.CAIRN_CACHE_MODE),
    cacheDir: opts.cacheDir ?? process.env.CAIRN_CACHE_DIR ?? defaultCacheDir(),
    cacheTtlMs: cacheTtlMs(opts.cacheTtlMs),
    attempts: intValue(
      "CAIRN_ATTEMPTS",
      opts.attempts ?? process.env.CAIRN_ATTEMPTS,
      DEFAULT_ATTEMPTS,
      1,
    ),
    retryBaseDelayMs: intValue(
      "CAIRN_RETRY_BASE_DELAY_MS",
      opts.retryBaseDelayMs ?? process.env.CAIRN_RETRY_BASE_DELAY_MS,
      DEFAULT_RETRY_BASE_DELAY_MS,
      0,
    ),
  };
}

export function defaultCacheDir(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  const base = xdg && xdg.trim().length > 0 ? xdg : path.join(os.homedir(), ".cache");
  return path.join(base, "cairn");
}

export function isCacheMode(value: string): value is CacheMode {
  return (CACHE_MODES as readonly string[]).includes(value);
}

export const CACHE_MODE_CHOICES = CACHE_MODES;

function cacheMode(value: CacheMode | string | undefined): CacheMode {
  if (value === undefined) return "auto";
  if (!isCacheMode(value)) {
    throw new Error(
      `Invalid cache mode "${value}" (expected ${CACHE_MODES.join(", ")})`,
    );
  }
  return value;
}

function cacheTtlMs(explicit: number | undefined): number {
  if (explicit !== undefined) {
    if (!Number.isFinite(explicit) || explicit < 0) {
      throw new Error(`Invalid cache TTL: ${explicit}`);
    }
    return explicit;
  }
  const raw = process.env.CAIRN_CACHE_TTL_HOURS;
  if (raw === undefined) return DEFAULT_CACHE_TTL_MS;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error(
      `CAIRN_CACHE_TTL_HOURS must be a non-negative number (got: "${raw}")`,
    );
  }
  return Math.round(hours * 60 * 60 * 1000);
}

// Reject anything but http/https: a cache-poisoned or mistyped `file://` or
// `gopher://` endpoint should fail loudly instead of reading local paths.
function httpUrl(name: string, value: string | undefined, fallback: string): string {
  if (value === undefined || value.trim().length === 0) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL (got: "${value}")`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must be an http(s) URL (got: "${value}")`);
  }
  return parsed.toString();
}

function intValue(
  name: string,
  value: number | string | undefined,
  fallback: number,
  min: number,
): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${name} must be an integer >= ${min} (got: "${value}")`);
  }
  return parsed;
}
