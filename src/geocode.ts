import { z } from "zod";
import type { GeocodingResult } from "./types.js";
import { fetchWithTimeout, nominatimGate } from "./http.js";
import { HTTP_USER_AGENT } from "./metadata.js";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

const NominatimResultSchema = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
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

export async function geocode(address: string): Promise<GeocodingResult> {
  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  await nominatimGate();
  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      "User-Agent": HTTP_USER_AGENT,
      "Accept-Language": "ko,en;q=0.9,ja;q=0.8",
    },
    timeoutMs: 8000,
  });

  if (!res.ok) {
    throw new Error(`Geocoding failed: ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();
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
  return {
    lat: parseCoordinate("lat", hit.lat, -90, 90),
    lon: parseCoordinate("lon", hit.lon, -180, 180),
    displayName: hit.display_name,
    raw: hit,
  };
}
