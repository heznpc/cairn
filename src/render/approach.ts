import type { LandmarkCategory } from "../types.js";
import { APPROACH_RANK } from "./theme.js";

export interface ApproachCandidate<T> {
  value: T;
  id: string;
  category: LandmarkCategory;
  importance: number;
  /** Projected distance from the destination, when a scene has coordinates. */
  distance?: number;
}

export interface ApproachSelectionOptions {
  explicitId?: string;
  minimumDistance?: number;
  missingExplicitMessage?: (id: string) => string;
}

/**
 * Transit category is the primary wayfinding signal. Projected scenes use
 * distance as the tie-breaker so the approach remains legible; templates
 * without projected geometry use landmark importance instead.
 */
export function selectApproachLandmark<T>(
  candidates: readonly ApproachCandidate<T>[],
  options: ApproachSelectionOptions = {},
): T | null {
  const { explicitId, minimumDistance = 0, missingExplicitMessage } = options;
  if (explicitId) {
    const explicit = candidates.find((candidate) => candidate.id === explicitId);
    if (!explicit) {
      throw new Error(
        missingExplicitMessage?.(explicitId) ?? `Unknown approach landmark id: ${explicitId}`,
      );
    }
    return explicit.value;
  }

  let best: { value: T; score: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.distance !== undefined && candidate.distance < minimumDistance) continue;
    const secondary = candidate.distance === undefined
      ? candidate.importance * 100
      : Math.min(candidate.distance, 260);
    const score = APPROACH_RANK[candidate.category] * 1000 + secondary;
    if (!best || score > best.score) best = { value: candidate.value, score };
  }
  return best?.value ?? null;
}
