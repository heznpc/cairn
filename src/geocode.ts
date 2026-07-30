import { z } from "zod";
import type { GeocodingResult } from "./types.js";
import { acceptLanguageHeader } from "./locale.js";
import { fetchUpstreamText, nominatimRequest } from "./upstream.js";
import { resolveUpstream, type UpstreamOptions } from "./upstream-config.js";

const NominatimResultSchema = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
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
  opts: GeocodeOptions = {},
): Promise<GeocodingResult> {
  const cfg = resolveUpstream(opts.upstream);
  const url = new URL(cfg.nominatimUrl);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
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

  const hit = results[0];
  const countryCode = hit.address?.country_code?.trim().toLowerCase();
  return {
    lat: parseCoordinate("lat", hit.lat, -90, 90),
    lon: parseCoordinate("lon", hit.lon, -180, 180),
    displayName: hit.display_name,
    ...(countryCode ? { countryCode } : {}),
    raw: hit,
  };
}
