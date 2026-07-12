import { describe, expect, it } from "vitest";
import {
  applyDiagramDocumentPatch,
  applyDiagramOverrides,
  createDiagramDocument,
  renderDiagramDocument,
} from "./diagram-document.js";
import {
  parseDiagramDocument,
  parseDiagramDocumentPatch,
} from "./diagram-schema.js";
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

  it("applies a conversational patch immutably and supports clearing overrides", () => {
    const landmark = layout.landmarks[0];
    const document = createDiagramDocument(layout, {
      overrides: {
        destination: { label: "기존 목적지" },
        landmarks: {
          [landmark.id]: { label: "기존 이름", position: { x: 0.2, y: 0.3 } },
        },
      },
    });

    const updated = applyDiagramDocumentPatch(document, {
      canvas: { width: 720 },
      render: { template: "schematic", theme: "mono" },
      destinationLabel: "학생회관",
      landmarks: {
        [landmark.id]: { label: "정문", position: null, hidden: false },
      },
    });

    expect(updated).toMatchObject({
      canvas: { width: 720, height: 400 },
      render: { template: "schematic", theme: "mono" },
      overrides: {
        destination: { label: "학생회관" },
        landmarks: { [landmark.id]: { label: "정문", hidden: false } },
      },
    });
    expect(updated.overrides.landmarks?.[landmark.id].position).toBeUndefined();
    expect(document.overrides.destination?.label).toBe("기존 목적지");
    expect(document.overrides.landmarks?.[landmark.id].position).toEqual({ x: 0.2, y: 0.3 });
  });

  it("sets and clears an explicit approach landmark", () => {
    const document = createDiagramDocument(layout);
    const selected = applyDiagramDocumentPatch(document, {
      render: { approachLandmarkId: layout.landmarks[1].id },
    });
    const cleared = applyDiagramDocumentPatch(selected, {
      render: { approachLandmarkId: null },
    });

    expect(selected.render.approachLandmarkId).toBe(layout.landmarks[1].id);
    expect(cleared.render.approachLandmarkId).toBeUndefined();
    expect(() => applyDiagramDocumentPatch(document, {
      render: { approachLandmarkId: "not-a-real-id" },
    })).toThrow("Unknown approach landmark id: not-a-real-id");
    expect(() => applyDiagramDocumentPatch(document, {
      render: { approachLandmarkId: layout.landmarks[0].id },
      landmarks: { [layout.landmarks[0].id]: { hidden: true } },
    })).toThrow(`Approach landmark is hidden: ${layout.landmarks[0].id}`);
  });

  it("rejects hallucinated IDs instead of silently ignoring them", () => {
    const document = createDiagramDocument(layout);
    expect(() => applyDiagramDocumentPatch(document, {
      landmarks: { "not-a-real-id": { hidden: true } },
    })).toThrow("Unknown landmark id: not-a-real-id");
  });

  it("validates documents and patches at the JSON boundary", () => {
    const document = createDiagramDocument(layout);
    expect(parseDiagramDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect(() => parseDiagramDocumentPatch({
      landmarks: {
        [layout.landmarks[0].id]: { position: { x: 1.2, y: 0.5 } },
      },
    })).toThrow();
    expect(() => parseDiagramDocument({ ...document, version: 2 })).toThrow();
  });
});
