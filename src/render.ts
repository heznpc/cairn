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
  // same-named way segments), placed at the geometric midpoint of the longest
  // *in-viewBox* run of each road. Only top-tier roads, to keep the frame
  // legible.
  for (const [name, pos] of roadLabelPositions(roads, project, width, height)) {
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
 * Overpass `out geom;` returns the *full* geometry of each way, which routinely
 * runs kilometres past the destination's bbox. The previous implementation
 * placed labels at the middle index of the longest segment, which silently
 * landed them outside the viewBox when the way extended past it (e.g. a
 * "테헤란로" label at x=-533 on a 600px frame — SVG clips strokes but not
 * text, so the label just disappeared).
 *
 * Fix: clip every segment between consecutive way nodes to the inset viewBox
 * (Liang–Barsky), keep the longest clipped sub-segment per road name, and
 * label its midpoint. Roads whose entire geometry projects outside the frame
 * produce no label — but the strokes still draw and SVG clips them. Node-only
 * filtering (the earlier attempt at this fix) was too coarse: a way like
 * Teheran-ro can pass straight through the bbox while none of its OSM nodes
 * happen to fall inside, and that approach dropped the label entirely.
 */
const LABEL_INSET_PX = 30;

/**
 * Liang–Barsky line-segment clipping against the rectangle [minX,minY,maxX,maxY].
 * Returns the clipped endpoints, or null if the segment misses the rectangle.
 */
function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): [[number, number], [number, number]] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - minX, maxX - x0, y0 - minY, maxY - y0];
  let tEnter = 0;
  let tExit = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // parallel to this edge AND on the outside
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) {
      if (t > tExit) return null;
      if (t > tEnter) tEnter = t;
    } else {
      if (t < tEnter) return null;
      if (t < tExit) tExit = t;
    }
  }
  return [
    [x0 + tEnter * dx, y0 + tEnter * dy],
    [x0 + tExit * dx, y0 + tExit * dy],
  ];
}

function roadLabelPositions(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const best = new Map<string, { x: number; y: number; len: number }>();
  const minX = LABEL_INSET_PX;
  const maxX = width - LABEL_INSET_PX;
  const minY = LABEL_INSET_PX;
  const maxY = height - LABEL_INSET_PX;

  for (const road of roads) {
    if (!road.name || !LABELED_ROAD_CLASSES.has(road.class)) continue;
    if (road.points.length < 2) continue;

    const projected = road.points.map((p) => project(p.lat, p.lon));

    let bestLen = 0;
    let bestMid: [number, number] | null = null;
    for (let i = 1; i < projected.length; i++) {
      const clipped = clipSegment(
        projected[i - 1][0],
        projected[i - 1][1],
        projected[i][0],
        projected[i][1],
        minX,
        minY,
        maxX,
        maxY,
      );
      if (!clipped) continue;
      const [[x0, y0], [x1, y1]] = clipped;
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len > bestLen) {
        bestLen = len;
        bestMid = [(x0 + x1) / 2, (y0 + y1) / 2];
      }
    }

    if (!bestMid) continue; // entire road off-frame — no legible label site

    const prev = best.get(road.name);
    if (prev && prev.len >= bestLen) continue;
    best.set(road.name, { x: bestMid[0], y: bestMid[1], len: bestLen });
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
