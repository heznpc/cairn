import type { Landmark } from "./types.js";

/**
 * Pick the most useful landmarks for wayfinding.
 *
 * Heuristic:
 *   - Importance (transit > landmark > school/hospital > shop > anonymous)
 *   - Distance balance: sweet spot ~150m from center, penalize too-close and too-far
 *   - Category diversity: prefer mixed categories over 5 of the same thing
 */
export function curate(
  center: { lat: number; lon: number },
  landmarks: Landmark[],
  limit = 5,
): Landmark[] {
  if (landmarks.length === 0) return [];

  const SWEET_SPOT_METERS = 150;
  const DECAY = 300;

  const scored = landmarks.map((lm) => {
    const dist = haversine(center, lm);
    const distScore = 1 - Math.min(1, Math.abs(dist - SWEET_SPOT_METERS) / DECAY);
    const score = lm.importance * 0.7 + distScore * 0.3;
    return { lm, score, dist };
  });

  scored.sort((a, b) => b.score - a.score);

  const picked: Landmark[] = [];
  const categoryCount = new Map<string, number>();

  // First pass: take highest-scored unique categories
  for (const { lm } of scored) {
    if (picked.length >= limit) break;
    if ((categoryCount.get(lm.category) ?? 0) === 0) {
      picked.push(lm);
      categoryCount.set(lm.category, 1);
    }
  }

  // Second pass: fill remaining slots, allowing up to 2 per category
  if (picked.length < limit) {
    for (const { lm } of scored) {
      if (picked.length >= limit) break;
      if (picked.includes(lm)) continue;
      if ((categoryCount.get(lm.category) ?? 0) < 2) {
        picked.push(lm);
        categoryCount.set(lm.category, (categoryCount.get(lm.category) ?? 0) + 1);
      }
    }
  }

  return picked;
}

function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
