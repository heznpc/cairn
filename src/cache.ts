/**
 * Content-addressed disk cache for upstream response bodies.
 *
 * The point is iteration: generating a map, nudging a label, re-rendering, and
 * printing should cost one set of network calls, not one per attempt. The
 * public OSM endpoints will rate-limit a tight loop, so caching is what makes
 * repeated real use practical — and it is what `offline` mode reads from.
 *
 * Entries are stored as the raw response body, with freshness taken from the
 * file's mtime. No envelope, so a cached Overpass response is byte-identical to
 * what the API returned and can be inspected with any JSON tool.
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ResolvedUpstream } from "./upstream-config.js";

/** Thrown when `offline` mode has no entry to serve. */
export class CacheMissError extends Error {
  constructor(description: string) {
    super(
      `Offline mode: no cached response for ${description}. ` +
        `Run once without --offline to populate the cache.`,
    );
    this.name = "CacheMissError";
  }
}

/**
 * Stable key for a request. Callers pass the parts that change the response
 * (endpoint, query, language); anything omitted must not affect the body.
 */
export function cacheKey(parts: readonly string[]): string {
  const hash = createHash("sha256");
  // Length-prefix each part so ["ab","c"] and ["a","bc"] can't collide.
  for (const part of parts) hash.update(`${part.length}:${part}`);
  return hash.digest("hex").slice(0, 40);
}

function entryPath(cfg: ResolvedUpstream, namespace: string, key: string): string {
  return path.join(cfg.cacheDir, namespace, `${key}.json`);
}

/**
 * Read a cache entry, or undefined when absent, stale, or unreadable.
 *
 * A stale or corrupt entry is treated as a miss rather than an error: the
 * caller can still reach the network, and a broken cache must never be fatal.
 * `offline` mode ignores the TTL — a stale answer beats no answer when there is
 * no network path by definition.
 */
export async function readCacheEntry(
  cfg: ResolvedUpstream,
  namespace: string,
  key: string,
): Promise<string | undefined> {
  if (cfg.cacheMode === "off" || cfg.cacheMode === "refresh") return undefined;

  const file = entryPath(cfg, namespace, key);
  try {
    const [stat, body] = await Promise.all([
      fs.stat(file),
      fs.readFile(file, "utf8"),
    ]);
    if (cfg.cacheMode !== "offline") {
      const age = Date.now() - stat.mtimeMs;
      if (age > cfg.cacheTtlMs) return undefined;
    }
    return body;
  } catch {
    return undefined;
  }
}

/**
 * Store a response body. Writes to a unique temp file and renames, so a crash
 * or a concurrent `cairn` process can never leave a half-written entry that a
 * later read would parse as valid JSON.
 *
 * Cache writes are best-effort: a read-only or full disk degrades to "no
 * caching", never to a failed map.
 */
export async function writeCacheEntry(
  cfg: ResolvedUpstream,
  namespace: string,
  key: string,
  body: string,
): Promise<void> {
  if (cfg.cacheMode === "off" || cfg.cacheMode === "offline") return;

  const file = entryPath(cfg, namespace, key);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(temp, body, "utf8");
    await fs.rename(temp, file);
  } catch {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}
