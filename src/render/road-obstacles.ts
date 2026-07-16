import type { MapLayout } from "../types.js";
import type { Box } from "./text.js";
import { diagramRoadSpine, type RoadSpine } from "./road-geometry.js";

export function roadObstacleBoxes(
  roads: MapLayout["roads"],
  project: (lat: number, lon: number) => [number, number],
  width: number,
  height: number,
): Box[] {
  return roads
    .map((road) => diagramRoadSpine(road, project, width, height))
    .filter((spine): spine is RoadSpine => spine !== null)
    .map((spine) => {
      const pad = 9;
      const minX = Math.min(spine.start.x, spine.end.x) - pad;
      const minY = Math.min(spine.start.y, spine.end.y) - pad;
      const maxX = Math.max(spine.start.x, spine.end.x) + pad;
      const maxY = Math.max(spine.start.y, spine.end.y) + pad;
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    });
}
