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

- **5 MCP tools** over stdio: `generate_map` (address → SVG + editable document), `render_document` (patch + re-render without network access), `geocode` (address → coords via Nominatim), `find_landmarks` (coords → POI list via Overpass), and `find_roads` (coords → simplified road polylines via Overpass).
- **Chat-first wayfinding skill** in [`skills/create-wayfinding-map`](skills/create-wayfinding-map/SKILL.md) — teaches compatible AI hosts to generate, visually inspect, patch, and re-render a map instead of accepting the first SVG draft.
- **Zero-API-key path.** OSM Nominatim + Overpass only. No Mapbox / Google keys, no account, no quota signup.
- **Road skeleton** in [src/roads.ts](src/roads.ts) — fetches nearby roads, classifies them by importance tier (primary / secondary / tertiary / residential), and simplifies each polyline with Douglas-Peucker ([src/geometry.ts](src/geometry.ts)). This is what turns the output from a scatter of points into an actual 약도: a few roads you navigate along, with the major ones labeled.
- **Deterministic curation heuristic** in [src/curate.ts](src/curate.ts) — weights importance (transit > civic > shop), targets a ~150 m sweet-spot distance, enforces category diversity, caps at the requested `limit` (default 5).
- **Pictogram SVG renderer** — curated road bands, category-specific SVG pictograms, station-exit labels, final-approach arrows, deduped road-name labels, destination callouts, and visible OSM attribution tuned for print-style 약도 output.
- **CLI** with file output, label override, independent template/theme selection, and a `--no-roads` toggle:
  ```bash
  node dist/cli.js "서울 강남구 테헤란로 152" -o office.svg --label "스튜디오"
  node dist/cli.js "서울 강남구 테헤란로 152" -o office-compact.svg --template compact --theme civic
  node dist/cli.js "서울 강남구 테헤란로 152" -o office-badge.svg --template badge --theme invitation
  node dist/cli.js "서울 강남구 테헤란로 152" -o office-focus.svg --focus
  node dist/cli.js "Shibuya Crossing, Tokyo" -o shibuya.svg --layout geographic
  node dist/cli.js "서울 강남구 테헤란로 152" -o office.svg --save-document office.json
  node dist/cli.js render office.json -o office-revised.svg
  ```
- **Layout modes** — `diagram` is the default 약도 layout, keeping only the navigational structure; `geographic` preserves raw road geometry more closely for inspection/debugging.
- **Composition templates** — `standard` (default) keeps the full curated 약도, `compact` becomes an approach-focused mini-map, `minimal` uses a route strip, `schematic` turns roads into right-angle axes, and `badge` renders a destination-first inset.
- **Visual themes** — `paper` (default), `mono`, `civic`, and `invitation` independently change color, typography, roads, markers, and callouts without changing the chosen composition.
- **Editable document model** — `DiagramDocument v1` stores the source map, canvas, template, theme, explicit approach landmark, hidden/relabelled elements, and normalized manual landmark positions. The same JSON survives multiple chat revisions and can also back optional visual editors without changing the rendering core.
- **Destination focus** (opt-in `--focus` / `focus: true`) — a radial fisheye that magnifies the area around the destination and compresses the periphery, so the crucial last block reads larger. It applies to the map-skeleton diagram presets (`standard`, `compact`, `schematic`); route-strip and badge templates keep their fixed composition.
- **Bounded inputs** on public tool/CLI parameters — search radii max out at 5 km, internal radius expansion is clamped back to that same ceiling, and SVG canvas dimensions at 4000 px keep public OSM services and the single-process renderer healthy.
- **HTTP rate-limiting and timeouts** on outbound calls — 1.1s minimum spacing to Nominatim, 1 req/s to Overpass, per their usage policies.
- **Tests**: vitest coverage runs on every push.
- **Visual audit harness**: `npm run visual:audit` rebuilds the package, renders all 20 template/theme combinations, and fails on marker-road overlap, UI-like label chrome, color drift, or excessive road density.

## Planned

- More chat-driven document patches and export formats. A visual editor remains optional rather than the primary product surface.
- Stronger automatic composition and label layout, using the editor document as an escape hatch when heuristics are not enough.
- npm publish automation for future releases.
- More domain templates for campuses, events, invitations, and indoor/game wayfinding.
- Optional Mapbox / Google geocoder adapters (opt-in only; the default stays zero-key).
- Figma plugin import/export for `DiagramDocument`.

## Design intent

