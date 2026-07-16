import { z } from "zod";
import { generateMap } from "./pipeline.js";
import { geocode } from "./geocode.js";
import { findLandmarks } from "./landmarks.js";
import { findRoads } from "./roads.js";
import {
  FindLandmarksArgs,
  FindRoadsArgs,
  GenerateMapArgs,
  GeocodeArgs,
  RenderDocumentArgs,
} from "./tool-input-schemas.js";
import {
  applyDiagramDocumentPatch,
  renderDiagramDocument,
} from "./diagram-document.js";

export { tools } from "./tool-registry.js";

// ---------- Dispatcher ----------

// MCP spec requires structuredContent to be a JSON object (record-shaped),
// not a primitive or array. Reflect that at the type level so a future
// `jsonResult(42)` or `jsonResult(landmarksArray)` won't compile.
export interface DispatchResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function jsonResult<T extends Record<string, unknown>>(structured: T): DispatchResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

// Shape an SVG-producing tool result: the SVG itself first (so older clients
// without outputSchema support still see it), then a human summary, plus the
// structured payload per the MCP outputSchema contract.
function svgResult(
  svg: string,
  summary: string,
  structured: Record<string, unknown>,
): DispatchResult {
  return {
    content: [
      { type: "text", text: svg },
      { type: "text", text: summary },
    ],
    structuredContent: structured,
  };
}

// Surface zod issues as `path: message; path: message` instead of the
// multi-line stringified `err.message` JSON blob — that blob is what host
// LLMs see otherwise, and it's not actionable.
function formatError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

export async function dispatchTool(
  name: string,
  args: unknown,
): Promise<DispatchResult> {
  try {
    if (name === "generate_map") {
      const input = GenerateMapArgs.parse(args);
      const { svg, layout, document } = await generateMap(input.address, input);
      return svgResult(
        svg,
        `cairn: rendered ${layout.landmarks.length} landmarks around ` +
          `${layout.center.lat.toFixed(5)}, ${layout.center.lon.toFixed(5)}.`,
        { svg, layout, document },
      );
    }

    if (name === "render_document") {
      const input = RenderDocumentArgs.parse(args);
      const document = input.patch
        ? applyDiagramDocumentPatch(input.document, input.patch)
        : input.document;
      const svg = renderDiagramDocument(document);
      return svgResult(
        svg,
        `cairn: re-rendered document with ${document.map.landmarks.length} landmarks ` +
          `using ${document.render.template}/${document.render.theme}.`,
        { svg, document },
      );
    }

    if (name === "geocode") {
      const input = GeocodeArgs.parse(args);
      const { lat, lon, displayName, raw } = await geocode(input.address);
      // `raw` is the Nominatim payload (addressdetails=1) — host LLMs use it
      // for follow-up reasoning (city, country_code, road, suburb). Only
      // included when it's a record-shaped object so the schema check passes.
      const body: Record<string, unknown> = { lat, lon, displayName };
      if (raw && typeof raw === "object") body.raw = raw;
      return jsonResult(body);
    }

    if (name === "find_landmarks") {
      const input = FindLandmarksArgs.parse(args);
      const landmarks = await findLandmarks(input.lat, input.lon, input.radiusMeters);
      return jsonResult({ landmarks });
    }

    if (name === "find_roads") {
      const input = FindRoadsArgs.parse(args);
      const roads = await findRoads(input.lat, input.lon, input.radiusMeters);
      return jsonResult({ roads });
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `cairn error: ${formatError(err)}` }],
    };
  }
}
