import type { LandmarkCategory } from "../types.js";
import { EXIT_INK, MUTED_INK, TRANSIT_INK } from "./theme.js";

// One stroke weight and one stroked grammar for the whole pictogram family, so
// the icons read as a single designed set rather than a grab-bag. Every icon is
// centered on (x,y), fits an ~±10px optical box, and uses fill="none" — no
// filled shapes (that filled block is what made the old hospital cross stick out).
const ICON_STROKE = 1.7;

export function landmarkIcon(category: LandmarkCategory, x: number, y: number, color: string): string {
  const p = (n: number) => n.toFixed(1);
  const g = `data-landmark-icon="${category}" fill="none" stroke="${color}" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (category) {
    case "station":
      return `<g ${g}><rect x="${p(x - 7)}" y="${p(y - 8)}" width="14" height="12" rx="2.5"/><path d="M${p(x - 4)},${p(y - 3)} H${p(x + 4)}"/><path d="M${p(x - 4)},${p(y + 7)} L${p(x - 7)},${p(y + 10)} M${p(x + 4)},${p(y + 7)} L${p(x + 7)},${p(y + 10)}"/></g>`;
    case "station_exit":
      return `<g ${g}><path d="M${p(x - 8)},${p(y)} H${p(x + 5)}"/><path d="M${p(x + 1)},${p(y - 5)} L${p(x + 7)},${p(y)} L${p(x + 1)},${p(y + 5)}"/><path d="M${p(x - 8)},${p(y - 8)} V${p(y + 8)}"/></g>`;
    case "bus_stop":
      return `<g ${g}><rect x="${p(x - 8)}" y="${p(y - 7)}" width="16" height="11" rx="2"/><path d="M${p(x - 5)},${p(y - 1)} H${p(x + 5)} M${p(x - 5)},${p(y + 7)} H${p(x - 3)} M${p(x + 3)},${p(y + 7)} H${p(x + 5)}"/></g>`;
    case "cafe":
      return `<g ${g}><path d="M${p(x - 7)},${p(y - 3)} H${p(x + 4)} V${p(y + 4)} Q${p(x + 4)},${p(y + 8)} ${p(x - 2)},${p(y + 8)} Q${p(x - 8)},${p(y + 8)} ${p(x - 8)},${p(y + 4)} V${p(y - 3)}"/><path d="M${p(x + 4)},${p(y - 1)} H${p(x + 8)} Q${p(x + 10)},${p(y - 1)} ${p(x + 10)},${p(y + 2)} Q${p(x + 10)},${p(y + 5)} ${p(x + 5)},${p(y + 5)}"/></g>`;
    case "convenience":
      return `<g ${g}><path d="M${p(x - 7)},${p(y - 1)} L${p(x - 5)},${p(y + 8)} H${p(x + 6)} L${p(x + 8)},${p(y - 1)} Z"/><path d="M${p(x - 4)},${p(y - 1)} Q${p(x)},${p(y - 9)} ${p(x + 4)},${p(y - 1)}"/></g>`;
    case "restaurant":
      return `<g ${g}><path d="M${p(x - 5)},${p(y - 8)} V${p(y + 8)} M${p(x - 8)},${p(y - 8)} V${p(y - 2)} Q${p(x - 8)},${p(y + 1)} ${p(x - 5)},${p(y + 1)} Q${p(x - 2)},${p(y + 1)} ${p(x - 2)},${p(y - 2)} V${p(y - 8)}"/><path d="M${p(x + 6)},${p(y - 8)} Q${p(x + 2)},${p(y - 3)} ${p(x + 6)},${p(y + 1)} V${p(y + 8)}"/></g>`;
    case "school":
      return `<g ${g}><path d="M${p(x - 9)},${p(y - 2)} L${p(x)},${p(y - 8)} L${p(x + 9)},${p(y - 2)}"/><path d="M${p(x - 6)},${p(y - 1)} V${p(y + 8)} H${p(x + 6)} V${p(y - 1)}"/></g>`;
    case "hospital":
      // Stroked medical cross — same grammar as the rest, not a bare filled block.
      return `<g ${g}><path d="M${p(x)},${p(y - 7)} V${p(y + 7)}"/><path d="M${p(x - 7)},${p(y)} H${p(x + 7)}"/></g>`;
    case "park":
      return `<g ${g}><path d="M${p(x)},${p(y + 8)} V${p(y - 3)}"/><path d="M${p(x - 8)},${p(y - 1)} Q${p(x)},${p(y - 10)} ${p(x + 8)},${p(y - 1)} Q${p(x + 4)},${p(y + 4)} ${p(x)},${p(y + 1)} Q${p(x - 4)},${p(y + 4)} ${p(x - 8)},${p(y - 1)}"/></g>`;
    case "landmark":
      return `<g ${g}><path d="M${p(x)},${p(y - 9)} L${p(x + 3)},${p(y - 2)} L${p(x + 10)},${p(y - 2)} L${p(x + 4)},${p(y + 2)} L${p(x + 6)},${p(y + 9)} L${p(x)},${p(y + 5)} L${p(x - 6)},${p(y + 9)} L${p(x - 4)},${p(y + 2)} L${p(x - 10)},${p(y - 2)} L${p(x - 3)},${p(y - 2)} Z"/></g>`;
    case "building":
      return `<g ${g}><rect x="${p(x - 7)}" y="${p(y - 9)}" width="14" height="18" rx="1.5"/><path d="M${p(x - 3)},${p(y - 4)} H${p(x - 1)} M${p(x + 3)},${p(y - 4)} H${p(x + 5)} M${p(x - 3)},${p(y + 1)} H${p(x - 1)} M${p(x + 3)},${p(y + 1)} H${p(x + 5)} M${p(x)},${p(y + 9)} V${p(y + 4)}"/></g>`;
  }
}

export function markerStyle(category: LandmarkCategory): { color: string; emphasis?: boolean } {
  switch (category) {
    case "station":
      return { color: TRANSIT_INK, emphasis: true };
    case "station_exit":
      return { color: EXIT_INK, emphasis: true };
    default:
      return { color: MUTED_INK };
  }
}
