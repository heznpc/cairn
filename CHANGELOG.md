# Changelog

All notable changes to **cairn** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Road skeleton (Track A).** cairn now draws the roads you navigate by,
  not just a scatter of landmark points — the change that makes the output
  read as an actual 약도.
  - `src/roads.ts` — `findRoads()` queries Overpass for nearby ways
    (`out geom;`), classifies each into an importance tier
    (primary / secondary / tertiary / residential / path), and simplifies
    the polyline. `roadsFromElements()` is the pure, unit-tested parser.
  - `src/geometry.ts` — Douglas-Peucker polyline simplification with an
    equirectangular (cos-lat) correction so the tolerance is isotropic in
    real distance at city latitudes.
  - New `find_roads` MCP tool (granular, like `find_landmarks`) and a
    `roads` field on `generate_map`'s `layout` output.
  - `generate_map` accepts `roads: false` (and the CLI `--no-roads`) to
    skip the extra Overpass round-trip and render landmarks only.
  - Renderer draws road bands under the landmarks (width/colour by tier)
    and labels each top-tier road once, at its longest segment's midpoint.
- `src/overpass.ts` — shared Overpass client (gate + timeout + envelope
  validation) used by both `landmarks.ts` and `roads.ts`.
- Second rate-limit gate (`overpassGate`, 1 req/s) so the now-two Overpass
  calls per `generate_map`, and bursty `find_landmarks` / `find_roads`
  loops, stay within the public instance's reasonable-use policy.
- `outputSchema` + `structuredContent` on the `generate_map` MCP tool —
  host LLMs can now read `layout` (center, bbox, landmarks, roads) as
  structured JSON instead of parsing the SVG string.
- Tool safety annotations: `readOnlyHint: true`, `openWorldHint: true`
  on every tool.
- Runtime validation of Overpass API responses with zod (defense in
  depth against malformed upstream payloads).
- `SECURITY.md` with private vulnerability reporting channel and
  threat model.
- `CHANGELOG.md` (this file).
- `.nvmrc` pinned to Node 22 LTS.
- Dependabot config — grouped minor/patch on `npm` and
  `github-actions`, with security updates isolated.
- CI matrix on Node 22 + Node 24, with `permissions: contents: read`
  and a `concurrency` group.
- Privacy disclosure: addresses are sent to OpenStreetMap servers.

### Changed
- npm package name changed from the occupied `cairn-mcp` name to
  `@cairn/mcp`; the published binaries stay `cairn` and `cairn-mcp`.
- `engines.node` bumped to `>=22` (Node 20 reached EOL 2026-04-30).
- `vitest` bumped to `^4.1.0` — clears
  [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
  and
  [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9)
  in transitive `esbuild` / `vite`.
- `cli.ts` numeric flags (`--radius`, `--limit`, `--width`, `--height`)
  now reject `NaN` with a clear error instead of silently passing it
  down to the pipeline.
- Public numeric inputs are now bounded at the trust boundary:
  `radiusMeters <= 5000` and SVG `width` / `height <= 4000`, with the
  renderer also clamping direct internal calls defensively.
- Landmark and road radius expansion heuristics are now named constants
  with regression coverage, so the station-search and road-skeleton
  multipliers stay intentional.
- SVG rendering now favors a more print-like 약도 style: dense Overpass road
  sets are reduced to a small road skeleton, road strokes use a cased
  diagram line style, landmark labels are shortened, and the destination
  callout chooses a less-colliding side when possible.
- `find_landmarks` MCP wire format wraps results as `{landmarks: [...]}`
  rather than a bare array. Pre-refactor consumers parsing
  `JSON.parse(content[0].text)[0]` must read
  `JSON.parse(content[0].text).landmarks[0]`. Documented here because
  no public consumers exist yet (pre-npm-release).

### Fixed
- `fetchWithTimeout` now honors an already-aborted external signal at
  call entry — `addEventListener("abort", ...)` only fires on
  transition, so a pre-aborted `signal:` was silently ignored and the
  fetch ran to completion.
- `geocode` MCP tool passes through Nominatim's `raw` payload
  (city / country_code / road / suburb breakdown) that `geocode.ts`
  was already requesting via `addressdetails=1`. The earlier handler
  dropped it, depriving host LLMs of useful follow-up reasoning data.
- `geocode.ts` now validates Nominatim response shape and rejects
  non-finite or out-of-range coordinates instead of returning `NaN`
  as a successful coordinate.
- `generate_map` MCP tool no longer advertises a `language` parameter:
  `render.ts` does not localize labels and the flag was silently
  discarded. Re-introduced once render-side localization exists.
- `cli.ts` argv parser refuses flags that swallow another flag as
  their value (`cairn x -o --label y` previously wrote a file literally
  named `--label`) and refuses missing-value cases instead of producing
  `undefined`.
- `cli.ts` `parseFlag` uses `Number()` + `Number.isInteger()` instead
  of `parseInt()` — `parseInt("400px", 10) === 400` silently truncated
  malformed input like `1k` to `1`.
- `server.ts` shutdown awaits `transport.close()` (with a 2s hard-stop)
  and guards against re-entrant triggers, so in-flight JSON-RPC
  responses finish writing before the process exits.
- `landmarks.ts` Overpass parser is per-element tolerant: one
  malformed element is skipped, not allowed to fail the whole batch.
- `landmarks.ts` calls now go through a new `overpassGate` (1s minimum
  spacing) so bursty `find_landmarks` curation loops from a single
  host LLM cannot 429 the public Overpass instance.
- MCP tool input schemas declare `minimum: 1` on positive integer
  flags and `minimum: 100` on `width` / `height` — earlier the
  inputSchema drifted from zod-side `.positive()` enforcement, letting
  a non-zod host pass zero or negative values.
- `render.ts` clamps width/height to ≥ 100 and the projection span to
  ≥ 1 px so direct pipeline callers cannot produce `Infinity`
  coordinates with degenerate canvas sizes.
- `idempotentHint` removed from MCP tool annotations: Nominatim and
  Overpass return time-varying POI data, so the flag could let hosts
  cache stale results across the OSM edit lifecycle.
- `http.test.ts` restores spies in an `afterEach` so a failing
  `rejects.toThrow(...)` no longer leaks the fetch stub into the next
  test and produces cascading misleading failures.

### Known limitations
- Rate-limit gates (`nominatimGate`, `overpassGate`) are per-Node-
  process. Parallel CLI invocations (`cairn addr1 & cairn addr2`)
  bypass them. Acceptable for single-process CLI/MCP use; a future
  shared-host deployment would need a filesystem lock or out-of-
  process semaphore.

## [0.1.0] — unreleased

Initial public version prepared for npm under `@cairn/mcp`.

### Added
- MCP server (`cairn-mcp` binary) over stdio with three tools:
  `generate_map`, `geocode`, `find_landmarks`.
- CLI (`cairn`) with file output and label override.
- Deterministic landmark curation (importance × distance × category
  diversity).
- Pictogram SVG renderer (Korean-defaulted labels; per-language
  localization planned).
- 136 unit tests covering curation, rendering, geocoding, and the Nominatim
  rate-limit gate.
