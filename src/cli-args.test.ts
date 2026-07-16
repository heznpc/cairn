import { describe, expect, it } from "vitest";
import { parseCliRequest } from "./cli-args.js";

describe("parseCliRequest", () => {
  it("returns help with exit 1 when no args are provided", () => {
    expect(parseCliRequest([])).toEqual({ kind: "help", exitCode: 1 });
  });

  it("parses a generate request with render options", () => {
    expect(
      parseCliRequest([
        "generate",
        "서울 강남구 테헤란로 152",
        "--label",
        "사무실",
        "--radius",
        "800",
        "--limit",
        "3",
        "--width",
        "700",
        "--height",
        "500",
        "--layout",
        "geographic",
        "--template",
        "compact",
        "--theme",
        "civic",
        "--no-roads",
        "--focus",
        "--output",
        "out.svg",
        "--save-document",
        "out.json",
      ]),
    ).toEqual({
      kind: "generate",
      address: "서울 강남구 테헤란로 152",
      output: "out.svg",
      documentOutput: "out.json",
      options: {
        label: "사무실",
        radiusMeters: 800,
        limit: 3,
        width: 700,
        height: 500,
        layout: "geographic",
        template: "compact",
        theme: "civic",
        preset: undefined,
        roads: false,
        focus: true,
      },
    });
  });

  it("reports missing address separately so cli.ts can print the help text", () => {
    expect(parseCliRequest(["generate"])).toEqual({ kind: "missing-address" });
  });

  it("parses a document re-render request", () => {
    expect(parseCliRequest(["render", "map.json", "-o", "map.svg"])).toEqual({
      kind: "render-document",
      input: "map.json",
      output: "map.svg",
    });
  });

  it("reports a missing document path separately", () => {
    expect(parseCliRequest(["render"])).toEqual({ kind: "missing-document" });
  });

  it("parses a safe skill installation request", () => {
    expect(parseCliRequest(["install-skill", "/tmp/host-skills"])).toEqual({
      kind: "install-skill",
      target: "/tmp/host-skills",
    });
    expect(parseCliRequest(["install-skill"])).toEqual({
      kind: "missing-skill-target",
    });
  });

  it("rejects flag-like missing values before they are swallowed as values", () => {
    expect(() => parseCliRequest(["Seoul", "--output", "--label", "x"])).toThrow(
      '--output requires a value (got flag-like "--label")',
    );
  });

  it("rejects truncated or non-decimal numeric values", () => {
    expect(() => parseCliRequest(["Seoul", "--radius", "400px"])).toThrow(
      '--radius must be an integer ≥ 1 (got: "400px")',
    );
    expect(() => parseCliRequest(["Seoul", "--width", "0x100"])).toThrow(
      '--width must be an integer ≥ 100 (got: "0x100")',
    );
  });

  it("rejects unsupported layout and preset names", () => {
    expect(() => parseCliRequest(["Seoul", "--layout", "tile"])).toThrow(
      '--layout must be "diagram" or "geographic" (got: "tile")',
    );
    expect(() => parseCliRequest(["Seoul", "--preset", "poster"])).toThrow(
      '--preset must be "standard", "compact", "minimal", "schematic", or "badge" (got: "poster")',
    );
  });

  it("keeps --preset as a compatibility alias", () => {
    const request = parseCliRequest(["Seoul", "--preset", "badge"]);
    expect(request).toMatchObject({
      kind: "generate",
      options: { preset: "badge", template: undefined, theme: undefined },
    });
  });

  it("rejects unsupported template and theme names", () => {
    expect(() => parseCliRequest(["Seoul", "--template", "poster"])).toThrow(
      '--template must be "standard", "compact", "minimal", "schematic", or "badge" (got: "poster")',
    );
    expect(() => parseCliRequest(["Seoul", "--theme", "neon"])).toThrow(
      '--theme must be "paper", "mono", "civic", or "invitation" (got: "neon")',
    );
  });
});
