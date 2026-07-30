import { geocode } from "./geocode.js";
import { findLandmarks } from "./landmarks.js";
import { findRoads } from "./roads.js";
import { curate } from "./curate.js";
import {
  createDiagramDocument,
  renderDiagramDocument,
} from "./diagram-document.js";
import { MAX_RADIUS_METERS } from "./limits.js";
import { hereLabel, resolveLabelLanguage } from "./locale.js";
import type { UpstreamOptions } from "./upstream-config.js";
import type { DiagramDocument, MapLayout, RenderOptions } from "./types.js";

export interface GenerateMapInput extends RenderOptions {
  radiusMeters?: number;
  limit?: number;
  label?: string;
  // Draw the road skeleton (default true). Set false to skip the extra
  // Overpass round-trip and render landmarks-only.
  roads?: boolean;
  // Endpoints, on-disk cache, and retry budget. Defaults come from the
  // environment, so the zero-config path stays a single argument.
  upstream?: UpstreamOptions;
}

export interface GenerateMapResult {
  svg: string;
  layout: MapLayout;
  document: DiagramDocument;
}

export const ROAD_SEARCH_RADIUS_MULTIPLIER = 1.2;

export async function generateMap(
  address: string,
  opts: GenerateMapInput = {},
): Promise<GenerateMapResult> {
  const radius = Math.min(opts.radiusMeters ?? 400, MAX_RADIUS_METERS);
  const upstream = opts.upstream;
  const geo = await geocode(address, { language: opts.language, upstream });
  // Generated labels follow the destination's country unless the caller asks
  // for a language: a Seoul map says "3번 출구", a Berlin map "Ausgang 3".
  const language = resolveLabelLanguage(opts.language, geo.countryCode);
  const all = await findLandmarks(geo.lat, geo.lon, radius, { language, upstream });
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
      : await findRoads(
          geo.lat,
          geo.lon,
          Math.min(MAX_RADIUS_METERS, Math.round(radius * ROAD_SEARCH_RADIUS_MULTIPLIER)),
          upstream,
        );

  // bbox is computed from the destination + landmarks only, NOT roads: a road
  // way can run kilometres past the area, and including it would zoom the map
  // out to uselessness. Roads simply trail off the frame edge instead.
  const lats = [geo.lat, ...picked.map((p) => p.lat)];
  const lons = [geo.lon, ...picked.map((p) => p.lon)];
  const padLat = 0.0008;
  const padLon = 0.0012;

  const layout: MapLayout = {
    center: { lat: geo.lat, lon: geo.lon, label: opts.label ?? hereLabel(language) },
    landmarks: picked,
    roads,
    bbox: {
      north: Math.max(...lats) + padLat,
      south: Math.min(...lats) - padLat,
      east: Math.max(...lons) + padLon,
      west: Math.min(...lons) - padLon,
    },
  };

  const document = createDiagramDocument(layout, opts);
  const svg = renderDiagramDocument(document);
  return { svg, layout, document };
}
