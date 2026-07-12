import type {
  RenderLayoutMode,
  RenderPreset,
  RenderTemplate,
  RenderTheme,
} from "./types.js";
import {
  RENDER_LAYOUTS,
  RENDER_TEMPLATES,
  RENDER_THEMES,
} from "./domain-values.js";

export { RENDER_LAYOUTS, RENDER_TEMPLATES, RENDER_THEMES };
/** @deprecated Use RENDER_TEMPLATES. */
export const RENDER_PRESETS = RENDER_TEMPLATES satisfies readonly RenderPreset[];

export const RENDER_LAYOUT_HELP = plainChoiceList(RENDER_LAYOUTS);
export const RENDER_TEMPLATE_HELP = plainChoiceList(RENDER_TEMPLATES);
export const RENDER_PRESET_HELP = plainChoiceList(RENDER_PRESETS);
export const RENDER_THEME_HELP = plainChoiceList(RENDER_THEMES);

export function isRenderLayoutMode(value: string): value is RenderLayoutMode {
  return (RENDER_LAYOUTS as readonly string[]).includes(value);
}

export function isRenderPreset(value: string): value is RenderPreset {
  return (RENDER_PRESETS as readonly string[]).includes(value);
}

export function isRenderTemplate(value: string): value is RenderTemplate {
  return (RENDER_TEMPLATES as readonly string[]).includes(value);
}

export function isRenderTheme(value: string): value is RenderTheme {
  return (RENDER_THEMES as readonly string[]).includes(value);
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
