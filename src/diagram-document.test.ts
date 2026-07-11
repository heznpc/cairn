import { describe, expect, it } from "vitest";
import {
  applyDiagramOverrides,
  createDiagramDocument,
  renderDiagramDocument,
} from "./diagram-document.js";
import { baseRenderLayout as layout } from "../test/fixtures/render.js";

describe("DiagramDocument", () => {
  it("creates a versioned JSON-roundtrippable document with stable defaults", () => {
    const document = createDiagramDocument(layout);
    const roundTrip = JSON.parse(JSON.stringify(document));

    expect(roundTrip).toMatchObject({
      version: 1,
      canvas: { width: 600, height: 400 },
      render: {
        layout: "diagram",
        template: "standard",
        theme: "paper",
        focus: false,
      },
    });
    expect(roundTrip.map).toEqual(layout);
  });

  it("applies labels and visibility without mutating the source map", () => {
    const firstLandmark = layout.landmarks[0];
    const secondLandmark = layout.landmarks[1];
    const firstRoad = layout.roads[0];
    const edited = applyDiagramOverrides(layout, {
      destination: { label: "학생회관" },
      landmarks: {
        [firstLandmark.id]: { label: "1번 출구" },
        [secondLandmark.id]: { hidden: true },
      },
      roads: firstRoad ? { [firstRoad.id]: { label: "중앙로" } } : undefined,
    });

    expect(edited.center.label).toBe("학생회관");
    expect(edited.landmarks[0].name).toBe("1번 출구");
    expect(edited.landmarks).toHaveLength(layout.landmarks.length - 1);
    if (firstRoad) expect(edited.roads[0].name).toBe("중앙로");
    expect(layout.center.label).toBe("여기");
    expect(layout.landmarks[0].name).toBe(firstLandmark.name);
  });

  it("renders template, theme, labels, and manual normalized positions", () => {
    const landmark = layout.landmarks[0];
    const document = createDiagramDocument(layout, {
      width: 800,
      height: 500,
      template: "compact",
      theme: "civic",
      overrides: {
        destination: { label: "도착" },
        landmarks: {
          [landmark.id]: {
            label: "정문",
            position: { x: 0.25, y: 0.30 },
            locked: true,
          },
        },
      },
    });

    const svg = renderDiagramDocument(document);
    expect(svg).toContain('viewBox="0 0 800 500"');
    expect(svg).toContain('data-template="compact"');
    expect(svg).toContain('data-theme="civic"');
    expect(svg).toContain('cx="200.0" cy="150.0"');
    expect(svg).toContain("도착");
    expect(svg).toContain("정문");
  });
});
