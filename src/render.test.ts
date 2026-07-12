import { describe, it, expect } from "vitest";
import { renderSVG } from "./render.js";
import type { MapLayout } from "./types.js";
import { baseRenderLayout as layout } from "../test/fixtures/render.js";
import { roadCorePathCount } from "../test/helpers/svg.js";

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

  it("uses SVG pictograms for landmark markers", () => {
    const svg = renderSVG(layout);
    expect(svg).toContain('data-landmark-icon="station"');
    expect(svg).toContain('data-landmark-icon="cafe"');
    expect(svg).not.toContain(">M<");
  });

  it("includes visible OpenStreetMap attribution", () => {
    const svg = renderSVG(layout);
    expect(svg).toContain('data-attribution="osm"');
    expect(svg).toContain("© OpenStreetMap contributors");
  });

  it("renders one center marker plus one circle per landmark", () => {
    const svg = renderSVG(layout);
    const circles = svg.match(/<circle\b/g) ?? [];
    expect(circles).toHaveLength(layout.landmarks.length + 1);
  });

  it("uses print-style labels instead of UI connector lines and label pills", () => {
    const svg = renderSVG(layout);
    expect(svg).not.toContain('stroke-dasharray="4,5"');
    expect(svg).not.toContain('fill="#fffdf8" stroke="#e3ddd0"');
    expect(svg).toContain('stroke="#fffef9" stroke-width="4"');
  });

  it("uses the standard destination label by default", () => {
    const svg = renderSVG(layout);
    expect(svg).toContain('data-destination-label="true"');
    expect(svg).toContain('fill="#d63b31"');
    expect(svg).toContain('fill="#fffef9">여기</text>');
  });

  it("supports a minimal preset with an outlined destination label", () => {
    const svg = renderSVG(layout, { preset: "minimal" });
    expect(svg).toContain('data-route-strip="true"');
    expect(svg).toContain('data-destination-label="true"');
    expect(svg).toContain('fill="#fffef9" stroke="#d63b31"');
    expect(svg).not.toContain('data-destination-label="true" fill="#d63b31"');
  });

  it("supports a compact preset without changing the colour vocabulary", () => {
    const svg = renderSVG(layout, { preset: "compact" });
    expect(svg).toContain('data-preset="compact"');
    expect(svg).toContain('fill="#d63b31"');
    expect(svg).toContain('data-landmark-icon="station"');
    expect(svg).not.toContain('data-landmark-icon="cafe"');
    expect(svg).not.toContain("#25221d\" stroke");
  });

  it("varies visual vocabulary independently from the template", () => {
    const paper = renderSVG(layout, { template: "standard", theme: "paper" });
    const civic = renderSVG(layout, { template: "standard", theme: "civic" });

    expect(civic).toContain('data-template="standard"');
    expect(civic).toContain('data-theme="civic"');
    expect(civic).toContain('fill="#f8fbfc"');
    expect(civic).toContain('fill="#d94f3d"');
    expect(civic).not.toBe(paper);
  });

  it("prefers template over the legacy preset alias", () => {
    const svg = renderSVG(layout, { template: "badge", preset: "minimal" });
    expect(svg).toContain('data-template="badge"');
    expect(svg).toContain('data-badge-map="true"');
    expect(svg).not.toContain('data-route-strip="true"');
  });

  it("minimal preset keeps only transit-like landmarks", () => {
    const svg = renderSVG(layout, { preset: "minimal" });
    expect(svg).toContain('data-landmark-icon="station"');
    expect(svg).not.toContain('data-landmark-icon="cafe"');
    expect(svg).not.toContain("스타벅스");
  });

  it("keeps an explicitly selected approach landmark across restrictive templates", () => {
    const svg = renderSVG(layout, {
      template: "minimal",
      approachLandmarkId: "2",
    });

    expect(svg).toContain('data-landmark-icon="cafe"');
    expect(svg).toContain("스타벅스");
    expect(svg).not.toContain('data-landmark-icon="station"');
  });

  it("makes non-standard presets structurally distinct from standard", () => {
    const roadLayout = {
      ...layout,
      roads: [
        {
          id: "main",
          name: "큰길",
          class: "primary",
          points: [
            { lat: 37.5004, lon: 126.999 },
            { lat: 37.5004, lon: 127.001 },
          ],
        },
        {
          id: "side",
          name: "보조길",
          class: "secondary",
          points: [
            { lat: 37.501, lon: 127.0006 },
            { lat: 37.499, lon: 127.0002 },
          ],
        },
        {
          id: "alley",
          name: "이면길",
          class: "tertiary",
          points: [
            { lat: 37.4998, lon: 126.9995 },
            { lat: 37.4997, lon: 127.0013 },
          ],
        },
      ],
    } satisfies MapLayout;

    const standard = renderSVG(roadLayout);
    const compact = renderSVG(roadLayout, { preset: "compact" });
    const minimal = renderSVG(roadLayout, { preset: "minimal" });
    const schematic = renderSVG(roadLayout, { preset: "schematic" });
    const badge = renderSVG(roadLayout, { preset: "badge" });

    expect(roadCorePathCount(standard)).toBeGreaterThan(2);
    expect(roadCorePathCount(compact)).toBeLessThanOrEqual(3);
    expect(compact).toContain(">큰길</text>");
    expect(roadCorePathCount(minimal)).toBe(0);
    expect(minimal).toContain('data-strip-route="core"');
    expect(minimal).toContain('data-strip-road="anchor"');
    expect(minimal).not.toContain('stroke="#e5ded2"');
    expect(schematic).toContain('data-road-geometry="orthogonal"');
    expect(schematic).toContain(">큰길</text>");
    expect(badge).toContain('data-badge-map="true"');
    expect(badge).toContain('data-badge-route="core"');
    expect(badge).not.toContain('data-road-layer="core"');
  });

  it("draws a final approach arrow in diagram mode", () => {
    const svg = renderSVG(layout);
    expect(svg).toContain('data-approach-arrow="core"');
    expect(svg).toContain('marker-end="url(#cairn-approach-arrowhead)"');
  });

  it("omits the approach arrow in geographic mode", () => {
    const svg = renderSVG(layout, { layout: "geographic" });
    expect(svg).not.toContain('data-approach-arrow="core"');
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

  it("clamps direct-call canvas dimensions to the supported range", () => {
    const svg = renderSVG(layout, { width: 1_000_000, height: 1_000_000 });
    expect(svg).toContain('viewBox="0 0 4000 4000"');
  });

  it("uses fallback dimensions for non-finite direct-call dimensions", () => {
    const svg = renderSVG(layout, { width: Infinity, height: NaN });
    expect(svg).toContain('viewBox="0 0 600 400"');
  });

  it("handles empty landmarks gracefully", () => {
    const svg = renderSVG({ ...layout, landmarks: [] });
    expect(svg).toContain("<svg");
    expect(svg).toContain("여기");
    // Only the center circle should be present
    expect((svg.match(/<circle\b/g) ?? [])).toHaveLength(1);
  });

  it("handles empty landmarks across every preset", () => {
    const presets = ["standard", "compact", "minimal", "schematic", "badge"] as const;
    for (const preset of presets) {
      const svg = renderSVG({ ...layout, landmarks: [], roads: [] }, { preset });
      expect(svg).toContain("<svg");
      expect(svg).toContain('data-attribution="osm"');
      expect(svg).not.toMatch(/NaN/);
    }
  });
});
