import type { LandmarkCategory, RenderPreset, RoadClass } from "../types.js";

export const PAPER = "#fffef9";
export const PAPER_EDGE = "#e5ded2";
export const LABEL_HALO = PAPER;
export const INK = "#25221d";
export const DESTINATION = "#d63b31";
export const MUTED_INK = "#5f5a52";
export const TRANSIT_INK = "#216f86";
export const EXIT_INK = "#207665";

// Road hierarchy is load-bearing for a 약도: the reader has to see the main
// artery at a glance. Widen the width gap and darken the top tiers so primary
// reads as "the big road you navigate by", while residential/path recede into
// pale filler. Kept in a warm-gray range so the linework still prints like ink.
export const BASE_ROAD_STYLE: Record<RoadClass, { width: number; color: string }> = {
  primary: { width: 12, color: "#a29b8c" },
  secondary: { width: 7.5, color: "#c1baac" },
  tertiary: { width: 4, color: "#d8d1c4" },
  residential: { width: 3, color: "#e6dfd3" },
  path: { width: 2.5, color: "#ece6db" },
};

export const ROAD_RANK: Record<RoadClass, number> = {
  primary: 5,
  secondary: 4,
  tertiary: 3,
  residential: 2,
  path: 1,
};

export const APPROACH_RANK: Record<LandmarkCategory, number> = {
  station_exit: 10,
  station: 9,
  bus_stop: 7,
  landmark: 5,
  hospital: 4,
  school: 4,
  park: 3,
  convenience: 3,
  cafe: 2,
  restaurant: 2,
  building: 1,
};

export interface PresetSpec {
  roadScale: number;
  roadGeometry: "spine" | "orthogonal";
  showFrame: boolean;
  showRoadSkeleton: boolean;
  destinationLabel: "filled" | "outlined";
  destinationTailWidth: number;
  approachWidth: number;
  approachCasingWidth: number;
  approachStartTrim: number;
  approachEndTrim: number;
  landmarkLabelMax: number;
  labelImportanceMin: number;
  maxLandmarks: number;
  preferredCategories?: ReadonlySet<LandmarkCategory>;
  showRoadLabels: boolean;
  avoidRoadLabels: boolean;
  hideClutteredLabels: boolean;
  maxVisibleRoads: number;
}

export const PRESETS: Record<RenderPreset, PresetSpec> = {
  standard: {
    roadScale: 1,
    roadGeometry: "spine",
    showFrame: true,
    showRoadSkeleton: true,
    destinationLabel: "filled",
    destinationTailWidth: 2.5,
    approachWidth: 3.5,
    approachCasingWidth: 8,
    approachStartTrim: 36,
    approachEndTrim: 30,
    landmarkLabelMax: 9,
    labelImportanceMin: 0,
    maxLandmarks: 5,
    showRoadLabels: true,
    // Treat road spines as label obstacles so landmark names route around the
    // skeleton instead of printing on top of it. Standard keeps every label
    // (hideClutteredLabels stays false) — this tidies placement, not content.
    avoidRoadLabels: true,
    hideClutteredLabels: false,
    maxVisibleRoads: 5,
  },
  compact: {
    roadScale: 1.04,
    roadGeometry: "spine",
    showFrame: true,
    showRoadSkeleton: true,
    destinationLabel: "filled",
    destinationTailWidth: 2.6,
    approachWidth: 3.8,
    approachCasingWidth: 9,
    approachStartTrim: 30,
    approachEndTrim: 24,
    landmarkLabelMax: 8,
    labelImportanceMin: 0.85,
    maxLandmarks: 2,
    preferredCategories: new Set(["station_exit", "station", "bus_stop"]),
    showRoadLabels: true,
    avoidRoadLabels: true,
    hideClutteredLabels: true,
    maxVisibleRoads: 3,
  },
  minimal: {
    roadScale: 0.82,
    roadGeometry: "spine",
    showFrame: false,
    showRoadSkeleton: false,
    destinationLabel: "outlined",
    destinationTailWidth: 1.8,
    approachWidth: 4.2,
    approachCasingWidth: 9.5,
    approachStartTrim: 24,
    approachEndTrim: 12,
    landmarkLabelMax: 8,
    labelImportanceMin: 0.9,
    maxLandmarks: 1,
    preferredCategories: new Set(["station_exit", "station", "bus_stop"]),
    showRoadLabels: false,
    avoidRoadLabels: true,
    hideClutteredLabels: true,
    maxVisibleRoads: 0,
  },
  schematic: {
    roadScale: 0.95,
    roadGeometry: "orthogonal",
    showFrame: true,
    showRoadSkeleton: true,
    destinationLabel: "filled",
    destinationTailWidth: 2.2,
    approachWidth: 3.5,
    approachCasingWidth: 8,
    approachStartTrim: 34,
    approachEndTrim: 28,
    landmarkLabelMax: 8,
    labelImportanceMin: 0.5,
    maxLandmarks: 4,
    showRoadLabels: true,
    avoidRoadLabels: true,
    hideClutteredLabels: true,
    maxVisibleRoads: 4,
  },
  badge: {
    roadScale: 0.9,
    roadGeometry: "spine",
    showFrame: true,
    showRoadSkeleton: false,
    destinationLabel: "filled",
    destinationTailWidth: 2,
    approachWidth: 4,
    approachCasingWidth: 9,
    approachStartTrim: 24,
    approachEndTrim: 12,
    landmarkLabelMax: 8,
    labelImportanceMin: 0.9,
    maxLandmarks: 1,
    preferredCategories: new Set(["station_exit", "station", "bus_stop"]),
    showRoadLabels: false,
    avoidRoadLabels: true,
    hideClutteredLabels: true,
    maxVisibleRoads: 0,
  },
};
