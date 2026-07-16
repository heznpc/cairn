import type { MapLayout } from "../types.js";
import { boxScore, type Box, type CenterCallout } from "./text.js";

// Tiny per-index weight that makes candidate selection deterministic: on a
// score tie the earlier (more-preferred) candidate wins regardless of sort
// stability. Smaller than any meaningful boxScore difference.
const CANDIDATE_ORDER_TIE_BREAK = 0.01;

// Score each candidate box, add the order tie-break, and return the lowest —
// shared by the landmark-label and center-callout placers.
function bestByScore<T extends Box>(
  candidates: T[],
  width: number,
  height: number,
  obstacles: Box[],
): { candidate: T; score: number } {
  return candidates
    .map((candidate, index) => ({
      candidate,
      score: boxScore(candidate, width, height, obstacles) + index * CANDIDATE_ORDER_TIE_BREAK,
    }))
    .sort((a, b) => a.score - b.score)[0];
}

export interface ProjectedLandmark {
  lm: MapLayout["landmarks"][number];
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  displaced: boolean;
  labelLines: string[];
  labelWidth: number;
  labelHeight: number;
  labelHidden: boolean;
}

export interface LabelBox extends Box {
  hidden?: boolean;
}

export function placeLandmarkLabels(
  landmarks: ProjectedLandmark[],
  width: number,
  height: number,
  baseObstacles: Box[],
  hideClutteredLabels: boolean,
): LabelBox[] {
  const placed: LabelBox[] = [];
  for (const lm of landmarks) {
    if (lm.labelHidden) {
      placed.push({ x: lm.x, y: lm.y, width: 0, height: 0, hidden: true });
      continue;
    }
    const boxHeight = lm.labelHeight;
    // Candidate anchor positions: below, above, right, left, then two diagonal
    // escapes for crowded intersections where only a corner is open.
    const positions: Array<{ x: number; y: number }> = [
      { x: lm.x - lm.labelWidth / 2, y: lm.y + 23 },
      { x: lm.x - lm.labelWidth / 2, y: lm.y - 23 - boxHeight },
      { x: lm.x + 24, y: lm.y - boxHeight / 2 },
      { x: lm.x - lm.labelWidth - 24, y: lm.y - boxHeight / 2 },
      { x: lm.x + 22, y: lm.y + 20 },
      { x: lm.x - lm.labelWidth - 22, y: lm.y + 20 },
    ];
    const candidates: Box[] = positions.map((pos) => ({
      ...pos,
      width: lm.labelWidth,
      height: boxHeight,
    }));

    const obstacles = [...baseObstacles, ...placed];
    const best = bestByScore(candidates, width, height, obstacles);
    if (hideClutteredLabels && best.score > 1200 && lm.lm.importance < 0.85) {
      placed.push({ x: lm.x, y: lm.y, width: 0, height: 0, hidden: true });
      continue;
    }
    placed.push(best.candidate);
  }
  return placed;
}

export function pickCenterCallout(
  cx: number,
  cy: number,
  labelWidth: number,
  width: number,
  height: number,
  obstacles: Box[],
): CenterCallout {
  const boxHeight = 24;
  const candidates: CenterCallout[] = [
    {
      x: cx - labelWidth / 2,
      y: cy - 48,
      width: labelWidth,
      height: boxHeight,
      anchorX: cx,
      anchorY: cy - 24,
    },
    {
      x: cx - labelWidth / 2,
      y: cy + 24,
      width: labelWidth,
      height: boxHeight,
      anchorX: cx,
      anchorY: cy + 24,
    },
    {
      x: cx - labelWidth - 28,
      y: cy - boxHeight / 2,
      width: labelWidth,
      height: boxHeight,
      anchorX: cx - 28,
      anchorY: cy,
    },
    {
      x: cx + 28,
      y: cy - boxHeight / 2,
      width: labelWidth,
      height: boxHeight,
      anchorX: cx + 28,
      anchorY: cy,
    },
  ];

  return bestByScore(candidates, width, height, obstacles).candidate;
}
