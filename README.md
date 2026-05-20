# cairn

> Type an address, get a pictogram map.
> Korean-style 약도, auto-generated, anywhere in the world.

[![npm](https://img.shields.io/npm/v/cairn-mcp.svg)](https://www.npmjs.com/package/cairn-mcp) *(coming soon)*
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Part of: **Human-Controlled AI Systems** — the MCP server stays a tool, never an agent. Curation is a deterministic heuristic; an LLM only enters the loop when the *host* (Claude Code, Cursor, Codex CLI, …) chooses to compose it.

---

## Why

Most maps are too accurate to be useful. Korean 약도 (yakdo) and Japanese 略地図 are wayfinding **diagrams**: a handful of landmarks, simple arrows, a station exit number. They're easier to read at a glance than any GPS screenshot — exactly what a business card, wedding invitation, or shop flyer needs.

`cairn` brings that pictogram-first approach to anywhere with OpenStreetMap coverage.

---

## Currently implemented

- **3 MCP tools** over stdio: `generate_map` (one-shot address → SVG), `geocode` (address → coords via Nominatim), `find_landmarks` (coords → POI list via Overpass).
- **Zero-API-key path.** OSM Nominatim + Overpass only. No Mapbox / Google keys, no account, no quota signup.
- **Deterministic curation heuristic** in [src/curate.ts](src/curate.ts) — weights importance (transit > civic > shop), targets a ~150 m sweet-spot distance, enforces category diversity, caps at the requested `limit` (default 5).
- **Pictogram SVG renderer** with per-category icons and Korean/English/Japanese labels.
- **CLI** with file output and label override:
  ```bash
  node dist/cli.js "서울 강남구 테헤란로 152" -o office.svg --label "스튜디오"
  ```
- **HTTP rate-limiting and timeouts** on outbound calls — 1 req/s to Nominatim per its usage policy.
- **Tests**: 18 passing (vitest, run on every push).

## Planned

- Publish v0.1.0 to npm so the `npx cairn-mcp` invocations below work.
- Pictogram component library + force-directed layout + road simplification (Track A — the real visual differentiator).
- Wedding invitation template variant (Track C — addressable-market expansion).
- Optional Mapbox / Google geocoder adapters (opt-in only; the default stays zero-key).
- Figma plugin export.

## Design intent

- **Fewer landmarks by design.** A good cairn is one stone stacked carefully, not a quarry. Every extra element costs cognitive load, so the default heuristic picks fewer landmarks than you'd expect — and that's the point.
- **Granular and high-level tools, side by side.** `generate_map` is convenient; `geocode` + `find_landmarks` exist so a host LLM can compose smarter pipelines than any single one-shot ever could.
- **No server-side LLM calls.** The MCP server is a tool, not an agent: curation is deterministic, so it's debuggable, testable, and doesn't push token costs onto the user. Any LLM-powered refinement happens in the host process.
- **Domain-neutral by design.** Business cards are the primary use case, but the render pipeline doesn't lock to that domain — wedding invitations, real estate listings, and event flyers all reuse the same primitives.
- **Single-file MCP server style** (anvil / AirMCP pattern): minimal dependencies, single-responsibility modules, easy to audit end-to-end.

## Non-goals

- **A web frontend.** MCP server + CLI only. A hosted UI is scope-creep that the project consciously rejects.
- **Paid geocoders as the default.** Mapbox / Google may ship as opt-in adapters; the zero-config `npx` path will always work without a key.
- **Server-side LLM calls.** No model invocation happens inside cairn — not for curation, not for label translation, not anywhere. LLM use is the host's responsibility.
- **A custom domain language.** Wedding-invitation, real-estate, etc. variants will share the same render primitives, not fork into bespoke pipelines.

## Quick start

> **Status:** v0.1 pre-release. Not yet on npm. Install from source: clone → `npm install && npm run build`, then use `node dist/cli.js` for CLI or wire `node /absolute/path/to/dist/server.js` into your MCP config. The `npx cairn-mcp` snippets below will work once v0.1.0 is published.

### As an MCP server

```json
{
  "mcpServers": {
    "cairn": {
      "command": "npx",
      "args": ["-y", "cairn-mcp"]
    }
  }
}
```

Then ask the assistant:

> Make a pictogram map for 서울 강남구 테헤란로 152, label it "스튜디오".

### As a CLI

```bash
npx cairn-mcp "서울 강남구 테헤란로 152" -o office.svg
npx cairn-mcp "1600 Amphitheatre Pkwy, Mountain View" --label "Office"
```

## How it works

1. **Geocode** the address (Nominatim — no API key).
2. **Find landmarks** within a configurable radius (Overpass): transit stations, schools, parks, recognizable shops, distinctive buildings.
3. **Curate** the most useful 4–6 with the heuristic above.
4. **Render** a pictogram SVG with simplified positions, icons, and labels.
5. **Output** vector SVG, ready for print or digital embed.

## MCP tools

| Tool | What it does |
|---|---|
| `generate_map` | One-shot: address → SVG |
| `geocode` | Address → coordinates |
| `find_landmarks` | Coordinates → nearby points of interest |

Granular tools let an LLM compose smarter pipelines — for example, "find landmarks, pick the three most recognizable for a Korean reader, render with those as icons."

## Why "cairn"?

A cairn is a stack of stones hikers use to mark trails through complex terrain — just enough to say "you're on the path." Cousins exist across cultures: Korean 돌탑, Mongolian ovoo, Scottish cairns. All of them solve the same problem: simplify wayfinding by leaving only what matters.

## License

MIT © heznpc

## Author

Built by [@heznpc](https://github.com/heznpc), author of [AirMCP](https://github.com/heznpc/AirMCP) and [anvil](https://github.com/heznpc/anvil).
