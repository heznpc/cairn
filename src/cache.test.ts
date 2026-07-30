import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CacheMissError,
  cacheKey,
  readCacheEntry,
  writeCacheEntry,
} from "./cache.js";
import { resolveUpstream, type CacheMode } from "./upstream-config.js";

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "cairn-cache-"));
});

afterEach(async () => {
  await fs.rm(cacheDir, { recursive: true, force: true });
});

function config(mode: CacheMode, ttlMs = 60_000) {
  return resolveUpstream({ cacheMode: mode, cacheDir, cacheTtlMs: ttlMs });
}

describe("cacheKey", () => {
  it("is stable for the same parts", () => {
    expect(cacheKey(["a", "b"])).toBe(cacheKey(["a", "b"]));
  });

  it("separates parts so concatenations cannot collide", () => {
    expect(cacheKey(["ab", "c"])).not.toBe(cacheKey(["a", "bc"]));
  });
});

describe("cache entries", () => {
  it("round-trips a body in auto mode", async () => {
    const cfg = config("auto");
    await writeCacheEntry(cfg, "geocode", "k1", '{"ok":true}');

    expect(await readCacheEntry(cfg, "geocode", "k1")).toBe('{"ok":true}');
  });

  it("keeps namespaces separate", async () => {
    const cfg = config("auto");
    await writeCacheEntry(cfg, "geocode", "same", "from-geocode");
    await writeCacheEntry(cfg, "overpass", "same", "from-overpass");

    expect(await readCacheEntry(cfg, "geocode", "same")).toBe("from-geocode");
    expect(await readCacheEntry(cfg, "overpass", "same")).toBe("from-overpass");
  });

  it("treats an absent entry as a miss", async () => {
    expect(await readCacheEntry(config("auto"), "geocode", "nope")).toBeUndefined();
  });

  it("treats an entry older than the TTL as a miss", async () => {
    const cfg = config("auto", 1_000);
    await writeCacheEntry(cfg, "geocode", "old", "stale");

    // Backdate the file: freshness comes from mtime.
    const file = path.join(cacheDir, "geocode", "old.json");
    const past = new Date(Date.now() - 60_000);
    await fs.utimes(file, past, past);

    expect(await readCacheEntry(cfg, "geocode", "old")).toBeUndefined();
  });

  it("serves a stale entry in offline mode, where a stale answer beats none", async () => {
    const writable = config("auto", 1_000);
    await writeCacheEntry(writable, "geocode", "old", "stale");
    const file = path.join(cacheDir, "geocode", "old.json");
    const past = new Date(Date.now() - 60_000);
    await fs.utimes(file, past, past);

    expect(await readCacheEntry(config("offline", 1_000), "geocode", "old")).toBe(
      "stale",
    );
  });

  it("refresh mode ignores existing entries but still stores fresh ones", async () => {
    await writeCacheEntry(config("auto"), "geocode", "k", "old");
    const refresh = config("refresh");

    expect(await readCacheEntry(refresh, "geocode", "k")).toBeUndefined();

    await writeCacheEntry(refresh, "geocode", "k", "new");
    expect(await readCacheEntry(config("auto"), "geocode", "k")).toBe("new");
  });

  it("off mode neither reads nor writes", async () => {
    const off = config("off");
    await writeCacheEntry(off, "geocode", "k", "body");

    expect(await readCacheEntry(off, "geocode", "k")).toBeUndefined();
    // Nothing was persisted, so a cache-enabled read misses too.
    expect(await readCacheEntry(config("auto"), "geocode", "k")).toBeUndefined();
  });

  it("offline mode never writes, so it cannot mask a missing entry", async () => {
    const offline = config("offline");
    await writeCacheEntry(offline, "geocode", "k", "body");

    expect(await readCacheEntry(config("auto"), "geocode", "k")).toBeUndefined();
  });

  it("leaves no temp files behind after a write", async () => {
    const cfg = config("auto");
    await writeCacheEntry(cfg, "geocode", "k", "body");

    const files = await fs.readdir(path.join(cacheDir, "geocode"));
    expect(files).toEqual(["k.json"]);
  });

  it("degrades to no caching instead of throwing when the dir is unusable", async () => {
    // A file where the namespace directory should be makes mkdir fail.
    const cfg = resolveUpstream({ cacheMode: "auto", cacheDir });
    await fs.writeFile(path.join(cacheDir, "geocode"), "not a directory", "utf8");

    await expect(
      writeCacheEntry(cfg, "geocode", "k", "body"),
    ).resolves.toBeUndefined();
    expect(await readCacheEntry(cfg, "geocode", "k")).toBeUndefined();
  });
});

describe("CacheMissError", () => {
  it("names the request and points at the fix", () => {
    const error = new CacheMissError('"Seoul"');
    expect(error.message).toContain('"Seoul"');
    expect(error.message).toContain("--offline");
  });
});
