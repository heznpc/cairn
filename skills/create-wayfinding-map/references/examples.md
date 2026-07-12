# Golden Workflows

These are behavioral examples, not fixed landmark IDs. Always use IDs returned
by the current document.

## Campus handout

User intent: “Make an A5 map from the nearest transit stop to the student
center. Keep the main gate and remove distracting shops.”

1. Call `generate_map` with `template: "standard"`, `theme: "civic"`, and an
   explicit destination label.
2. Inspect the returned landmarks and choose the requested transit stop or gate
   as `render.approachLandmarkId`.
3. Hide low-importance cafes and convenience stores only when they interfere
   with the route or labels.
4. Reinspect, then retain SVG + document and export PDF for the handout.

## Invitation insert

User intent: “Create a small invitation map from exit 3 to the venue.”

1. Call `generate_map` with `template: "compact"` and
   `theme: "invitation"`.
2. Match exit 3 by returned name or OSM `ref`, then set its exact ID as the
   approach landmark.
3. Relabel the destination to the venue name and remove secondary POIs before
   moving markers manually.
4. Use `minimal` only when the road context adds no useful decision point.

## Black-and-white notice

User intent: “This will be photocopied in a small box.”

1. Use `theme: "mono"` and either `compact` or `badge` based on available
   space.
2. Keep one start landmark, one named road anchor, and the destination whenever
   possible.
3. Export PNG for office software or PDF for print; keep the editable document
   for later label changes.

## Game or indoor topology

User intent: “Turn this game level graph into a wayfinding diagram.”

Do not call address geocoding and do not invent topology. Require a supplied
or adapted `MapLayout`. Explain that source attribution and topology adapters
must be correct before treating the result as production-ready. Use cairn only
as the diagram renderer once that structured input exists.
