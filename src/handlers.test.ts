import { describe, it, expect, vi, beforeEach } from "vitest";
import Ajv from "ajv";

// Mocks must be declared BEFORE importing the module under test.
vi.mock("./geocode.js", () => ({
  geocode: vi.fn(),
}));
vi.mock("./landmarks.js", () => ({
  findLandmarks: vi.fn(),
}));
vi.mock("./roads.js", () => ({
  findRoads: vi.fn(),
}));
vi.mock("./pipeline.js", () => ({
  generateMap: vi.fn(),
}));

import { tools, dispatchTool } from "./handlers.js";
import { geocode } from "./geocode.js";
import { findLandmarks } from "./landmarks.js";
import { findRoads } from "./roads.js";
import { generateMap } from "./pipeline.js";
import { createDiagramDocument } from "./diagram-document.js";
import type { MapLayout } from "./types.js";

const ajv = new Ajv({ strict: false, allErrors: true });

function validatorFor(toolName: string) {
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) throw new Error(`tool not found: ${toolName}`);
  if (!tool.outputSchema) throw new Error(`no outputSchema: ${toolName}`);
  return ajv.compile(tool.outputSchema);
}

function toolFor(toolName: string) {
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) throw new Error(`tool not found: ${toolName}`);
  return tool;
}

