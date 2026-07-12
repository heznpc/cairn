---
name: create-wayfinding-map
description: Create, inspect, and iteratively refine printable wayfinding diagrams with cairn. Use when a user asks for a Korean-style yakdo, invitation map, campus or venue directions, a simplified route diagram, an address-to-SVG map, or revisions such as hiding landmarks, changing labels, moving markers, switching template/theme, or resizing an existing DiagramDocument.
---

# Create Wayfinding Map

Use cairn as the deterministic renderer and use the host model for intent,
curation, and visual critique. Treat the returned `DiagramDocument` as the
source of truth across edit turns.

## Workflow

1. Resolve only information that changes the result.
   - Require a destination address or an existing `DiagramDocument`.
   - Infer a sensible destination label, canvas, template, and theme when the
     user does not care. Do not turn routine defaults into a questionnaire.
   - Read [references/examples.md](references/examples.md) when the requested
     domain is ambiguous or when selecting the first composition.
   - Ask for a start point only when the user explicitly needs a route from a
     particular gate, exit, or landmark.

2. Generate the first document.
   - Call `generate_map` for an address. Retain `document` from
     `structuredContent`; do not reconstruct it from SVG.
   - Start with `standard/paper` for general print use, then use the selection
     guidance in [references/quality.md](references/quality.md).
   - Use `geocode`, `find_landmarks`, and `find_roads` only when host-side
     curation is materially better than the one-shot path.

3. Inspect the rendered result.
   - Review the rendered image, not only the SVG source.
   - Apply every hard check in [references/quality.md](references/quality.md).
   - Treat a successful tool call as a draft, not proof of a usable map.

4. Revise through the document.
   - Read [references/patches.md](references/patches.md) before the first edit.
   - Call `render_document` with the latest complete `document` and the
     smallest possible `patch`.
   - Copy landmark and road IDs exactly from the document. Never invent an ID.
   - When the user names a start point, match it to an exact landmark ID and
     set `patch.render.approachLandmarkId`. Do not rely on automatic selection.
   - Preserve the returned updated document for the next turn.
   - Prefer hiding a low-value element over shrinking all labels or obscuring
     the route. Keep automatic marker placement unless manual movement solves
     a specific visible problem.

5. Reinspect after every structural edit.
   - Recheck route continuity, marker-road clearance, label collisions,
     destination hierarchy, and attribution.
   - Stop when the map is readable and purpose-fit. Do not churn styles after
     the hard checks pass unless the user requested visual exploration.

6. Deliver both surfaces when future edits are plausible.
   - Return or write SVG for future editing, PNG for bitmap use, or PDF for
     print delivery. Keep SVG as the canonical visual source.
   - Keep the final `DiagramDocument` alongside it for later chat edits.
   - State any unresolved map-data ambiguity instead of presenting inferred
     access routes as surveyed navigation truth.

## Tool Fallback

When cairn MCP tools are unavailable but local commands are allowed, use:

```bash
npx -p @yakdo/cairn cairn "<address>" -o map.svg --save-document map.json
npx -p @yakdo/cairn cairn render map.json -o map-revised.svg
```

Edit `map.json` only through the documented `DiagramDocument` fields. Validate
it by running `cairn render` before delivery.

## Boundaries

- Do not hand-author a replacement SVG during the normal workflow. Fix the
  document or renderer inputs so the result remains reproducible.
- Do not add paid map APIs or request API keys for the default path.
- Do not claim turn-by-turn navigation, accessibility compliance, or entrance
  accuracy that the OSM-derived document does not establish.
- Address generation covers OSM geography. Campus floor plans, indoor maps,
  and game worlds require a supplied or adapted `MapLayout`; do not pretend an
  address lookup can discover private topology.
- Keep OSM attribution visible in every exported map that uses OSM data.
