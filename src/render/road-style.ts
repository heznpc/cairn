import type { RoadClass } from "../types.js";
import {
  BASE_ROAD_STYLE,
  THEMES,
  type TemplateSpec,
  type ThemeSpec,
} from "./theme.js";

export function roadStyle(
  roadClass: RoadClass,
  template: TemplateSpec,
  theme: ThemeSpec = THEMES.paper,
): { width: number; color: string } {
  const style = BASE_ROAD_STYLE[roadClass] ?? BASE_ROAD_STYLE.path;
  return {
    width: style.width * template.roadScale,
    color: theme.roads[roadClass] ?? theme.roads.path,
  };
}
