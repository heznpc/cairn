import { describe, it, expect } from "vitest";
import { renderSVG } from "./render.js";
import type { MapLayout } from "./types.js";

const layout: MapLayout = {
  center: { lat: 37.5, lon: 127.0, label: "여기" },
  landmarks: [
    {
      id: "1",
      name: "역삼역",
      lat: 37.5005,
      lon: 127.0005,
      category: "station",
      importance: 1.0,
      tags: {},
    },
    {
      id: "2",
      name: "스타벅스",
      lat: 37.4998,
      lon: 127.0008,
      category: "cafe",
      importance: 0.5,
      tags: {},
    },
  ],
  bbox: {
    north: 37.5013,
    south: 37.4988,
    east: 127.0018,
    west: 126.999,
  },
};

describe("renderSVG", () => {
  it("produces a well-formed SVG document", () => {
    const svg = renderSVG(layout);
    expect(svg).toMatch(/^<svg[^>]+>/);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it("includes the center label and landmark names", () => {
    const svg = renderSVG(layout);
    expect(svg).toContain("여기");
    expect(svg).toContain("역삼역");
    expect(svg).toContain("스타벅스");
  });

  it("renders one center marker plus one circle per landmark", () => {
    const svg = renderSVG(layout);
    const circles = svg.match(/<circle\b/g) ?? [];
    expect(circles).toHaveLength(layout.landmarks.length + 1);
  });

  it("escapes XML special characters in labels", () => {
    const escaped = renderSVG({
      ...layout,
      center: { ...layout.center, label: `A&B<C>"D'E` },
      landmarks: [],
    });
    expect(escaped).toContain("A&amp;B&lt;C&gt;&quot;D&apos;E");
    expect(escaped).not.toMatch(/A&B<C>/);
  });

  it("respects width/height options", () => {
    const svg = renderSVG(layout, { width: 800, height: 500 });
    expect(svg).toContain('viewBox="0 0 800 500"');
  });

  it("handles empty landmarks gracefully", () => {
    const svg = renderSVG({ ...layout, landmarks: [] });
    expect(svg).toContain("<svg");
    expect(svg).toContain("여기");
    // Only the center circle should be present
    expect((svg.match(/<circle\b/g) ?? [])).toHaveLength(1);
  });
});
