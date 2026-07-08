import type { RenderLayoutMode, RenderPreset } from "./types.js";

export const RENDER_LAYOUTS = ["diagram", "geographic"] as const satisfies readonly RenderLayoutMode[];
export const RENDER_PRESETS = ["standard", "compact", "minimal", "schematic", "badge"] as const satisfies readonly RenderPreset[];

export const RENDER_LAYOUT_HELP = plainChoiceList(RENDER_LAYOUTS);
export const RENDER_PRESET_HELP = plainChoiceList(RENDER_PRESETS);

export function isRenderLayoutMode(value: string): value is RenderLayoutMode {
  return (RENDER_LAYOUTS as readonly string[]).includes(value);
}

export function isRenderPreset(value: string): value is RenderPreset {
  return (RENDER_PRESETS as readonly string[]).includes(value);
}

export function quotedChoiceList(values: readonly string[]): string {
  return choiceList(values.map((value) => `"${value}"`));
}

function plainChoiceList(values: readonly string[]): string {
  return choiceList(values);
}

function choiceList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, or ${values[values.length - 1]}`;
}
