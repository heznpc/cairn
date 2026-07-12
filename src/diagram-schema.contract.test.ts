import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
  LANDMARK_CATEGORIES,
  RENDER_LAYOUTS,
  RENDER_TEMPLATES,
  RENDER_THEMES,
  ROAD_CLASSES,
} from "./domain-values.js";
import {
  diagramDocumentJsonSchema,
  diagramDocumentPatchJsonSchema,
  landmarkItemJsonSchema,
  roadItemJsonSchema,
} from "./diagram-json-schema.js";
import {
  DiagramDocumentPatchSchema,
  DiagramDocumentSchema,
} from "./diagram-schema.js";
import type { DiagramDocument } from "./types.js";

const ajv = new Ajv({ strict: false, allErrors: true });
const validateDocument = ajv.compile(diagramDocumentJsonSchema);
const validatePatch = ajv.compile(diagramDocumentPatchJsonSchema);

const validDocument: DiagramDocument = {
  version: 1,
  map: {
    center: { lat: 37.5, lon: 127, label: "목적지" },
    landmarks: [{
      id: "station-1",
      name: "역삼역",
      lat: 37.501,
      lon: 127.001,
      category: "station",
      importance: 0.95,
      tags: { railway: "station" },
    }],
    roads: [{
      id: "road-1",
      name: "테헤란로",
      class: "primary",
      points: [
        { lat: 37.499, lon: 126.999 },
        { lat: 37.501, lon: 127.001 },
      ],
    }],
    bbox: { north: 37.51, south: 37.49, east: 127.01, west: 126.99 },
  },
  canvas: { width: 600, height: 400 },
  render: {
    layout: "diagram",
    template: "standard",
    theme: "paper",
    focus: false,
    approachLandmarkId: "station-1",
  },
  overrides: {
    destination: { label: "학생회관" },
    landmarks: {
      "station-1": {
        hidden: false,
        label: "2번 출구",
        position: { x: 0.2, y: 0.3 },
        locked: true,
      },
    },
    roads: { "road-1": { hidden: false, label: "큰길" } },
  },
};

function changedDocument(change: (document: Record<string, any>) => void): unknown {
  const document = structuredClone(validDocument) as unknown as Record<string, any>;
  change(document);
  return document;
}

function expectSameAcceptance(
  name: string,
  jsonValid: boolean,
  runtimeValid: boolean,
): void {
  expect(
    jsonValid,
    `${name}: ${JSON.stringify(validateDocument.errors)}`,
  ).toBe(runtimeValid);
}

describe("DiagramDocument public/runtime schema contract", () => {
  it("shares non-empty identifier constraints", () => {
    expect(landmarkItemJsonSchema.properties.id.minLength).toBe(1);
    expect(roadItemJsonSchema.properties.id.minLength).toBe(1);
    expect(
      diagramDocumentJsonSchema.properties.render.properties.approachLandmarkId.minLength,
    ).toBe(1);
  });

  it("accepts every shared domain enum value", () => {
    for (const category of LANDMARK_CATEGORIES) {
      const document = changedDocument((candidate) => {
        candidate.map.landmarks[0].category = category;
      });
      expect(validateDocument(document), category).toBe(true);
      expect(DiagramDocumentSchema.safeParse(document).success, category).toBe(true);
    }
    for (const roadClass of ROAD_CLASSES) {
      const document = changedDocument((candidate) => {
        candidate.map.roads[0].class = roadClass;
      });
      expect(validateDocument(document), roadClass).toBe(true);
      expect(DiagramDocumentSchema.safeParse(document).success, roadClass).toBe(true);
    }
    for (const layout of RENDER_LAYOUTS) {
      const document = changedDocument((candidate) => {
        candidate.render.layout = layout;
      });
      expect(validateDocument(document), layout).toBe(true);
      expect(DiagramDocumentSchema.safeParse(document).success, layout).toBe(true);
    }
    for (const template of RENDER_TEMPLATES) {
      const document = changedDocument((candidate) => {
        candidate.render.template = template;
      });
      expect(validateDocument(document), template).toBe(true);
      expect(DiagramDocumentSchema.safeParse(document).success, template).toBe(true);
    }
    for (const theme of RENDER_THEMES) {
      const document = changedDocument((candidate) => {
        candidate.render.theme = theme;
      });
      expect(validateDocument(document), theme).toBe(true);
      expect(DiagramDocumentSchema.safeParse(document).success, theme).toBe(true);
    }
  });

  it("keeps representative document constraints equivalent", () => {
    const cases: Array<[string, unknown]> = [
      ["valid document", structuredClone(validDocument)],
      ["empty landmark id", changedDocument((candidate) => { candidate.map.landmarks[0].id = ""; })],
      ["empty road id", changedDocument((candidate) => { candidate.map.roads[0].id = ""; })],
      ["empty approach id", changedDocument((candidate) => { candidate.render.approachLandmarkId = ""; })],
      ["unknown category", changedDocument((candidate) => { candidate.map.landmarks[0].category = "shop"; })],
      ["unknown road class", changedDocument((candidate) => { candidate.map.roads[0].class = "motorway"; })],
      ["latitude outside range", changedDocument((candidate) => { candidate.map.center.lat = 91; })],
      ["longitude outside range", changedDocument((candidate) => { candidate.map.center.lon = -181; })],
      ["importance outside range", changedDocument((candidate) => { candidate.map.landmarks[0].importance = 1.1; })],
      ["canvas below minimum", changedDocument((candidate) => { candidate.canvas.width = 99; })],
      ["non-integer canvas", changedDocument((candidate) => { candidate.canvas.height = 400.5; })],
      ["position outside range", changedDocument((candidate) => { candidate.overrides.landmarks["station-1"].position.x = -0.1; })],
      ["missing required field", changedDocument((candidate) => { delete candidate.map.bbox; })],
      ["unknown strict field", changedDocument((candidate) => { candidate.render.language = "ko"; })],
    ];

    for (const [name, value] of cases) {
      const jsonValid = validateDocument(value);
      const runtimeValid = DiagramDocumentSchema.safeParse(value).success;
      expectSameAcceptance(name, jsonValid, runtimeValid);
    }
  });

  it("keeps representative patch constraints equivalent", () => {
    const cases: Array<[string, unknown]> = [
      ["empty patch", {}],
      ["full patch", {
        canvas: { width: 800, height: 500 },
        render: {
          layout: "geographic",
          template: "badge",
          theme: "mono",
          focus: true,
          approachLandmarkId: "station-1",
        },
        destinationLabel: null,
        landmarks: {
          "station-1": { hidden: null, label: "출발", position: null, locked: false },
        },
        roads: { "road-1": { hidden: true, label: null } },
      }],
      ["clear approach", { render: { approachLandmarkId: null } }],
      ["empty approach id", { render: { approachLandmarkId: "" } }],
      ["canvas below minimum", { canvas: { width: 99 } }],
      ["position outside range", { landmarks: { "station-1": { position: { x: 0.5, y: 1.1 } } } }],
      ["unknown strict field", { render: { language: "ko" } }],
    ];

    for (const [name, value] of cases) {
      const jsonValid = validatePatch(value);
      const runtimeValid = DiagramDocumentPatchSchema.safeParse(value).success;
      expect(
        jsonValid,
        `${name}: ${JSON.stringify(validatePatch.errors)}`,
      ).toBe(runtimeValid);
    }
  });
});
