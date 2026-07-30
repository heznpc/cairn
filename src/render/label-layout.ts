import type { MapLayout } from "../types.js";
import {
  BOX_OVERLAP_SCORE_PER_PX,
  boxScore,
  overlapArea,
  type Box,
  type CenterCallout,
} from "./text.js";

// Tiny per-index weight that makes candidate selection deterministic: on a
// score tie the earlier (more-preferred) candidate wins regardless of sort
// stability. Smaller than any meaningful boxScore difference.
const CANDIDATE_ORDER_TIE_BREAK = 0.01;
const CLUTTERED_LABEL_HIDE_SCORE = 1200;

// Score each candidate box, add the order tie-break, and return the lowest —
// used by the center-callout placer.
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

interface LabelChoice {
  box: LabelBox;
  baseScore: number;
}

interface LabelPlan {
  boxes: LabelBox[];
  score: number;
}

export function placeLandmarkLabels(
  landmarks: ProjectedLandmark[],
  width: number,
  height: number,
  baseObstacles: Box[],
  hideClutteredLabels: boolean,
): LabelBox[] {
  const choiceSets = landmarks.map((landmark) =>
    landmarkLabelChoices(
      landmark,
      width,
      height,
      baseObstacles,
      hideClutteredLabels,
    )
  );

  // Template selection caps a scene at five landmarks, so exhaustive search
  // visits at most 7^5 combinations (six positions plus an optional hidden
  // choice). Unlike sequential greedy placement, this can move an earlier
  // label when doing so creates a better arrangement for the whole scene.
  let bestPlan: LabelPlan | undefined;
  const visit = (index: number, boxes: LabelBox[], score: number): void => {
    if (bestPlan && score >= bestPlan.score) return;
    if (index === choiceSets.length) {
      bestPlan = { boxes: [...boxes], score };
      return;
    }

    for (const choice of choiceSets[index]) {
      let incrementalScore = choice.baseScore;
      if (!choice.box.hidden) {
        for (const placed of boxes) {
          if (!placed.hidden) {
            incrementalScore +=
              overlapArea(choice.box, placed) * BOX_OVERLAP_SCORE_PER_PX;
          }
        }
      }
      boxes.push(choice.box);
      visit(index + 1, boxes, score + incrementalScore);
      boxes.pop();
    }
  };

  visit(0, [], 0);
  return bestPlan?.boxes ?? [];
}

function landmarkLabelChoices(
  landmark: ProjectedLandmark,
  width: number,
  height: number,
  baseObstacles: Box[],
  hideClutteredLabels: boolean,
): LabelChoice[] {
  if (landmark.labelHidden) {
    return [{
      box: hiddenLabelBox(landmark),
      baseScore: 0,
    }];
  }

  const boxHeight = landmark.labelHeight;
  // Candidate anchor positions: below, above, right, left, then two diagonal
  // escapes for crowded intersections where only a corner is open.
  const positions: Array<{ x: number; y: number }> = [
    { x: landmark.x - landmark.labelWidth / 2, y: landmark.y + 23 },
    { x: landmark.x - landmark.labelWidth / 2, y: landmark.y - 23 - boxHeight },
    { x: landmark.x + 24, y: landmark.y - boxHeight / 2 },
    { x: landmark.x - landmark.labelWidth - 24, y: landmark.y - boxHeight / 2 },
    { x: landmark.x + 22, y: landmark.y + 20 },
    { x: landmark.x - landmark.labelWidth - 22, y: landmark.y + 20 },
  ];
  const choices: LabelChoice[] = positions.map((position, index) => {
    const box = {
      ...position,
      width: landmark.labelWidth,
      height: boxHeight,
    };
    return {
      box,
      baseScore:
        boxScore(box, width, height, baseObstacles) +
        index * CANDIDATE_ORDER_TIE_BREAK,
    };
  });

  if (hideClutteredLabels && landmark.lm.importance < 0.85) {
    // The hidden choice has the same cost as the old per-label clutter
    // threshold. It is listed last, so an equally good visible solution wins;
    // curated input order also keeps earlier, more important labels on ties.
    choices.push({
      box: hiddenLabelBox(landmark),
      baseScore: CLUTTERED_LABEL_HIDE_SCORE,
    });
  }
  return choices;
}

function hiddenLabelBox(landmark: ProjectedLandmark): LabelBox {
  return {
    x: landmark.x,
    y: landmark.y,
    width: 0,
    height: 0,
    hidden: true,
  };
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
