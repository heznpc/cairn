import { geocode } from "./geocode.js";
import { findLandmarks } from "./landmarks.js";
import { curate } from "./curate.js";
import { renderSVG } from "./render.js";
import type { MapLayout, RenderOptions } from "./types.js";

export interface GenerateMapInput extends RenderOptions {
  radiusMeters?: number;
  limit?: number;
  label?: string;
}

export interface GenerateMapResult {
  svg: string;
  layout: MapLayout;
}

export async function generateMap(
  address: string,
  opts: GenerateMapInput = {},
): Promise<GenerateMapResult> {
  const geo = await geocode(address);
  const all = await findLandmarks(geo.lat, geo.lon, opts.radiusMeters ?? 400);
  const picked = curate(
    { lat: geo.lat, lon: geo.lon },
    all,
    opts.limit ?? 5,
  );

  const lats = [geo.lat, ...picked.map((p) => p.lat)];
  const lons = [geo.lon, ...picked.map((p) => p.lon)];
  const padLat = 0.0008;
  const padLon = 0.0012;

  const layout: MapLayout = {
    center: { lat: geo.lat, lon: geo.lon, label: opts.label ?? "여기" },
    landmarks: picked,
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
