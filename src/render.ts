import type { LandmarkCategory, MapLayout, RenderOptions, RoadClass } from "./types.js";

const ICONS: Record<LandmarkCategory, string> = {
  station: "Ⓜ",
  bus_stop: "B",
  cafe: "☕",
  convenience: "C",
  restaurant: "🍴",
  school: "🎓",
  hospital: "✚",
  park: "🌳",
  landmark: "★",
  building: "◼",
};

// Road stroke width / colour by importance tier. Wider + darker for the roads
// a reader actually navigates by; thin + pale for residential filler. Tuned
// for the #fdfcf7 cream background.
const ROAD_STYLE: Record<RoadClass, { width: number; color: string }> = {
  primary: { width: 7, color: "#c8c0ad" },
  secondary: { width: 5, color: "#d0c9b6" },
  tertiary: { width: 3.5, color: "#d8d2c2" },
  residential: { width: 2.5, color: "#e0dacb" },
  path: { width: 1.5, color: "#e7e2d4" },
};

// Only the two top tiers get name labels (residential clutter kills legibility).
const LABELED_ROAD_CLASSES = new Set<RoadClass>(["primary", "secondary"]);

// Minimum canvas dimension — projection uses (width - 100) and (height - 100)
// as the plotting span (50px margin on each side). At width=100 the span is
// zero, below that it's negative and coordinates flip. handlers.ts and cli.ts
// inputSchemas enforce 100 at the entry points; this clamp is defense in
// depth for direct pipeline.ts callers (tests, future internal users) and
// guarantees a strictly-positive plotting span.
const MIN_DIM = 100;
const MIN_SPAN = 1;

export function renderSVG(layout: MapLayout, opts: RenderOptions = {}): string {
  const width = Math.max(opts.width ?? 600, MIN_DIM);
  const height = Math.max(opts.height ?? 400, MIN_DIM);
  const spanX = Math.max(width - 100, MIN_SPAN);
  const spanY = Math.max(height - 100, MIN_SPAN);
  const { bbox, center, landmarks } = layout;
  const roads = layout.roads ?? [];

  const project = (lat: number, lon: number): [number, number] => {
    const denomLon = bbox.east - bbox.west || 1e-6;
    const denomLat = bbox.north - bbox.south || 1e-6;
    const x = ((lon - bbox.west) / denomLon) * spanX + 50;
    const y = ((bbox.north - lat) / denomLat) * spanY + 50;
    return [x, y];
  };

  const [cx, cy] = project(center.lat, center.lon);

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif">`,
  );
  lines.push(`<rect width="${width}" height="${height}" fill="#fdfcf7"/>`);

  // Subtle background grid
  for (let x = 0; x < width; x += 40) {
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#f0ede4" stroke-width="0.5"/>`,
    );
  }
  for (let y = 0; y < height; y += 40) {
    lines.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#f0ede4" stroke-width="0.5"/>`,
    );
  }

  // Road skeleton — drawn first, under everything, so landmarks and the
  // destination marker sit on top. This is what turns the picture from a
  // scatter of points into a 약도: a few roads you navigate along.
  // SVG clips to the viewBox, so road segments running past the frame edge
  // (Overpass returns full way geometry) simply trail off — the desired look.
  for (const road of roads) {
    if (road.points.length < 2) continue;
    const d = road.points
      .map((p, i) => {
        const [px, py] = project(p.lat, p.lon);
        return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(" ");
    const style = ROAD_STYLE[road.class] ?? ROAD_STYLE.path;
    lines.push(
      `<path d="${d}" fill="none" stroke="${style.color}" stroke-width="${style.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  // Road name labels — one per unique name (Overpass splits a road into many
  // same-named way segments), placed at the midpoint of its longest projected
  // segment. Only top-tier roads, to keep the frame legible.
  for (const [name, pos] of roadLabelPositions(roads, project)) {
    lines.push(
      `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" text-anchor="middle" font-size="10" fill="#a89f8c" font-weight="500">${escapeXml(name)}</text>`,
    );
  }

  // Connector lines (landmark -> center), drawn first so circles sit on top
  for (const lm of landmarks) {
    const [lx, ly] = project(lm.lat, lm.lon);
    lines.push(
      `<line x1="${lx}" y1="${ly}" x2="${cx}" y2="${cy}" stroke="#d4cfc0" stroke-width="1.5" stroke-dasharray="3,3"/>`,
    );
  }

  // Landmarks
  for (const lm of landmarks) {
    const [lx, ly] = project(lm.lat, lm.lon);
    const icon = ICONS[lm.category] ?? "◼";
    lines.push(
      `<circle cx="${lx}" cy="${ly}" r="16" fill="#fff" stroke="#333" stroke-width="2"/>`,
    );
    lines.push(
      `<text x="${lx}" y="${ly + 5}" text-anchor="middle" font-size="14">${escapeXml(icon)}</text>`,
    );
    lines.push(
      `<text x="${lx}" y="${ly + 32}" text-anchor="middle" font-size="11" fill="#333">${escapeXml(lm.name)}</text>`,
    );
  }

  // Center marker (destination)
  lines.push(
    `<circle cx="${cx}" cy="${cy}" r="11" fill="#d63838" stroke="#fff" stroke-width="3"/>`,
  );
  lines.push(
    `<text x="${cx}" y="${cy - 18}" text-anchor="middle" font-size="13" font-weight="bold" fill="#d63838">${escapeXml(center.label)}</text>`,
  );

  lines.push(`</svg>`);
  return lines.join("\n");
}

/**
 * Pick a single label position per unique road name.
 *
 * Overpass returns one logical road as many same-named way segments; labeling
 * each repeats "테헤란로" all over the frame. We keep, per name, the segment
 * with the longest projected length and label its midpoint — the longest piece
 * is the most legible place to put the name. Only top-tier roads are eligible.
 */
function roadLabelPositions(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
): Map<string, { x: number; y: number }> {
  const best = new Map<string, { x: number; y: number; len: number }>();

  for (const road of roads) {
    if (!road.name || !LABELED_ROAD_CLASSES.has(road.class)) continue;
    if (road.points.length < 2) continue;

    const projected = road.points.map((p) => project(p.lat, p.lon));
    let len = 0;
    for (let i = 1; i < projected.length; i++) {
      len += Math.hypot(
        projected[i][0] - projected[i - 1][0],
        projected[i][1] - projected[i - 1][1],
      );
    }

    const prev = best.get(road.name);
    if (prev && prev.len >= len) continue;

    const mid = projected[Math.floor(projected.length / 2)];
    best.set(road.name, { x: mid[0], y: mid[1], len });
  }

  const out = new Map<string, { x: number; y: number }>();
  for (const [name, { x, y }] of best) out.set(name, { x, y });
  return out;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
