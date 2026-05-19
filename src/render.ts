import type { LandmarkCategory, MapLayout, RenderOptions } from "./types.js";

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

export function renderSVG(layout: MapLayout, opts: RenderOptions = {}): string {
  const width = opts.width ?? 600;
  const height = opts.height ?? 400;
  const { bbox, center, landmarks } = layout;

  const project = (lat: number, lon: number): [number, number] => {
    const denomLon = bbox.east - bbox.west || 1e-6;
    const denomLat = bbox.north - bbox.south || 1e-6;
    const x = ((lon - bbox.west) / denomLon) * (width - 100) + 50;
    const y = ((bbox.north - lat) / denomLat) * (height - 100) + 50;
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
