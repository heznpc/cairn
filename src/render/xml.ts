/**
 * Escape a string for safe inclusion in SVG/XML text or attribute values.
 * Shared by the text renderer and the SVG primitives so address and landmark
 * names cannot inject markup into the rendered file.
 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
