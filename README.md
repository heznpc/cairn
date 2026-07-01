# cairn

> Type an address, get a pictogram map.
> Korean-style 약도, auto-generated, anywhere in the world.

[![ci](https://github.com/heznpc/cairn/actions/workflows/ci.yml/badge.svg)](https://github.com/heznpc/cairn/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@yakdo/cairn.svg)](https://www.npmjs.com/package/@yakdo/cairn)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Part of: **Human-Controlled AI Systems** — the MCP server stays a tool, never an agent. Curation is a deterministic heuristic; an LLM only enters the loop when the *host* (Claude Code, Cursor, Codex CLI, …) chooses to compose it.

---

## Why

Most maps are too accurate to be useful. Korean 약도 (yakdo) and Japanese 略地図 are wayfinding **diagrams**: a handful of landmarks, simple arrows, a station exit number. They're easier to read at a glance than any GPS screenshot — exactly what a business card, wedding invitation, or shop flyer needs.

`cairn` brings that pictogram-first approach to anywhere with OpenStreetMap coverage.

---

## Currently implemented

- **4 MCP tools** over stdio: `generate_map` (one-shot address → SVG), `geocode` (address → coords via Nominatim), `find_landmarks` (coords → POI list via Overpass), `find_roads` (coords → simplified road polylines via Overpass).
- **Zero-API-key path.** OSM Nominatim + Overpass only. No Mapbox / Google keys, no account, no quota signup.
- **Road skeleton** in [src/roads.ts](src/roads.ts) — fetches nearby roads, classifies them by importance tier (primary / secondary / tertiary / residential), and simplifies each polyline with Douglas-Peucker ([src/geometry.ts](src/geometry.ts)). This is what turns the output from a scatter of points into an actual 약도: a few roads you navigate along, with the major ones labeled.
- **Deterministic curation heuristic** in [src/curate.ts](src/curate.ts) — weights importance (transit > civic > shop), targets a ~150 m sweet-spot distance, enforces category diversity, caps at the requested `limit` (default 5).
- **Pictogram SVG renderer** — curated road bands, category-specific SVG pictograms, station-exit labels, final-approach arrows, deduped road-name labels, destination callouts, and visible OSM attribution tuned for print-style 약도 output.
- **CLI** with file output, label override, layout/preset selection, and a `--no-roads` toggle:
  ```bash
  node dist/cli.js "서울 강남구 테헤란로 152" -o office.svg --label "스튜디오"
  node dist/cli.js "서울 강남구 테헤란로 152" -o office-compact.svg --preset compact
  node dist/cli.js "서울 강남구 테헤란로 152" -o office-badge.svg --preset badge
  node dist/cli.js "Shibuya Crossing, Tokyo" -o shibuya.svg --layout geographic
  ```
- **Layout modes** — `diagram` is the default 약도 layout, keeping only the navigational structure; `geographic` preserves raw road geometry more closely for inspection/debugging.
- **Output presets** — `standard` (default) keeps the full curated 약도, `compact` becomes an approach-focused mini-map, `minimal` uses a route-strip template, `schematic` turns roads into right-angle diagram axes, and `badge` renders a destination-first inset map for small placements.
- **Bounded inputs** on public tool/CLI parameters — search radii max out at 5 km and SVG canvas dimensions at 4000 px to keep public OSM services and the single-process renderer healthy.
- **HTTP rate-limiting and timeouts** on outbound calls — 1.1s minimum spacing to Nominatim, 1 req/s to Overpass, per their usage policies.
- **Tests**: 159 passing (vitest, run on every push).
- **Visual audit harness**: `npm run visual:audit` renders a deterministic yakdo fixture and fails on UI-like regressions such as dashed connector lines, rounded label pills, color sprawl, or too many road spines.

## Planned

- Force-directed label layout (Track A — building on the road skeleton and pictogram renderer just landed).
- npm publish automation for future releases.
- Wedding invitation template variant (Track C — addressable-market expansion).
- Optional Mapbox / Google geocoder adapters (opt-in only; the default stays zero-key).
- Figma plugin export.

## Design intent

- **Fewer landmarks by design.** A good cairn is one stone stacked carefully, not a quarry. Every extra element costs cognitive load, so the default heuristic picks fewer landmarks than you'd expect — and that's the point.
- **Granular and high-level tools, side by side.** `generate_map` is convenient; `geocode` + `find_landmarks` + `find_roads` exist so a host LLM can compose smarter pipelines than any single one-shot ever could.
- **No server-side LLM calls.** The MCP server is a tool, not an agent: curation is deterministic, so it's debuggable, testable, and doesn't push token costs onto the user. Any LLM-powered refinement happens in the host process.
- **Domain-neutral by design.** Business cards are the primary use case, but the render pipeline doesn't lock to that domain — wedding invitations, real estate listings, and event flyers all reuse the same primitives.
- **Single-file MCP server style** (anvil / AirMCP pattern): minimal dependencies, single-responsibility modules, easy to audit end-to-end.

## Privacy

cairn sends the address you type to two OpenStreetMap services in order to
do its job: [Nominatim](https://nominatim.openstreetmap.org/) for geocoding
and [Overpass](https://overpass-api.de/) for landmark lookup. Both run on
the OSM Foundation's public infrastructure and follow the OSMF [privacy
policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy). cairn itself
stores nothing, has no telemetry, and reads no environment variables for
credentials. If your address is sensitive, run a self-hosted Nominatim /
Overpass instance and point cairn at it (custom-endpoint support is on the
roadmap).

## Non-goals

- **A web frontend.** MCP server + CLI only. A hosted UI is scope-creep that the project consciously rejects.
- **Paid geocoders as the default.** Mapbox / Google may ship as opt-in adapters; the zero-config `npx` path will always work without a key.
- **Server-side LLM calls.** No model invocation happens inside cairn — not for curation, not for label translation, not anywhere. LLM use is the host's responsibility.
- **A custom domain language.** Wedding-invitation, real-estate, etc. variants will share the same render primitives, not fork into bespoke pipelines.

## Quick start

> **Status:** v0.1 is published as `@yakdo/cairn`. Install from npm with the snippets below, or install from source with `npm install && npm run build` and run `node dist/cli.js`.

### As an MCP server

```json
{
  "mcpServers": {
    "cairn": {
      "command": "npx",
      "args": ["-y", "-p", "@yakdo/cairn", "cairn-mcp"]
    }
  }
}
```

Then ask the assistant:

> Make a pictogram map for 서울 강남구 테헤란로 152, label it "스튜디오".

### As a CLI

```bash
npx -p @yakdo/cairn cairn "서울 강남구 테헤란로 152" -o office.svg
npx -p @yakdo/cairn cairn "1600 Amphitheatre Pkwy, Mountain View" --label "Office"
```

## How it works

1. **Geocode** the address (Nominatim — no API key).
2. **Find landmarks** within a configurable radius (Overpass): transit stations, subway exits, schools, parks, recognizable shops, distinctive buildings.
3. **Find roads** in the same area (Overpass), classify them by importance tier, and simplify each polyline (Douglas-Peucker).
4. **Curate** the most useful 4–6 landmarks with the heuristic above.
5. **Render** a pictogram SVG: road skeleton underneath, landmark icons and labels on top, approach arrow and destination callout marked.
6. **Output** vector SVG, ready for print or digital embed.

## MCP tools

| Tool | What it does |
|---|---|
| `generate_map` | One-shot: address → SVG (set `roads: false` to skip the skeleton) |
| `geocode` | Address → coordinates |
| `find_landmarks` | Coordinates → nearby points of interest |
| `find_roads` | Coordinates → simplified road polylines, classified by tier |

Granular tools let an LLM compose smarter pipelines — for example, "find landmarks and roads, keep the two biggest roads and the three most recognizable landmarks, render with those."

`generate_map` accepts `layout: "diagram" | "geographic"` and
`preset: "standard" | "compact" | "minimal" | "schematic" | "badge"`. Use `diagram` for the default
약도 output; use `geographic` when you want the raw road geometry preserved
more closely.

## Why "cairn"?

A cairn is a stack of stones hikers use to mark trails through complex terrain — just enough to say "you're on the path." Cousins exist across cultures: Korean 돌탑, Mongolian ovoo, Scottish cairns. All of them solve the same problem: simplify wayfinding by leaving only what matters.

## License

MIT © heznpc

## Author

Built by [@heznpc](https://github.com/heznpc), author of [AirMCP](https://github.com/heznpc/AirMCP) and [anvil](https://github.com/heznpc/anvil).
