import type { GeocodingResult } from "./types.js";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "cairn-mcp/0.1 (+https://github.com/heznpc/cairn)";

export async function geocode(address: string): Promise<GeocodingResult> {
  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "ko,en;q=0.9,ja;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`Geocoding failed: ${res.status} ${res.statusText}`);
  }

  const results = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  if (results.length === 0) {
    throw new Error(`No geocoding results for: "${address}"`);
  }

  const hit = results[0];
  return {
    lat: parseFloat(hit.lat),
    lon: parseFloat(hit.lon),
    displayName: hit.display_name,
    raw: hit,
  };
}
