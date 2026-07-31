import {
  LABEL_HALO,
  type TemplateSpec,
  type ThemeSpec,
} from "./theme.js";
import { escapeXml } from "./xml.js";

export const BOX_OVERLAP_SCORE_PER_PX = 30;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CenterCallout extends Box {
  anchorX: number;
  anchorY: number;
}

export function destinationLabel(
  label: string,
  box: CenterCallout,
  template: TemplateSpec,
  theme: ThemeSpec,
): string {
  const x = box.x.toFixed(1);
  const y = box.y.toFixed(1);
  const textX = (box.x + box.width / 2).toFixed(1);
  const textY = (box.y + 17).toFixed(1);
  const escaped = escapeXml(label);
  if (template.destinationLabel === "outlined") {
    return [
      `<rect data-destination-label="true" x="${x}" y="${y}" width="${box.width}" height="${box.height}" fill="${theme.background}" stroke="${theme.destination}" stroke-width="1.5"/>`,
      `<text x="${textX}" y="${textY}" text-anchor="middle" font-size="13" font-weight="700" fill="${theme.destination}">${escaped}</text>`,
    ].join("\n");
  }
  return [
    `<rect data-destination-label="true" x="${x}" y="${y}" width="${box.width}" height="${box.height}" fill="${theme.destination}"/>`,
    `<text x="${textX}" y="${textY}" text-anchor="middle" font-size="13" font-weight="700" fill="${theme.background}">${escaped}</text>`,
  ].join("\n");
}

export function labelText(
  label: string | string[],
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  fontWeight: number,
  haloColor: string = LABEL_HALO,
): string {
  const lines = Array.isArray(label) ? label : [label];
  const attrs = `x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="${fontSize}" font-weight="${fontWeight}"`;
  // A single line keeps the exact flat <text>…</text> shape (other callers and
  // tests match on it); multiple lines stack as tspans down from the baseline.
  const body =
    lines.length === 1
      ? escapeXml(lines[0])
      : lines
          .map(
            (line, i) =>
              `<tspan x="${x.toFixed(1)}" dy="${i === 0 ? 0 : fontSize + 3}">${escapeXml(line)}</tspan>`,
          )
          .join("");
  return [
    `<text ${attrs} fill="none" stroke="${haloColor}" stroke-width="4" stroke-linejoin="round">${body}</text>`,
    `<text ${attrs} fill="${fill}">${body}</text>`,
  ].join("\n");
}

export function truncateLabel(label: string, maxChars: number): string {
  const trimmed = label.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= maxChars) return trimmed;
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
}

// Wrap a landmark name onto at most two lines instead of hard-truncating with
// an ellipsis (the ugliest "auto-generated" tell). Korean place names are
// usually space-free, so the split is by character count — balanced, but never
// past maxPerLine on the first line; a name too long for two lines ellipsises
// the second. Short names stay on one line (single-element array).
export function wrapLandmarkLabel(name: string, maxPerLine: number): string[] {
  const trimmed = name.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= maxPerLine) return [trimmed];
  const wordWrapped = wrapAtWordBoundary(trimmed, maxPerLine);
  if (wordWrapped) return wordWrapped;
  const splitAt = Math.min(maxPerLine, Math.ceil(chars.length / 2));
  const line1 = chars.slice(0, splitAt).join("");
  const rest = Array.from(chars.slice(splitAt).join("").trimStart());
  const line2 =
    rest.length > maxPerLine
      ? `${rest.slice(0, Math.max(1, maxPerLine - 1)).join("")}…`
      : rest.join("");
  return [line1, line2];
}

function wrapAtWordBoundary(label: string, maxPerLine: number): string[] | null {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const candidates = Array.from({ length: words.length - 1 }, (_, index) => {
    const line1 = words.slice(0, index + 1).join(" ");
    const line2 = words.slice(index + 1).join(" ");
    const firstLength = Array.from(line1).length;
    const secondLength = Array.from(line2).length;
    return {
      line1,
      line2,
      firstLength,
      secondLength,
      score: Math.max(0, secondLength - maxPerLine) * 100 +
        Math.abs(firstLength - Math.min(secondLength, maxPerLine)),
    };
  }).filter((candidate) => candidate.firstLength <= maxPerLine);
  if (candidates.length === 0) return null;

  const best = candidates.sort((a, b) => a.score - b.score)[0];
  const secondChars = Array.from(best.line2);
  const line2 = secondChars.length <= maxPerLine
    ? best.line2
    : `${secondChars.slice(0, Math.max(1, maxPerLine - 1)).join("")}…`;
  return [best.line1, line2];
}

// Advance-width estimate per character, in em. Real widths need the font's
// glyph metrics, but cairn ships no font library, so this approximates by
// East-Asian-Width class — the same trade-off, and the same buckets, as the
// dac/text.py measurement in the diagram-as-code project.
//
// The previous rule was "ASCII 0.58 em, everything else 1.0 em". That is right
// for Hangul and CJK and wrong for every other non-Latin script: Cyrillic
// "Выход" reserved 5 em instead of ~2.8, so Russian and Greek labels claimed
// ~70% more space than they draw and got pushed or hidden for no reason.
const NARROW_ASCII = new Set("iIl.,:;'!|()[]{}/\\");
const WIDE_ASCII = new Set("mwMW@");
// Nonspacing and enclosing marks have zero advance: they stack onto the
// previous glyph. Devanagari matras, Thai vowel/tone marks and Arabic harakat
// are all in here, and counting them as full characters inflated those labels.
const COMBINING_MARK = /\p{Mn}|\p{Me}/u;

function isWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) || // Hangul Jamo
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) || // CJK radicals through Yi
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK compatibility
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) || // CJK compatibility forms
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // Fullwidth forms
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) || // Pictographs
    (codePoint >= 0x20000 && codePoint <= 0x3fffd) // CJK extensions B+
  );
}

export function charEm(ch: string): number {
  if (COMBINING_MARK.test(ch)) return 0;
  const codePoint = ch.codePointAt(0);
  if (codePoint !== undefined && isWideCodePoint(codePoint)) return 1;
  if (ch === " ") return 0.3;
  if (NARROW_ASCII.has(ch)) return 0.34;
  if (WIDE_ASCII.has(ch)) return 0.86;
  return 0.56;
}

export function textEmWidth(label: string): number {
  // Array.from iterates code points, so astral characters count once.
  return Array.from(label).reduce((sum, ch) => sum + charEm(ch), 0);
}

export function textBoxWidth(label: string, fontSize: number, padding: number): number {
  return Math.max(28, Math.ceil(textEmWidth(label) * fontSize + padding));
}

export function boxScore(box: Box, width: number, height: number, obstacles: Box[]): number {
  let score = 0;
  const margin = 18;
  if (box.x < margin) score += (margin - box.x) * 100;
  if (box.y < margin) score += (margin - box.y) * 100;
  if (box.x + box.width > width - margin) {
    score += (box.x + box.width - (width - margin)) * 100;
  }
  if (box.y + box.height > height - margin) {
    score += (box.y + box.height - (height - margin)) * 100;
  }

  for (const obstacle of obstacles) {
    score += overlapArea(box, obstacle) * BOX_OVERLAP_SCORE_PER_PX;
  }
  return score;
}

export function overlapArea(a: Box, b: Box): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}
