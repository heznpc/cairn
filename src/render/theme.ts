import type {
  LandmarkCategory,
  RenderTemplate,
  RenderTheme,
  RoadClass,
} from "../types.js";

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

export interface TemplateSpec {
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

export const TEMPLATES: Record<RenderTemplate, TemplateSpec> = {
  standard: {
    roadScale: 1,
    roadGeometry: "spine",
    showFrame: true,
    showRoadSkeleton: true,
    destinationLabel: "filled",
    destinationTailWidth: 2.5,
    approachWidth: 3.5,
    approachCasingWidth: 8,
    approachStartTrim: 24,
    approachEndTrim: 20,
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
    approachStartTrim: 24,
    approachEndTrim: 18,
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
    approachStartTrim: 24,
    approachEndTrim: 20,
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

/** @deprecated Use TemplateSpec. */
export type PresetSpec = TemplateSpec;
/** @deprecated Use TEMPLATES. */
export const PRESETS = TEMPLATES;

export interface ThemeSpec {
  fontFamily: string;
  background: string;
  frame: string;
  ink: string;
  destination: string;
  landmark: string;
  transit: string;
  exit: string;
  roadLabel: string;
  attribution: string;
  roads: Record<RoadClass, string>;
}

export const THEMES: Record<RenderTheme, ThemeSpec> = {
  paper: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif",
    background: PAPER,
    frame: PAPER_EDGE,
    ink: INK,
    destination: DESTINATION,
    landmark: MUTED_INK,
    transit: TRANSIT_INK,
    exit: EXIT_INK,
    roadLabel: "#8a857c",
    attribution: "#aaa59d",
    roads: {
      primary: "#a29b8c",
      secondary: "#c1baac",
      tertiary: "#d8d1c4",
      residential: "#e6dfd3",
      path: "#ece6db",
    },
  },
  mono: {
    fontFamily: "Arial, 'Apple SD Gothic Neo', sans-serif",
    background: "#ffffff",
    frame: "#cfcfcf",
    ink: "#111111",
    destination: "#111111",
    landmark: "#3d3d3d",
    transit: "#111111",
    exit: "#555555",
    roadLabel: "#666666",
    attribution: "#999999",
    roads: {
      primary: "#555555",
      secondary: "#858585",
      tertiary: "#adadad",
      residential: "#d0d0d0",
      path: "#e2e2e2",
    },
  },
  civic: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', sans-serif",
    background: "#f8fbfc",
    frame: "#cbd8dc",
    ink: "#17313a",
    destination: "#d94f3d",
    landmark: "#4f6268",
    transit: "#006b7d",
    exit: "#28765c",
    roadLabel: "#61767c",
    attribution: "#8da0a5",
    roads: {
      primary: "#71878d",
      secondary: "#9eafb3",
      tertiary: "#becbce",
      residential: "#d8e1e3",
      path: "#e6edef",
    },
  },
  invitation: {
    fontFamily: "Georgia, 'Noto Serif KR', 'AppleMyungjo', serif",
    background: "#fffafc",
    frame: "#e6d5dc",
    ink: "#3f2b33",
    destination: "#9b3f60",
    landmark: "#705b64",
    transit: "#675986",
    exit: "#8a663f",
    roadLabel: "#8d747e",
    attribution: "#b19da5",
    roads: {
      primary: "#9e8991",
      secondary: "#c0adb4",
      tertiary: "#d7c8cd",
      residential: "#e8dde1",
      path: "#f0e8eb",
    },
  },
};
