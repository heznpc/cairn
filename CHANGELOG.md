# Changelog

All notable changes to **cairn** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `outputSchema` + `structuredContent` on the `generate_map` MCP tool —
  host LLMs can now read `layout` (center, bbox, landmarks) as
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
- `engines.node` bumped to `>=22` (Node 20 reached EOL 2026-04-30).
- `vitest` bumped to `^4.1.0` — clears
  [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
  and
  [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9)
  in transitive `esbuild` / `vite`.
- `cli.ts` numeric flags (`--radius`, `--limit`, `--width`, `--height`)
  now reject `NaN` with a clear error instead of silently passing it
  down to the pipeline.

## [0.1.0] — unreleased

Initial public version. Not yet on npm.

### Added
- MCP server (`cairn-mcp`) over stdio with three tools:
  `generate_map`, `geocode`, `find_landmarks`.
- CLI (`cairn`) with file output and label override.
- Deterministic landmark curation (importance × distance × category
  diversity).
- Pictogram SVG renderer with Korean / English / Japanese label
  support.
- 18 unit tests covering curation, rendering, and the Nominatim
  rate-limit gate.
