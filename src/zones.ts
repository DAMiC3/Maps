import { config } from "./config";
import { circleRing, distanceToPolyline, pointInRing, ringAreaKm2, ringExtentKm } from "./geo";
import type { Hotspot, LatLng } from "./types";

export function isNight(now: Date, night = config.night): boolean {
  const h = now.getHours();
  return night.startHour > night.endHour
    ? h >= night.startHour || h < night.endHour
    : h >= night.startHour && h < night.endHour;
}

/** Hotspots that apply at the given time (night_only zones only after dark). */
export function activeHotspots(all: Hotspot[], now: Date): Hotspot[] {
  const night = isNight(now);
  return all.filter((h) => !h.nightOnly || night);
}

export function hotspotRing(h: Hotspot): LatLng[] {
  return h.shape.kind === "polygon"
    ? h.shape.ring
    : circleRing(h.shape.at, config.radiusByRisk[h.risk], config.circleSegments);
}

export type SkipReason = "too-large" | "contains-endpoint" | "over-total-area";
export type Skipped = { hotspot: Hotspot; reason: SkipReason };

/**
 * Choose which active zones to send to ORS for one trip.
 *
 * - Zones containing the start or end are skipped: ORS cannot route out of
 *   (or into) an avoid area, and the driver has to pass through it anyway.
 * - Zones further than `corridorMeters` from the normal route are left out,
 *   so ORS only sees zones near this trip.
 * - Zones over the ORS size limits are skipped (not shrunk), with a warning.
 * - The total area is kept under the limit, highest priority first
 *   (higher risk first, then smaller zones).
 */
export function selectZonesForTrip(
  active: Hotspot[],
  origin: LatLng,
  dest: LatLng,
  normalRoute: LatLng[],
): { zones: Hotspot[]; skipped: Skipped[] } {
  const { maxAvoidAreaKm2, maxAvoidExtentKm } = config.ors;
  const skipped: Skipped[] = [];
  const candidates: { hotspot: Hotspot; area: number }[] = [];

  for (const hotspot of active) {
    const ring = hotspotRing(hotspot);
    const nearRoute =
      ring.some((p) => distanceToPolyline(p, normalRoute) <= config.corridorMeters) ||
      normalRoute.some((p) => pointInRing(p, ring)); // big area the route cuts through
    if (!nearRoute) continue;
    if (pointInRing(origin, ring) || pointInRing(dest, ring)) {
      skipped.push({ hotspot, reason: "contains-endpoint" });
      continue;
    }
    const area = ringAreaKm2(ring);
    if (area > maxAvoidAreaKm2 || ringExtentKm(ring) > maxAvoidExtentKm) {
      skipped.push({ hotspot, reason: "too-large" });
      continue;
    }
    candidates.push({ hotspot, area });
  }

  candidates.sort((a, b) => b.hotspot.risk - a.hotspot.risk || a.area - b.area);
  const zones: Hotspot[] = [];
  let total = 0;
  for (const c of candidates) {
    if (total + c.area > maxAvoidAreaKm2) {
      skipped.push({ hotspot: c.hotspot, reason: "over-total-area" });
      continue;
    }
    total += c.area;
    zones.push(c.hotspot);
  }
  return { zones, skipped };
}

/** GeoJSON MultiPolygon ([lng, lat] order) for OpenRouteService avoid_polygons. */
export function toAvoidMultiPolygon(hotspots: Hotspot[]) {
  return {
    type: "MultiPolygon" as const,
    coordinates: hotspots.map((h) => [closeRing(hotspotRing(h)).map((p) => [p.lng, p.lat])]),
  };
}

function closeRing(ring: LatLng[]): LatLng[] {
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first.lat === last.lat && first.lng === last.lng ? ring : [...ring, first];
}
