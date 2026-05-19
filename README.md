# cairn

> Type an address, get a pictogram map.
> Korean-style 약도, auto-generated, anywhere in the world.

[![npm](https://img.shields.io/npm/v/cairn-mcp.svg)](https://www.npmjs.com/package/cairn-mcp) *(coming soon)*
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Why

Most maps are too accurate to be useful. Korean 약도 (yakdo) and Japanese 略地図 are wayfinding **diagrams**: a handful of landmarks, simple arrows, a station exit number. They're easier to read at a glance than any GPS screenshot — and that's exactly what a business card, wedding invitation, or shop flyer needs.

`cairn` brings that pictogram-first approach to anywhere with OpenStreetMap coverage.

Built for:

- Business cards
- Wedding invitations
- Store opening flyers
- Event invitations
- Any printed material that says "here's how to find me"

## Quick start

> **Status:** v0.1 pre-release. Not yet on npm. Install from source: clone → `npm install && npm run build` → use `node dist/cli.js` for CLI, or wire `node /absolute/path/to/dist/server.js` into your MCP config. The `npx cairn-mcp` invocations below will work once v0.1.0 is published.

### As an MCP server (Claude Code, Cursor, Codex CLI)

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

1. **Geocode** the address (OpenStreetMap Nominatim — no API key required)
2. **Find landmarks** within a configurable radius (Overpass API): transit stations, schools, parks, recognizable shops, distinctive buildings
3. **Curate** the most useful 4–6 with a heuristic that weights transit heavily, balances distance, and prefers diverse categories
4. **Render** a pictogram SVG with simplified positions, icons, and labels
5. **Output** vector SVG, ready for print or digital embed

## MCP tools

| Tool | What it does |
|---|---|
| `generate_map` | One-shot: address → SVG |
| `geocode` | Address → coordinates |
| `find_landmarks` | Coordinates → nearby points of interest |

Granular tools let an LLM compose smarter pipelines — for example, "find landmarks, pick the three most recognizable for a Korean reader, render with those as icons."

## Philosophy

A good cairn is one stone stacked carefully, not a quarry. The same goes for maps: every additional element costs cognitive load. The default heuristic picks fewer landmarks than you'd expect, and that's the point.

## Roadmap (v0.x)

- Multi-language address support (currently best with KR / JP / EN)
- Wedding invitation template variant
- Real estate listing variant
- Figma plugin export
- Pluggable geocoders (Mapbox, Google)
- Optional LLM-based curation refinement

## Why "cairn"?

A cairn is a stack of stones hikers use to mark trails through complex terrain — just enough to say "you're on the path." Cousins exist in many cultures: Korean 돌탑, Mongolian ovoo, Scottish cairns. All of them solve the same problem: simplify wayfinding by leaving only what matters.

## License

MIT © heznpc

## Author

Built by [@heznpc](https://github.com/heznpc), author of [AirMCP](https://github.com/heznpc/AirMCP) and [anvil](https://github.com/heznpc/anvil).