- **Fewer landmarks by design.** A good cairn is one stone stacked carefully, not a quarry. Every extra element costs cognitive load, so the default heuristic picks fewer landmarks than you'd expect — and that's the point.
- **Granular and high-level tools, side by side.** `generate_map` is convenient; `geocode` + `find_landmarks` + `find_roads` exist so a host LLM can compose smarter pipelines than any single one-shot ever could.
- **No server-side LLM calls.** The MCP server is a tool, not an agent: curation is deterministic, so it's debuggable, testable, and doesn't push token costs onto the user. Any LLM-powered refinement happens in the host process.
- **Domain-neutral by design.** Business cards are the primary use case, but the render pipeline doesn't lock to that domain — wedding invitations, real estate listings, and event flyers all reuse the same primitives.
- **Map-source-neutral renderer.** Address lookup currently uses OSM, but the renderer consumes `MapLayout`. Campus plans, indoor graphs, or game-world topology can use the same engine once adapted into that structure.
- **Single-file MCP server style** (anvil / AirMCP pattern): minimal dependencies, single-responsibility modules, easy to audit end-to-end.

## Privacy

cairn sends the address you type to two OpenStreetMap services in order to
do its job: [Nominatim](https://nominatim.openstreetmap.org/) for geocoding
and [Overpass](https://overpass-api.de/) for landmark and road lookup. Both run on
the OSM Foundation's public infrastructure and follow the OSMF [privacy
policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy). cairn itself
stores nothing, has no telemetry, and reads no environment variables for
credentials. If your address is sensitive, run a self-hosted Nominatim /
Overpass instance and point cairn at it (custom-endpoint support is on the
roadmap).

## Non-goals

- **A hosted frontend coupled to the engine.** A visual editor is useful, but the renderer and document format stay headless and local-first. Web, desktop, and plugin shells are interchangeable clients rather than a required account-backed service.
- **Paid geocoders as the default.** Mapbox / Google may ship as opt-in adapters; the zero-config `npx` path will always work without a key.
- **Server-side LLM calls.** No model invocation happens inside cairn — not for curation, not for label translation, not anywhere. LLM use is the host's responsibility.
- **A custom domain language.** Wedding-invitation, real-estate, etc. variants will share the same render primitives, not fork into bespoke pipelines.

## Quick start

> **Status:** cairn is published as `@yakdo/cairn`. Install from npm with the snippets below, or install from source with `npm install && npm run build` and run `node dist/cli.js`.

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

> Make a pictogram map for 서울 강남구 테헤란로 152, label it "스튜디오". Inspect the result, remove low-value landmarks that hurt readability, and return the final SVG and editable document.

### As an agent skill

The npm package ships the canonical `create-wayfinding-map` skill. Install it
into the local skills directory used by your compatible AI host:

```bash
npx -p @yakdo/cairn cairn install-skill <skills-directory>
```

The installer refuses to overwrite an existing copy. Remove or rename the old
folder explicitly before upgrading it.

### As a CLI

```bash
npx -p @yakdo/cairn cairn "서울 강남구 테헤란로 152" -o office.svg
npx -p @yakdo/cairn cairn "1600 Amphitheatre Pkwy, Mountain View" --label "Office" --template compact --theme mono
npx -p @yakdo/cairn cairn "서울 강남구 테헤란로 152" -o office.svg --save-document office.json
npx -p @yakdo/cairn cairn render office.json -o office-revised.svg
```

### As an editable document

```js
import {
  createDiagramDocument,
  renderDiagramDocument,
} from "@yakdo/cairn/document";

const document = createDiagramDocument(mapLayout, {
  template: "schematic",
  theme: "civic",
  overrides: {
    landmarks: {
      "main-gate": { position: { x: 0.22, y: 0.36 }, locked: true },
    },
  },
});

const savedJson = JSON.stringify(document);
const svg = renderDiagramDocument(JSON.parse(savedJson));
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
| `generate_map` | Address → SVG + editable document (set `roads: false` to skip the skeleton) |
| `render_document` | Apply a minimal patch to an editable document and return revised SVG + document |
| `geocode` | Address → coordinates |
| `find_landmarks` | Coordinates → nearby points of interest |
| `find_roads` | Coordinates → simplified road polylines, classified by tier |

Granular tools let an LLM compose smarter pipelines — for example, "find landmarks and roads, keep the two biggest roads and the three most recognizable landmarks, render with those."

`generate_map` accepts `layout: "diagram" | "geographic"`,
`template: "standard" | "compact" | "minimal" | "schematic" | "badge"`, and
`theme: "paper" | "mono" | "civic" | "invitation"`. The old `preset` field
remains an alias for `template`; `template` wins when both are supplied.

## Why "cairn"?

A cairn is a stack of stones hikers use to mark trails through complex terrain — just enough to say "you're on the path." Cousins exist across cultures: Korean 돌탑, Mongolian ovoo, Scottish cairns. All of them solve the same problem: simplify wayfinding by leaving only what matters.

## License

MIT © heznpc

## Author

Built by [@heznpc](https://github.com/heznpc), author of [AirMCP](https://github.com/heznpc/AirMCP) and [anvil](https://github.com/heznpc/anvil).
