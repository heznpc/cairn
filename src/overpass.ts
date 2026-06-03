import { z } from "zod";
import { fetchWithTimeout, overpassGate } from "./http.js";

/**
 * Shared Overpass API client: rate-limit gate + timeout + envelope validation.
 *
 * Both `landmarks.ts` (POI nodes) and `roads.ts` (highway ways) issue Overpass
 * queries; this centralizes the gate, headers, error handling, and the
 * loose-envelope check. Per-element parsing stays in each caller because the
 * element shapes differ (nodes vs. ways-with-geometry).
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "cairn-mcp/0.1 (+https://github.com/heznpc/cairn)";
// Overpass queries carry [timeout:25]; give the client 30s to read the body.
export const OVERPASS_TIMEOUT_MS = 30_000;

// Validate only the envelope shape loosely; individual elements are validated
// (and tolerated/skipped) by each caller so one drifted element can't fail
// the whole batch.
const EnvelopeSchema = z.object({ elements: z.array(z.unknown()) });

/**
 * Run an Overpass QL query and return the raw `elements` array.
 *
 * Serializes through `overpassGate` (1s spacing) so bursty callers — a host
 * LLM looping over radii, or generate_map issuing landmarks+roads back to
 * back — don't 429 the public instance.
 */
export async function overpassFetch(
  query: string,
  timeoutMs: number = OVERPASS_TIMEOUT_MS,
): Promise<unknown[]> {
  await overpassGate();
  const res = await fetchWithTimeout(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    body: `data=${encodeURIComponent(query)}`,
    timeoutMs,
  });

  if (!res.ok) {
    throw new Error(`Overpass query failed: ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();
  const envelope = EnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new Error(
      `Overpass returned an unexpected response shape: ${envelope.error.message}`,
    );
  }
  return envelope.data.elements;
}
