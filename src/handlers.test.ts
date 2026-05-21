import { describe, it, expect, vi, beforeEach } from "vitest";
import Ajv from "ajv";

// Mocks must be declared BEFORE importing the module under test.
vi.mock("./geocode.js", () => ({
  geocode: vi.fn(),
}));
vi.mock("./landmarks.js", () => ({
  findLandmarks: vi.fn(),
}));
vi.mock("./pipeline.js", () => ({
  generateMap: vi.fn(),
}));

import { tools, dispatchTool } from "./handlers.js";
import { geocode } from "./geocode.js";
import { findLandmarks } from "./landmarks.js";
import { generateMap } from "./pipeline.js";

const ajv = new Ajv({ strict: false, allErrors: true });

function validatorFor(toolName: string) {
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) throw new Error(`tool not found: ${toolName}`);
  if (!tool.outputSchema) throw new Error(`no outputSchema: ${toolName}`);
  return ajv.compile(tool.outputSchema);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("tool registry", () => {
  it("exposes exactly the three documented tools", () => {
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["find_landmarks", "generate_map", "geocode"].sort(),
    );
  });

  it("declares outputSchema and safe annotations on every tool", () => {
    for (const t of tools) {
      expect(t.outputSchema, `outputSchema missing on ${t.name}`).toBeTruthy();
      expect(t.annotations, `annotations missing on ${t.name}`).toMatchObject({
        readOnlyHint: true,
        openWorldHint: true,
      });
    }
  });
});

describe("dispatchTool — outputSchema ↔ structuredContent contract", () => {
  it("generate_map structuredContent satisfies the declared outputSchema", async () => {
    vi.mocked(generateMap).mockResolvedValue({
      svg: "<svg></svg>",
      layout: {
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
        bbox: { north: 37.51, south: 37.49, east: 127.01, west: 126.99 },
      },
    });

    const result = await dispatchTool("generate_map", { address: "test" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();

    const validate = validatorFor("generate_map");
    const ok = validate(result.structuredContent);
    expect(ok, `schema errors: ${JSON.stringify(validate.errors)}`).toBe(true);
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

  it("find_landmarks accepts every category that categorize() can produce", async () => {
    // Cross-file invariant: LandmarkCategory ↔ outputSchema enum. If a new
    // category is added to types.ts without updating handlers.ts, this test
    // and the compile-time exhaustiveness check should both fail.
    vi.mocked(findLandmarks).mockResolvedValue(
      (["station","bus_stop","cafe","convenience","restaurant","school","hospital","park","landmark","building"] as const).map((c, i) => ({
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

  it("downstream throw becomes isError, not an unhandled rejection", async () => {
    vi.mocked(geocode).mockRejectedValue(new Error("Nominatim down"));
    const result = await dispatchTool("geocode", { address: "Seoul" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Nominatim down");
  });
});
