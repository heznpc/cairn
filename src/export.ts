import { deflateSync } from "node:zlib";
import { extname } from "node:path";
import { Resvg } from "@resvg/resvg-js";

export type MapArtifactFormat = "svg" | "png" | "pdf";

export interface ArtifactCanvas {
  width: number;
  height: number;
}

const PDF_RASTER_SCALE = 4;
const PDF_POINTS_PER_PIXEL = 72 / 96;

export function artifactFormatFromPath(path: string): MapArtifactFormat {
  const extension = extname(path).toLowerCase();
  if (extension === "" || extension === ".svg") return "svg";
  if (extension === ".png") return "png";
  if (extension === ".pdf") return "pdf";
  throw new Error(`Unsupported output extension: ${extension}; use .svg, .png, or .pdf`);
}

export function encodeMapArtifact(
  svg: string,
  canvas: ArtifactCanvas,
  format: MapArtifactFormat,
): string | Buffer {
  if (format === "svg") return svg;
  if (format === "png") return renderRaster(svg, canvas.width).asPng();

  const image = renderRaster(svg, canvas.width * PDF_RASTER_SCALE);
  return encodeRgbPdf(
    compositeRgbaOnWhite(image.pixels),
    image.width,
    image.height,
    canvas.width * PDF_POINTS_PER_PIXEL,
    canvas.height * PDF_POINTS_PER_PIXEL,
  );
}

function renderRaster(svg: string, width: number) {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: Math.max(1, Math.round(width)) },
    font: { loadSystemFonts: true },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0,
  }).render();
}

function compositeRgbaOnWhite(rgba: Buffer): Buffer {
  const rgb = Buffer.allocUnsafe((rgba.length / 4) * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    const alpha = rgba[source + 3] / 255;
    rgb[target] = Math.round(rgba[source] * alpha + 255 * (1 - alpha));
    rgb[target + 1] = Math.round(rgba[source + 1] * alpha + 255 * (1 - alpha));
    rgb[target + 2] = Math.round(rgba[source + 2] * alpha + 255 * (1 - alpha));
  }
  return rgb;
}

function encodeRgbPdf(
  rgb: Buffer,
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
): Buffer {
  const compressed = deflateSync(rgb, { level: 9 });
  const content = Buffer.from(
    `q\n${pdfNumber(pageWidth)} 0 0 ${pdfNumber(pageHeight)} 0 0 cm\n/Im0 Do\nQ\n`,
    "ascii",
  );
  const objects = [
    pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    pdfObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    pdfObject(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(pageWidth)} ${pdfNumber(pageHeight)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    ),
    pdfStreamObject(
      4,
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>`,
      compressed,
    ),
    pdfStreamObject(5, `<< /Length ${content.length} >>`, content),
  ];

  const header = Buffer.from("%PDF-1.4\n%\xff\xff\xff\xff\n", "latin1");
  const offsets = [0];
  let offset = header.length;
  for (const object of objects) {
    offsets.push(offset);
    offset += object.length;
  }
  const xrefOffset = offset;
  const xref = Buffer.from([
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n"), "ascii");
  return Buffer.concat([header, ...objects, xref]);
}

function pdfObject(id: number, body: string): Buffer {
  return Buffer.from(`${id} 0 obj\n${body}\nendobj\n`, "ascii");
}

function pdfStreamObject(id: number, dictionary: string, stream: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`${id} 0 obj\n${dictionary}\nstream\n`, "ascii"),
    stream,
    Buffer.from("\nendstream\nendobj\n", "ascii"),
  ]);
}

function pdfNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}
