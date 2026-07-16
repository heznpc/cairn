export function roadCorePathCount(svg: string): number {
  return svg.match(/data-road-layer="core"/g)?.length ?? 0;
}

export function roadCorePathData(svg: string): string[] {
  return [...svg.matchAll(/<path data-road-layer="core" d="([^"]+)"/g)].map((m) => m[1]);
}

export function filledTextOccurrences(svg: string, label: string): number {
  return [...svg.matchAll(new RegExp(`<text [^>]*fill="(?!none)[^"]*"[^>]*>${label}`, "g"))].length;
}
