import { describe, expect, it } from "vitest";
import { artifactFormatFromPath, encodeMapArtifact } from "./export.js";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10" fill="#fff"/><path d="M1,5 H19" stroke="#111"/></svg>';
const canvas = { width: 20, height: 10 };

describe("map artifact export", () => {
  it("infers supported formats case-insensitively", () => {
    expect(artifactFormatFromPath("map.svg")).toBe("svg");
    expect(artifactFormatFromPath("map")).toBe("svg");
    expect(artifactFormatFromPath("map.PNG")).toBe("png");
    expect(artifactFormatFromPath("map.pdf")).toBe("pdf");
    expect(() => artifactFormatFromPath("map.jpg")).toThrow("use .svg, .png, or .pdf");
  });

  it("encodes SVG and PNG outputs", () => {
    expect(encodeMapArtifact(svg, canvas, "svg")).toBe(svg);
    const png = encodeMapArtifact(svg, canvas, "png");
    expect(Buffer.isBuffer(png)).toBe(true);
    expect((png as Buffer).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("encodes a structurally valid single-page PDF", () => {
    const pdf = encodeMapArtifact(svg, canvas, "pdf") as Buffer;
    expect(pdf.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(pdf.toString("latin1")).toContain("startxref");
    expect(pdf.subarray(-6).toString("ascii")).toBe("%%EOF\n");
  });
});
