import type { LatLng } from "./types";

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Closed polygon ring approximating a circle. */
export function circleRing(center: LatLng, radiusM: number, segments: number): LatLng[] {
  const ring: LatLng[] = [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos(rad(center.lat)));
  for (let i = 0; i < segments; i++) {
    const t = (2 * Math.PI * i) / segments;
    ring.push({ lat: center.lat + dLat * Math.sin(t), lng: center.lng + dLng * Math.cos(t) });
  }
  ring.push(ring[0]);
  return ring;
}

/** Distance from p to segment a–b, using a local flat projection (fine at city scale). */
export function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = 111320 * Math.cos(rad(p.lat));
  const ky = 110540;
  const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky;
  const bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Ray-casting point-in-polygon test. */
export function pointInRing(p: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat &&
        p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentsCross(a: LatLng, b: LatLng, c: LatLng, d: LatLng): boolean {
  const orient = (p: LatLng, q: LatLng, r: LatLng) =>
    Math.sign((q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng));
  return orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
}

/**
 * Does the polyline enter the ring? Checks vertices and edge crossings, since
 * a straight freeway segment can cut through a small zone with no vertex inside.
 */
export function lineEntersRing(line: LatLng[], ring: LatLng[]): boolean {
  if (line.some((p) => pointInRing(p, ring))) return true;
  const lats = ring.map((p) => p.lat), lngs = ring.map((p) => p.lng);
  const box = { s: Math.min(...lats), n: Math.max(...lats), w: Math.min(...lngs), e: Math.max(...lngs) };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if (Math.max(a.lat, b.lat) < box.s || Math.min(a.lat, b.lat) > box.n ||
        Math.max(a.lng, b.lng) < box.w || Math.min(a.lng, b.lng) > box.e) continue;
    for (let j = 1; j < ring.length; j++) {
      if (segmentsCross(a, b, ring[j - 1], ring[j])) return true;
    }
  }
  return false;
}

/** Approximate ring area in km² (shoelace on a local flat projection). */
export function ringAreaKm2(ring: LatLng[]): number {
  const lat0 = rad(ring[0].lat);
  const xy = ring.map((p) => [p.lng * 111.32 * Math.cos(lat0), p.lat * 110.54]);
  let sum = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Larger of the ring's bounding-box width and height, in km. */
export function ringExtentKm(ring: LatLng[]): number {
  const lats = ring.map((p) => p.lat), lngs = ring.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const w = distanceMeters({ lat: midLat, lng: Math.min(...lngs) }, { lat: midLat, lng: Math.max(...lngs) });
  const h = distanceMeters({ lat: Math.min(...lats), lng: 0 }, { lat: Math.max(...lats), lng: 0 });
  return Math.max(w, h) / 1000;
}

export function distanceToPolyline(p: LatLng, line: LatLng[]): number {
  if (line.length === 1) return distanceMeters(p, line[0]);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    best = Math.min(best, distanceToSegment(p, line[i - 1], line[i]));
  }
  return best;
}
