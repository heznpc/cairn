/**
 * Geometry helpers for road-skeleton simplification.
 *
 * Pure, network-free, deterministic — the curation/render layers depend on
 * this being side-effect free and unit-testable.
 */

export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * Perpendicular distance from point `p` to the infinite line through `a`→`b`,
 * measured in an equirectangular-corrected plane so the tolerance is roughly
 * isotropic in real distance at city scale.
 *
 * Longitude is scaled by cos(lat): one degree of longitude covers less ground
 * than one degree of latitude away from the equator (~0.79× at Seoul's 37.5°N),
 * so without the correction a road running east–west would simplify on a
 * different tolerance than one running north–south.
 *
 * Returned units are "degrees of latitude" (the y axis is left unscaled).
 */
function perpendicularDistance(
  p: GeoPoint,
  a: GeoPoint,
  b: GeoPoint,
  cosLat: number,
): number {
  const ax = a.lon * cosLat;
  const ay = a.lat;
  const bx = b.lon * cosLat;
  const by = b.lat;
  const px = p.lon * cosLat;
  const py = p.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const mag = Math.hypot(dx, dy);
  if (mag === 0) {
    // a and b coincide — fall back to point distance.
    return Math.hypot(px - ax, py - ay);
  }
  // |cross product| / |segment| = perpendicular distance to the line.
  const cross = Math.abs(dx * (ay - py) - (ax - px) * dy);
  return cross / mag;
}

/**
 * Douglas–Peucker polyline simplification.
 *
 * Removes interior points that lie within `epsilon` (degrees of latitude) of
 * the straight line between the retained anchors, preserving the overall shape
 * with far fewer points. Endpoints are always kept.
 *
 * @param points  Polyline in geographic coordinates.
 * @param epsilon Tolerance in degrees of latitude (0.00004° ≈ 4.5 m).
 */
export function douglasPeucker<T extends GeoPoint>(points: T[], epsilon: number): T[] {
  if (points.length <= 2) return points.slice();

  // cos(lat) is effectively constant across a city-scale polyline; compute it
  // once from the first point rather than per-call inside the hot loop.
  const cosLat = Math.cos((points[0].lat * Math.PI) / 180) || 1e-6;
  const last = points.length - 1;

  let maxDist = 0;
  let idx = 0;
  for (let i = 1; i < last; i++) {
    const d = perpendicularDistance(points[i], points[0], points[last], cosLat);
    if (d > maxDist) {
      maxDist = d;
      idx = i;
    }
  }

  if (maxDist > epsilon) {
    // Split at the farthest point and simplify each half; drop the duplicated
    // join point where the two halves meet.
    const left = douglasPeucker(points.slice(0, idx + 1), epsilon);
    const right = douglasPeucker(points.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }

  // Everything between the anchors is within tolerance — collapse to a segment.
  return [points[0], points[last]];
}
