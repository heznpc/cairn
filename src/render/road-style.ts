import type { RoadClass } from "../types.js";
import { BASE_ROAD_STYLE, type PresetSpec } from "./theme.js";

export function roadStyle(
  roadClass: RoadClass,
  preset: PresetSpec,
): { width: number; color: string } {
  const style = BASE_ROAD_STYLE[roadClass] ?? BASE_ROAD_STYLE.path;
  return { width: style.width * preset.roadScale, color: style.color };
}
