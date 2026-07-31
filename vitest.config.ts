import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/tmp/**",
      "**/.claude/**",
    ],
    env: {
      // Unit tests must never read or write the real user cache: a stored
      // response would satisfy the next test's mocked fetch and silently make
      // assertions pass against stale data. Cache behavior itself is covered
      // by cache.test.ts using a temp directory.
      CAIRN_CACHE_MODE: "off",
      // Keep retry-driven suites fast and free of wall-clock waits.
      CAIRN_ATTEMPTS: "1",
      CAIRN_NOMINATIM_MIN_INTERVAL_MS: "0",
      CAIRN_OVERPASS_MIN_INTERVAL_MS: "0",
    },
  },
});
