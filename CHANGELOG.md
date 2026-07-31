# Changelog

All notable changes to **cairn** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Generated labels follow the destination's country. Unnamed transit exits and
  the fallback destination label are localized (15 languages with verified
  strings), so Seoul still reads `여기` / `3번 출구` while Berlin reads `Hier` /
  `Ausgang 3` and Stockholm `Här`. OpenStreetMap POI and road names are never
  translated — a 약도 should read like the signs around it. `--language` and the
  `generate_map` `language` argument override the country default; unsupported
  values fail loudly rather than silently falling back.
- On-disk response cache, so iterating on one address costs one set of network
  calls instead of one per attempt. Entries are content-addressed and keyed on
  endpoint plus `Accept-Language`, written atomically, and best-effort — an
  unwritable cache degrades to no caching, never to a failed map. `--offline`
  renders from cache only, `--refresh` re-fetches, `--no-cache` disables both. A
  cold London render takes 5.2s and a warm one 0.27s, byte-identical.
- Transient upstream failures (429, 408, 425, 5xx) now retry with exponential
  backoff, honoring `Retry-After`. The public Overpass instance returns 429 and
  504 routinely on dense queries, which previously failed the whole render.
- Configurable endpoints and rate-limit spacing for self-hosted or mirrored
  deployments, via `--nominatim-url` / `--overpass-url` and the `CAIRN_*`
  environment variables. Endpoints are deliberately not MCP tool arguments:
  letting a host LLM choose a URL would be an SSRF path, and the endpoint is the
  operator's decision. Non-http(s) schemes are rejected.
- POI coverage beyond Korea and Japan: `tram_stop`, `ferry`, `supermarket`, and
  `pharmacy` categories with pictograms in the existing stroked grammar. Tags
  that need no icon of their own fold into the closest existing category, so a
  bank reads as a building and a place of worship as a monument-class landmark.
- Diagram-mode standard, compact, and schematic maps now infer the final
  approach over connected visible road axes, with a direct fallback when the
  displayed graph is disconnected or implausible. SVG output identifies the
  result as `data-route-mode="inferred-road"` or `"direct"`; inferred output is
  explicitly documented as a diagram heuristic rather than certified routing.
- Chat-first iterative editing: `generate_map` now returns its
  `DiagramDocument`, and the new stateless `render_document` MCP tool applies
  validated patches, including explicit start-landmark selection, and returns
  both revised SVG and updated document.
- CLI document round-tripping with `--save-document` and
  `cairn render <document.json>`, with SVG, PNG, and PDF output selected by
  file extension. SVG remains vector; PDF uses a 4× locally rendered image.
- A packaged `create-wayfinding-map` skill with quality and patch references
  plus campus, invitation, monochrome, and custom-topology golden workflows
  for compatible AI hosts. Release preflight validates and package smoke-tests
  the shipped skill; `cairn install-skill <skills-directory>` installs it
  without overwriting an existing copy.
- Independent composition templates (`standard`, `compact`, `minimal`,
  `schematic`, `badge`) and visual themes (`paper`, `mono`, `civic`,
  `invitation`). CLI and MCP callers can combine them with `template` and
  `theme`; the existing `preset` option remains a compatibility alias.
- Versioned `DiagramDocument` JSON for editor workflows. It preserves the
  source `MapLayout`, canvas, template, theme, destination/landmark/road label
  overrides, visibility, and normalized manual landmark positions.
- Public package subpaths for headless integrations: `cairn-sketch/render`,
  `cairn-sketch/document`, `cairn-sketch/options`, `cairn-sketch/pipeline`, and
  `cairn-sketch/types`.

### Changed
- npm package name is now `cairn-sketch` (the bare `cairn` name is taken by an
  unrelated, long-dormant package). The published binaries stay `cairn` and
  `cairn-mcp`, the MCP server name stays `cairn`, and the headless subpaths move
  to `cairn-sketch/*`.
- The visual audit now checks city and campus fixtures across all 40
  template/theme combinations and rejects marker/road overlap, duplicate
  transit clusters, decorative-length approach cues, and style regressions.
- `generateMap()` now returns the exact editable `document` used to render its
  SVG alongside the existing `svg` and `layout` fields.
- Standard map layout now produces a testable `StandardMapScene` before SVG
  serialization. Standard, minimal, and badge renderers share document-frame,
  route, marker, destination, attribution, and approach-selection primitives.
- Nearby station and station-exit landmarks collapse into one actionable
  transit marker in diagram mode. Korean labels prefer word boundaries, and
  approach paths participate in label/callout collision avoidance.

### Fixed
- Projection now applies a cos(latitude) correction and a single uniform scale
  for both axes. It previously stretched the lon/lat bbox independently to fill
  the canvas, replacing real shape with the canvas aspect ratio; because a
  degree of longitude shrinks with latitude, Stockholm and Oslo rendered
  stretched about 2× horizontally and right-angle junctions came out skewed.
  Areas now keep their true proportions worldwide, at the cost of letterboxing —
  roads clip to the viewport rather than the bbox, so the margins fill with
  surrounding context.
