import { config } from "./config";
import { distanceToPolyline } from "./geo";
import type { LatLng } from "./types";

/**
 * Pick via-points that keep Google Maps on the safe route.
 *
 * 1. Walk the safe route and mark each point that is further than
 *    `thresholdM` from the normal (fastest) route.
 * 2. Consecutive marked points form one detour.
 * 3. For each detour, take its middle point as the via-point.
 * 4. If there are more detours than Google allows, keep the longest ones,
 *    in route order.
 */
export function pickViaPoints(
  safe: LatLng[],
  normal: LatLng[],
  thresholdM = config.detourThresholdMeters,
  max = config.maxViaPoints,
): LatLng[] {
  const detours: LatLng[][] = [];
  let current: LatLng[] = [];
  for (const p of safe) {
    if (distanceToPolyline(p, normal) > thresholdM) {
      current.push(p);
    } else if (current.length) {
      detours.push(current);
      current = [];
    }
  }
  if (current.length) detours.push(current);

  return detours
    .map((d, order) => ({ order, size: d.length, via: d[Math.floor(d.length / 2)] }))
    .sort((a, b) => b.size - a.size)
    .slice(0, max)
    .sort((a, b) => a.order - b.order)
    .map((d) => d.via);
}

/** Google Maps directions link (Maps URLs API; free, no key). */
export function googleMapsUrl(from: LatLng, to: LatLng, via: LatLng[]): string {
  const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const params = new URLSearchParams({
    api: "1",
    origin: fmt(from),
    destination: fmt(to),
    travelmode: "driving",
  });
  if (via.length) params.set("waypoints", via.map(fmt).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}
