import { geocode } from "./geocode.js";
import { findLandmarks } from "./landmarks.js";
import { findRoads } from "./roads.js";
import { curate } from "./curate.js";
import { renderSVG } from "./render.js";
import type { MapLayout, RenderOptions } from "./types.js";

export interface GenerateMapInput extends RenderOptions {
  radiusMeters?: number;
  limit?: number;
  label?: string;
  // Draw the road skeleton (default true). Set false to skip the extra
  // Overpass round-trip and render landmarks-only.
  roads?: boolean;
}

export interface GenerateMapResult {
  svg: string;
  layout: MapLayout;
}

export async function generateMap(
  address: string,
  opts: GenerateMapInput = {},
): Promise<GenerateMapResult> {
  const radius = opts.radiusMeters ?? 400;
  const geo = await geocode(address);
  const all = await findLandmarks(geo.lat, geo.lon, radius);
  const picked = curate(
    { lat: geo.lat, lon: geo.lon },
    all,
    opts.limit ?? 5,
  );

  // Roads extend a bit past the landmark radius so the skeleton reaches the
  // frame edges. Sequential after landmarks — the Overpass gate serializes
  // these anyway, so there's nothing to gain from racing them.
  const roads =
    opts.roads === false
      ? []
      : await findRoads(geo.lat, geo.lon, Math.round(radius * 1.2));

  // bbox is computed from the destination + landmarks only, NOT roads: a road
  // way can run kilometres past the area, and including it would zoom the map
  // out to uselessness. Roads simply trail off the frame edge instead.
  const lats = [geo.lat, ...picked.map((p) => p.lat)];
  const lons = [geo.lon, ...picked.map((p) => p.lon)];
  const padLat = 0.0008;
  const padLon = 0.0012;

  const layout: MapLayout = {
    center: { lat: geo.lat, lon: geo.lon, label: opts.label ?? "여기" },
    landmarks: picked,
    roads,
    bbox: {
      north: Math.max(...lats) + padLat,
      south: Math.min(...lats) - padLat,
      east: Math.max(...lons) + padLon,
      west: Math.min(...lons) - padLon,
    },
  };

  const svg = renderSVG(layout, opts);
  return { svg, layout };
}
