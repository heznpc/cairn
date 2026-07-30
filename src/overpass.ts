import { z } from "zod";
import { fetchUpstreamText, overpassRequest } from "./upstream.js";
import { resolveUpstream, type UpstreamOptions } from "./upstream-config.js";

/**
 * Shared Overpass API client: cache + rate-limit gate + retry + timeout +
 * envelope validation.
 *
 * Both `landmarks.ts` (POI nodes) and `roads.ts` (highway ways) issue Overpass
 * queries; this centralizes the transport concerns and the loose-envelope
 * check. Per-element parsing stays in each caller because the element shapes
 * differ (nodes vs. ways-with-geometry).
 */

// Overpass queries carry [timeout:25]; give the client 30s to read the body.
export const OVERPASS_TIMEOUT_MS = 30_000;

// Validate only the envelope shape loosely; individual elements are validated
// (and tolerated/skipped) by each caller so one drifted element can't fail
// the whole batch.
const EnvelopeSchema = z.object({ elements: z.array(z.unknown()) });

/**
 * Run an Overpass QL query and return the raw `elements` array.
 *
 * Identical queries are served from the on-disk cache, so a curation loop over
 * the same area costs one round-trip. Live requests are spaced by the Overpass
 * gate and retried on 429/5xx, which the public instance returns routinely.
 */
export async function overpassFetch(
  query: string,
  timeoutMs: number = OVERPASS_TIMEOUT_MS,
  upstream: UpstreamOptions = {},
): Promise<unknown[]> {
  const cfg = resolveUpstream(upstream);
  const text = await fetchUpstreamText(cfg, overpassRequest(cfg, query, timeoutMs));

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Overpass returned a body that is not valid JSON");
  }

  const envelope = EnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new Error(
      `Overpass returned an unexpected response shape: ${envelope.error.message}`,
    );
  }
  return envelope.data.elements;
}
