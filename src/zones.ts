import { config } from "./config";
import { circleRing } from "./geo";
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