function inputValidatorFor(toolName: string) {
  return ajv.compile(toolFor(toolName).inputSchema);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("tool registry", () => {
  it("exposes exactly the five documented tools", () => {
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["find_landmarks", "find_roads", "generate_map", "geocode", "render_document"].sort(),
    );
  });

  it("declares outputSchema and safe annotations on every tool", () => {
    for (const t of tools) {
      expect(t.outputSchema, `outputSchema missing on ${t.name}`).toBeTruthy();
      expect(t.annotations, `annotations missing on ${t.name}`).toMatchObject({
        readOnlyHint: true,
        openWorldHint: t.name === "render_document" ? false : true,
      });
    }
  });

  it("declares strict object input schemas on every tool", () => {
    for (const t of tools) {
      expect(t.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
    }
  });

  it("declares maximums for expensive numeric inputs", () => {
    const generateMapProps = toolFor("generate_map").inputSchema.properties;
    expect(generateMapProps.radiusMeters).toMatchObject({ maximum: 5000 });
    expect(generateMapProps.width).toMatchObject({ maximum: 4000 });
    expect(generateMapProps.height).toMatchObject({ maximum: 4000 });
    expect(generateMapProps.layout).toMatchObject({
      enum: ["diagram", "geographic"],
    });
    expect(generateMapProps.preset).toMatchObject({
      enum: ["standard", "compact", "minimal", "schematic", "badge"],
    });
    expect(generateMapProps.template).toMatchObject({
      enum: ["standard", "compact", "minimal", "schematic", "badge"],
    });
    expect(generateMapProps.theme).toMatchObject({
      enum: ["paper", "mono", "civic", "invitation"],
    });

    expect(toolFor("find_landmarks").inputSchema.properties.radiusMeters)
      .toMatchObject({ maximum: 5000 });
    expect(toolFor("find_roads").inputSchema.properties.radiusMeters)
      .toMatchObject({ maximum: 5000 });
  });

  it("publishes the same render_document position bounds enforced at runtime", () => {
    const layout: MapLayout = {
      center: { lat: 37.5, lon: 127.0, label: "여기" },
      landmarks: [],
      roads: [],
      bbox: { north: 37.51, south: 37.49, east: 127.01, west: 126.99 },
    };
    const validate = inputValidatorFor("render_document");
    const ok = validate({
      document: createDiagramDocument(layout),
      patch: { landmarks: { ghost: { position: { x: 1.1, y: 0.5 } } } },
    });

    expect(ok).toBe(false);
    expect(validate.errors?.some((error) => error.keyword === "maximum")).toBe(true);
  });
});

describe("dispatchTool — outputSchema ↔ structuredContent contract", () => {
  it("generate_map structuredContent satisfies the declared outputSchema", async () => {
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
        ],
        roads: [
          {
            id: "r1",
            name: "테헤란로",
            class: "primary",
            points: [
              { lat: 37.5, lon: 127.0 },
              { lat: 37.5005, lon: 127.0005 },
            ],
          },
        ],
        bbox: { north: 37.51, south: 37.49, east: 127.01, west: 126.99 },
    };
    vi.mocked(generateMap).mockResolvedValue({
      svg: "<svg></svg>",
      layout,
      document: createDiagramDocument(layout),
    });

    const result = await dispatchTool("generate_map", { address: "test" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();

    const validate = validatorFor("generate_map");
    const ok = validate(result.structuredContent);
    expect(ok, `schema errors: ${JSON.stringify(validate.errors)}`).toBe(true);
  });

  it("generate_map content[1] summary is consistent with structuredContent.layout", async () => {
    // Pre-2025-06-18 MCP clients read content[1] (the prose summary) instead
    // of structuredContent. If a refactor lets the two drift — e.g. the text
    // slices landmarks for brevity while structured keeps them all — those
    // clients silently get wrong counts. Pin the contract.
    const layout = {
      center: { lat: 37.5, lon: 127.0, label: "여기" },
      landmarks: [
        { id: "1", name: "역삼역", lat: 37.5005, lon: 127.0005, category: "station" as const, importance: 1.0, tags: {} },
        { id: "2", name: "스타벅스", lat: 37.4998, lon: 127.0008, category: "cafe" as const, importance: 0.5, tags: {} },
        { id: "3", name: "CU", lat: 37.4999, lon: 127.0002, category: "convenience" as const, importance: 0.5, tags: {} },
      ],
      roads: [],
      bbox: { north: 37.51, south: 37.49, east: 127.01, west: 126.99 },
    };
    vi.mocked(generateMap).mockResolvedValue({
      svg: "<svg></svg>",
      layout,
      document: createDiagramDocument(layout),
    });

    const result = await dispatchTool("generate_map", { address: "x" });
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(2);

    const summary = result.content[1].text;
    expect(summary).toContain(`${layout.landmarks.length} landmarks`);
    expect(summary).toContain(layout.center.lat.toFixed(5));
    expect(summary).toContain(layout.center.lon.toFixed(5));
  });

  it("render_document applies a patch and satisfies its output schema", async () => {
    const layout: MapLayout = {
      center: { lat: 37.5, lon: 127.0, label: "여기" },
      landmarks: [{
        id: "gate",
        name: "정문",
        lat: 37.5005,
        lon: 127.0005,
        category: "landmark",
        importance: 1,
        tags: {},
      }],
      roads: [],
      bbox: { north: 37.51, south: 37.49, east: 127.01, west: 126.99 },
    };
    const result = await dispatchTool("render_document", {
      document: createDiagramDocument(layout),
      patch: {
        destinationLabel: "학생회관",
        render: { theme: "mono", approachLandmarkId: "gate" },
        landmarks: { gate: { label: "후문", position: { x: 0.2, y: 0.3 } } },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.document).toMatchObject({
      render: { theme: "mono", approachLandmarkId: "gate" },
      overrides: {
        destination: { label: "학생회관" },
        landmarks: { gate: { label: "후문", position: { x: 0.2, y: 0.3 } } },
      },
    });
    const validate = validatorFor("render_document");
    expect(validate(result.structuredContent), JSON.stringify(validate.errors)).toBe(true);
  });

  it("render_document rejects invalid positions and unknown IDs", async () => {
    const layout: MapLayout = {
      center: { lat: 37.5, lon: 127.0, label: "여기" },
      landmarks: [],
      roads: [],
      bbox: { north: 37.51, south: 37.49, east: 127.01, west: 126.99 },
    };
    const invalidPosition = await dispatchTool("render_document", {
      document: createDiagramDocument(layout),
      patch: { landmarks: { ghost: { position: { x: 2, y: 0.5 } } } },
    });
    const unknownId = await dispatchTool("render_document", {
      document: createDiagramDocument(layout),
      patch: { landmarks: { ghost: { hidden: true } } },
    });

    expect(invalidPosition.isError).toBe(true);
    expect(invalidPosition.content[0].text).toContain("less than or equal to 1");
    expect(unknownId.isError).toBe(true);
    expect(unknownId.content[0].text).toContain("Unknown landmark id: ghost");
  });

  it("geocode passes through Nominatim raw payload when present", async () => {
    // Regression: an earlier version destructured only {lat, lon, displayName},
    // dropping `raw` even though geocode.ts still requested addressdetails=1.
    // host LLMs lose useful admin breakdown without this.
    const raw = {
      address: { city: "Seoul", country_code: "kr", road: "테헤란로" },
    };
    vi.mocked(geocode).mockResolvedValue({
      lat: 37.5,
      lon: 127.0,
      displayName: "Seoul",
      raw,
    });

    const result = await dispatchTool("geocode", { address: "Seoul" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ raw });
    const validate = validatorFor("geocode");
    expect(validate(result.structuredContent), JSON.stringify(validate.errors)).toBe(true);
  });

  it("geocode structuredContent satisfies the declared outputSchema", async () => {
    vi.mocked(geocode).mockResolvedValue({
      lat: 37.5,
      lon: 127.0,
      displayName: "Seoul",
    });

    const result = await dispatchTool("geocode", { address: "Seoul" });

    expect(result.isError).toBeFalsy();
    const validate = validatorFor("geocode");
    expect(validate(result.structuredContent), JSON.stringify(validate.errors)).toBe(true);
  });

  it("geocode outputSchema rejects non-finite or out-of-range coordinates", () => {
    const validate = validatorFor("geocode");

    expect(validate({ lat: NaN, lon: 127.0, displayName: "bad" })).toBe(false);
    expect(validate({ lat: 91, lon: 127.0, displayName: "bad" })).toBe(false);
    expect(validate({ lat: 37.5, lon: Infinity, displayName: "bad" })).toBe(false);
  });

  it("find_landmarks structuredContent satisfies the declared outputSchema", async () => {
    vi.mocked(findLandmarks).mockResolvedValue([
      {
        id: "42",
        name: "스타벅스",
        lat: 37.5,
        lon: 127.0,
        category: "cafe",
        importance: 0.5,
        tags: {},
      },
    ]);

    const result = await dispatchTool("find_landmarks", { lat: 37.5, lon: 127.0 });

    expect(result.isError).toBeFalsy();
    const validate = validatorFor("find_landmarks");
    expect(validate(result.structuredContent), JSON.stringify(validate.errors)).toBe(true);
  });

  it("find_roads structuredContent satisfies the declared outputSchema", async () => {
    vi.mocked(findRoads).mockResolvedValue([
      {
        id: "r1",
        name: "테헤란로",
        class: "primary",
        points: [
          { lat: 37.5, lon: 127.0 },
          { lat: 37.5005, lon: 127.0005 },
        ],
      },
      {
        id: "r2",
        // unnamed road — `name` omitted entirely
        class: "residential",
        points: [
          { lat: 37.4998, lon: 126.9998 },
          { lat: 37.4999, lon: 126.9999 },
        ],
      },
    ]);

    const result = await dispatchTool("find_roads", { lat: 37.5, lon: 127.0 });

    expect(result.isError).toBeFalsy();
    const validate = validatorFor("find_roads");
    expect(validate(result.structuredContent), JSON.stringify(validate.errors)).toBe(true);
  });

  it("find_roads outputSchema rejects a class not in RoadClass", () => {
    const validate = validatorFor("find_roads");
    const ok = validate({
      roads: [
        {
          id: "x",
          class: "HIGHWAY_OF_THE_GODS",
          points: [
            { lat: 37.5, lon: 127.0 },
            { lat: 37.5, lon: 127.1 },
          ],
        },
      ],
    });
    expect(ok).toBe(false);
    expect(validate.errors?.some((e) => e.keyword === "enum")).toBe(true);
  });

  it("outputSchema enum accepts every LandmarkCategory value", async () => {
    // Schema-side coverage only: this proves the enum in landmarkItemSchema
    // covers every LandmarkCategory string. The categorize()-side coverage
    // (every branch returns a LandmarkCategory) is enforced statically by
    // the return-type annotation on categorize() plus the AssertNever
    // check in handlers.ts. The two together close the loop.
    vi.mocked(findLandmarks).mockResolvedValue(
      (["station","station_exit","bus_stop","cafe","convenience","restaurant","school","hospital","park","landmark","building"] as const).map((c, i) => ({
        id: String(i),
        name: c,
        lat: 37.5,
        lon: 127.0,
        category: c,
        importance: 0.5,
        tags: {},
      })),
    );

    const result = await dispatchTool("find_landmarks", { lat: 37.5, lon: 127.0 });
    const validate = validatorFor("find_landmarks");
    expect(validate(result.structuredContent), JSON.stringify(validate.errors)).toBe(true);
  });

  it("outputSchema enum rejects a category not in LandmarkCategory", () => {
    // Negative case: if a future refactor silently drops the `enum:` constraint,
    // Ajv would start accepting anything-string and this test fails.
    const validate = validatorFor("find_landmarks");
    const ok = validate({
      landmarks: [
        {
          id: "0",
          name: "fake",
          lat: 37.5,
          lon: 127.0,
          category: "NOT_A_REAL_CATEGORY",
          importance: 0.5,
          tags: {},
        },
      ],
    });
    expect(ok).toBe(false);
    expect(validate.errors?.some((e) => e.keyword === "enum")).toBe(true);
  });

  it("landmark outputSchema requires the OSM tags bag emitted by runtime", () => {
    const validate = validatorFor("find_landmarks");
    const ok = validate({
      landmarks: [
        {
          id: "0",
          name: "역삼역",
          lat: 37.5,
          lon: 127.0,
          category: "station",
          importance: 1.0,
        },
      ],
    });

    expect(ok).toBe(false);
    expect(validate.errors?.some((e) => e.keyword === "required" && e.params.missingProperty === "tags")).toBe(true);
  });

  it("outputSchema rejects undeclared top-level properties", () => {
    // additionalProperties:false guard. If schema drift in MapLayout adds a
    // new field that the schema doesn't declare, Ajv must reject it.
    const validate = validatorFor("geocode");
    const ok = validate({
      lat: 37.5,
      lon: 127.0,
      displayName: "Seoul",
      bogus: "should-be-rejected",
    });
    expect(ok).toBe(false);
    expect(validate.errors?.some((e) => e.keyword === "additionalProperties")).toBe(true);
  });
});

describe("dispatchTool — error paths", () => {
  it("unknown tool name returns isError without throwing", async () => {
    const result = await dispatchTool("nonexistent_tool", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Unknown tool/);
  });

  it("invalid zod input returns isError without throwing", async () => {
    // generate_map requires `address: string`; passing a number must fail
    // validation, return isError, and surface a useful message.
    const result = await dispatchTool("generate_map", { address: 42 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/cairn error/);
    // pipeline must NOT have been called when input validation rejects.
    expect(generateMap).not.toHaveBeenCalled();
  });

  it("rejects oversized generate_map dimensions before calling the pipeline", async () => {
    const result = await dispatchTool("generate_map", {
      address: "Seoul",
      width: 4001,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/less than or equal to 4000/);
    expect(generateMap).not.toHaveBeenCalled();
  });

  it("rejects unknown generate_map layout modes before calling the pipeline", async () => {
    const result = await dispatchTool("generate_map", {
      address: "Seoul",
      layout: "satellite",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/layout/);
    expect(generateMap).not.toHaveBeenCalled();
  });

  it("rejects unknown generate_map presets before calling the pipeline", async () => {
    const result = await dispatchTool("generate_map", {
      address: "Seoul",
      preset: "luxury",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/preset/);
    expect(generateMap).not.toHaveBeenCalled();
  });

  it("rejects unknown generate_map properties before calling the pipeline", async () => {
    const result = await dispatchTool("generate_map", {
      address: "Seoul",
      language: "ko",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/language/);
    expect(generateMap).not.toHaveBeenCalled();
  });

  it("rejects oversized Overpass radii before calling network tools", async () => {
    const landmarks = await dispatchTool("find_landmarks", {
      lat: 37.5,
      lon: 127.0,
      radiusMeters: 5001,
    });
    const roads = await dispatchTool("find_roads", {
      lat: 37.5,
      lon: 127.0,
      radiusMeters: 5001,
    });

    expect(landmarks.isError).toBe(true);
    expect(roads.isError).toBe(true);
    expect(findLandmarks).not.toHaveBeenCalled();
    expect(findRoads).not.toHaveBeenCalled();
  });

  it("rejects invalid coordinates before calling network tools", async () => {
    const result = await dispatchTool("find_landmarks", {
      lat: 91,
      lon: 127.0,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/less than or equal to 90/);
    expect(findLandmarks).not.toHaveBeenCalled();
  });

  it("downstream throw becomes isError, not an unhandled rejection", async () => {
    vi.mocked(geocode).mockRejectedValue(new Error("Nominatim down"));
    const result = await dispatchTool("geocode", { address: "Seoul" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Nominatim down");
  });
});