- Landmark labels are placed by a global search over all candidate positions
  instead of one label at a time. Sequential placement let an early label take
  the slot a later, more important one needed, and the result depended on
  curation order. On a seeded crowding fixture this cuts total overlap cost by
  47.8%, deterministically.
- Label widths are measured by East-Asian-Width class rather than "ASCII or
  not". Cyrillic `Выход` previously reserved 5 em instead of 2.8, so Russian and
  Greek labels claimed ~70% more space than they draw and were pushed or hidden
  for no reason. Nonspacing and enclosing marks now carry zero advance, which
  fixes Devanagari, Thai, and Arabic label sizing.
- Overpass POI lookups query `nwr` with `out center` instead of nodes only.
  Outside dense Asian city centers, parks, hospitals, schools, and malls are
  mapped as ways or relations, so they were invisible across most of Europe and
  North America. Element IDs are namespaced by type, since a way and a relation
  can share a number and `DiagramDocument` overrides key on the ID.
- `minimal` and `badge` templates no longer print `출발` when no start landmark
  is selected. The renderer has no language by design, so the marker draws
  without a label instead of inventing a Korean word on a Lisbon map.
- Unit tests no longer read or write the real user cache. A stored response
  could satisfy a later test's mocked fetch, which made three geocode
  assertions pass against stale data.
- MCP JSON Schema and runtime Zod validation now share domain values and
  numeric bounds, with acceptance-parity tests. Public document schemas no
  longer accept empty landmark, road, or explicit approach IDs that runtime
  validation rejects.
- Landmark markers now preserve navigational road corridors: glyphs move away
  from rendered road casing, keep their geographic anchor via an under-road
  leader, and are omitted when no collision-free placement exists instead of
  erasing the route.

## [0.2.0] — 2026-07-07

### Added
- Renderer output presets: `standard` (default, full curated 약도), `compact`
  (reduced low-priority labels/icons), and `minimal` (transit-like approach
  landmarks plus destination only).
  The CLI now accepts `--preset`, and the `generate_map` MCP tool accepts
  `preset`.
- `npm run visual:audit` renders a deterministic yakdo fixture, optionally
  writes a PNG preview via `rsvg-convert`, and fails on UI-like visual
  regressions such as dashed connector lines, rounded label pills, color
  sprawl, or too many road spines.
- Subway entrances from OSM (`railway=subway_entrance`) are now captured as
  `station_exit` landmarks; `ref=3` becomes a printable `3번 출구` label even
  when the node has no `name`.
- Renderer now uses category-specific SVG pictograms instead of letter badges,
  draws a final-approach arrow in `diagram` mode, and includes visible
  OpenStreetMap attribution inside the SVG.
- `generate_map` and the CLI now accept `layout: "diagram" | "geographic"`.
  `diagram` remains the default 약도 layout; `geographic` preserves raw road
  geometry more closely for inspection/debugging.
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
- Release preflight now runs typecheck, repo-scoped tests, visual audit, npm
  pack dry-run, and an installed tarball smoke test covering both the CLI and
  MCP tool registry.

### Changed
- Renderer variants now adjust structure rather than palette. `standard`
  keeps the stronger destination callout, `compact` lowers road/label/icon
  density, and `minimal` removes road-name labels plus secondary landmark
  icons and uses an outlined destination callout for embedding inside a larger
  design.
- SVG output now uses a quieter print-style treatment: muted landmark ink,
  no dashed landmark-to-destination connector lines, haloed text instead of
  rounded label pills, and a square destination callout.
- `diagram` mode now clips roads to the canvas, straightens each selected OSM
  way into a clean schematic spine, drops short visual stubs, dedupes nearby
  parallel roads, and excludes residential/path roads from dense road sets.
- npm package name changed from the occupied `cairn-mcp` name to
  `cairn-map`; the published binaries stay `cairn` and `cairn-mcp`.
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
- Landmark and road radius expansion is clamped after applying those
  heuristics, so public `radiusMeters <= 5000` means the actual Overpass query
  radius also stays within 5 km.
- Vitest discovery now excludes local worktrees and generated output
  (`.claude`, `tmp`, `dist`) so the public test count is deterministic.
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
- MCP tool input schemas and zod parsers now reject unknown properties instead
  of silently dropping them.
- Landmark output schemas now require the `tags` field that runtime has always
  emitted.
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

## [0.1.0] — 2026-06-30

Initial public version published to npm under `cairn-map`.

### Added
- MCP server (`cairn-mcp` binary) over stdio with three tools:
  `generate_map`, `geocode`, `find_landmarks`.
- CLI (`cairn`) with file output and label override.
- Deterministic landmark curation (importance × distance × category
  diversity).
- Pictogram SVG renderer (Korean-defaulted labels; per-language
  localization planned).
- 142 unit tests covering curation, rendering, geocoding, and the Nominatim
  rate-limit gate.
