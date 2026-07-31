import { describe, expect, it } from "vitest";
import { LANDMARK_CATEGORIES } from "../domain-values.js";
import { THEMES } from "./theme.js";
import { landmarkIcon, markerStyle } from "./icons.js";

const theme = THEMES.paper;

describe("landmarkIcon", () => {
  // Guards the gap that let tram/ferry/supermarket/pharmacy ship with an
  // importance and an approach rank but no verified pictogram: every category
  // in the public enum must draw something.
  it.each(LANDMARK_CATEGORIES)("draws a pictogram for %s", (category) => {
    const svg = landmarkIcon(category, 50, 40, theme.landmark);

    expect(svg).toContain(`data-landmark-icon="${category}"`);
    expect(svg).toContain('fill="none"');
    expect(svg).toMatch(/^<g /);
    expect(svg).toMatch(/<\/g>$/);
  });

  it("keeps every icon in one stroked grammar", () => {
    for (const category of LANDMARK_CATEGORIES) {
      const svg = landmarkIcon(category, 50, 40, theme.landmark);
      // A filled shape is what made the old hospital cross stick out.
      expect(svg).not.toMatch(/fill="#[0-9a-fA-F]{6}"/);
      expect(svg).toContain(`stroke="${theme.landmark}"`);
    }
  });

  it("centers every glyph on the requested point", () => {
    const cx = 200;
    const cy = 100;

    for (const category of LANDMARK_CATEGORIES) {
      const svg = landmarkIcon(category, cx, cy, theme.landmark);
      // Read coordinates out of the path data only — attributes like
      // stroke-width carry numbers that are not positions.
      const coords = [...svg.matchAll(/ d="([^"]+)"/g)]
        .flatMap((match) => match[1].match(/-?\d+(?:\.\d+)?/g) ?? [])
        .map(Number);
      if (coords.length === 0) continue;

      // Icons are drawn within roughly a ±12px optical box around (x, y);
      // allow slack for the widest glyph without letting one drift off-marker.
      expect(Math.min(...coords), `${category} min`).toBeGreaterThan(
        Math.min(cx, cy) - 20,
      );
      expect(Math.max(...coords), `${category} max`).toBeLessThan(
        Math.max(cx, cy) + 20,
      );
    }
  });
});

describe("markerStyle", () => {
  it("gives every transit arrival the transit ink and emphasis", () => {
    for (const category of ["station", "tram_stop", "ferry"] as const) {
      expect(markerStyle(category, theme)).toEqual({
        color: theme.transit,
        emphasis: true,
      });
    }
  });

  it("keeps station exits on their own ink", () => {
    expect(markerStyle("station_exit", theme)).toEqual({
      color: theme.exit,
      emphasis: true,
    });
  });

  it("leaves non-transit categories unemphasized", () => {
    for (const category of ["pharmacy", "supermarket", "park"] as const) {
      expect(markerStyle(category, theme)).toEqual({ color: theme.landmark });
    }
  });

  it("only ever uses the three marker inks the visual audit allows", () => {
    const allowed = new Set([theme.landmark, theme.transit, theme.exit]);

    for (const category of LANDMARK_CATEGORIES) {
      expect(allowed.has(markerStyle(category, theme).color)).toBe(true);
    }
  });
});
