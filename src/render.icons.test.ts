import { describe, it, expect } from "vitest";
import { renderSVG } from "./render.js";
import { baseRenderLayout as layout } from "../test/fixtures/render.js";

describe("renderSVG — icon system", () => {
  const CATEGORIES = [
    "station",
    "station_exit",
    "bus_stop",
    "cafe",
    "convenience",
    "restaurant",
    "school",
    "hospital",
    "park",
    "landmark",
    "building",
  ] as const;

  const renderCategory = (category: (typeof CATEGORIES)[number]) =>
    renderSVG({
      ...layout,
      landmarks: [
        { id: "x", name: "테스트", lat: 37.5006, lon: 127.0006, category, importance: 0.9, tags: {} },
      ],
    });

  const iconGroup = (svg: string, category: string): string | null =>
    svg.match(new RegExp(`<g data-landmark-icon="${category}"[^>]*>`))?.[0] ?? null;

  it("renders a pictogram for every landmark category", () => {
    for (const category of CATEGORIES) {
      expect(renderCategory(category)).toContain(`data-landmark-icon="${category}"`);
    }
  });

  it("draws every icon with the same stroked grammar and one shared stroke weight", () => {
    for (const category of CATEGORIES) {
      const group = iconGroup(renderCategory(category), category);
      expect(group).not.toBeNull();
      // Stroked, never filled, and a single shared stroke weight across the set —
      // this is what makes the icons read as one designed family.
      expect(group).toContain('fill="none"');
      expect(group).toContain('stroke-width="1.7"');
    }
  });

  it("renders the hospital marker as a stroked cross, not a bare filled block", () => {
    const svg = renderCategory("hospital");
    // Inside the standard circular landmark marker…
    expect(svg).toMatch(/<circle cx="[\d.]+" cy="[\d.]+" r="17"/);
    // …drawn with the shared stroked grammar (regression guard for the old fill="#…" cross).
    expect(svg).not.toMatch(/data-landmark-icon="hospital" fill="#/);
    expect(iconGroup(svg, "hospital")).toContain('fill="none"');
  });
});
