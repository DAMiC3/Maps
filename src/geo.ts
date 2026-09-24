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

export function distanceToPolyline(p: LatLng, line: LatLng[]): number {
  if (line.length === 1) return distanceMeters(p, line[0]);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    best = Math.min(best, distanceToSegment(p, line[i - 1], line[i]));
  }
  return best;
}
