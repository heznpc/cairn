import { z } from "zod";
import type { GeocodingCandidate, GeocodeSearchResult } from "./types.js";
import { acceptLanguageHeader } from "./locale.js";
import { fetchUpstreamText, nominatimRequest } from "./upstream.js";
import { resolveUpstream, type UpstreamOptions } from "./upstream-config.js";

const NominatimResultSchema = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
  osm_type: z.enum(["node", "way", "relation"]).optional(),
  osm_id: z.number().int().nonnegative().safe().optional(),
  class: z.string().optional(),
  type: z.string().optional(),
  // addressdetails=1 gives us the country, which drives the default language
  // for generated labels. Optional + passthrough: a missing address block
  // degrades to English exits, it must not fail the geocode.
  address: z
    .object({ country_code: z.string().optional() })
    .passthrough()
    .optional(),
}).passthrough();

const NominatimResultsSchema = z.array(NominatimResultSchema);

function parseCoordinate(
  label: "lat" | "lon",
  raw: string,
  min: number,
  max: number,
): number {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error(`Nominatim returned an empty ${label}`);
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Nominatim returned an invalid ${label}: ${raw}`);
  }
  return value;
}

export interface GeocodeOptions {
  /**
   * Preferred language for the returned place names (BCP-47, e.g. "ja").
   * Omit to get local names — the correct default for wayfinding, since the
   * reader is standing in front of the local signage.
   */
  language?: string;
  /** Endpoint, cache, and retry policy. Defaults come from the environment. */
  upstream?: UpstreamOptions;
}

export async function geocode(
  address: string,
  opts: GeocodeOptions & { candidateId?: string } = {},
): Promise<GeocodingCandidate> {
  const result = await searchGeocode(address, opts);
  if (opts.candidateId !== undefined) {
    const selected = result.candidates.find((candidate) => candidate.candidateId === opts.candidateId);
    if (selected) return selected;
    throw new Error(`Geocoding candidate "${opts.candidateId}" is no longer in the results. Search again or use a more specific address.\n${formatCandidates(result.candidates)}`);
  }
  if (result.ambiguous) throw new AmbiguousGeocodeError(address, result.candidates);
  return result.candidates[0];
}

export class AmbiguousGeocodeError extends Error {
  constructor(address: string, readonly candidates: GeocodingCandidate[]) {
    super(`Multiple locations match "${address}". Specify a fuller address or select a candidate with candidateId (MCP) / --candidate (CLI):\n${formatCandidates(candidates)}`);
    this.name = "AmbiguousGeocodeError";
  }
}

function formatCandidates(candidates: GeocodingCandidate[]): string {
  return candidates.map((candidate) =>
    `${candidate.candidateId}: ${candidate.displayName}${candidate.kind ? ` [${candidate.kind}]` : ""} (${candidate.lat}, ${candidate.lon})`,
  ).join("\n");
}

export async function searchGeocode(
  address: string,
  opts: GeocodeOptions = {},
): Promise<GeocodeSearchResult> {
  const cfg = resolveUpstream(opts.upstream);
  const url = new URL(cfg.nominatimUrl);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");

  const acceptLanguage = acceptLanguageHeader(opts.language);
  const text = await fetchUpstreamText(
    cfg,
    nominatimRequest(cfg, url.toString(), `"${address}"`, acceptLanguage),
  );

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Nominatim returned a body that is not valid JSON");
  }

  const parsed = NominatimResultsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Nominatim returned an unexpected response shape: ${parsed.error.message}`,
    );
  }
  const results = parsed.data;

  if (results.length === 0) {
    throw new Error(`No geocoding results for: "${address}"`);
  }

  const unique = new Map<string, GeocodingCandidate>();
  for (const hit of results.slice(0, 5)) {
    const lat = parseCoordinate("lat", hit.lat, -90, 90);
    const lon = parseCoordinate("lon", hit.lon, -180, 180);
    const identity = hit.osm_type && hit.osm_id !== undefined
      ? `${hit.osm_type}:${hit.osm_id}` : `geo:${lat},${lon}`;
    // Interpolated house numbers may share the same source OSM way.
    const candidateId = hit.osm_type === "way" && hit.type === "house"
      ? `${identity}@${lat},${lon}` : identity;
    const countryCode = hit.address?.country_code?.trim().toLowerCase();
    const kind = [hit.class, hit.type].filter(Boolean).join("/");
    if (!unique.has(candidateId)) unique.set(candidateId, {
      candidateId, lat, lon, displayName: hit.display_name,
      ...(kind ? { kind } : {}),
      ...(countryCode ? { countryCode } : {}), raw: hit,
    });
  }
  const candidates = [...unique.values()];
  return { candidates, ambiguous: candidates.length > 1 };
}
