import { config } from "./config";
import { googleMapsUrl, pickViaPoints } from "./handoff";
import { route } from "./ors";
import { activeHotspots, selectZonesForTrip, type Skipped } from "./zones";
import type { Hotspot, LatLng, Route } from "./types";

export type TripPlan = {
  normal: Route;
  safe: Route;
  /** Zones actually avoided on this trip. */
  zones: Hotspot[];
  skipped: Skipped[];
  /** True if "prefer" zones were dropped (detour too long or ORS refused them). */
  droppedPrefer: boolean;
  via: LatLng[];
  googleUrl: string;
};

/** Plan one trip: normal route, zone selection, avoiding route, Google hand-off. */
export async function planTrip(
  origin: LatLng,
  dest: LatLng,
  hotspots: Hotspot[],
  when: Date,
  apiKey: string,
): Promise<TripPlan> {
  const normal = await route(origin, dest, [], apiKey);
  const selected = selectZonesForTrip(activeHotspots(hotspots, when), origin, dest, normal.coords);
  const hard = selected.zones.filter((h) => h.mode === "avoid");

  let zones = selected.zones;
  let safe: Route;
  try {
    safe = await route(origin, dest, zones, apiKey);
    const extraMin = (safe.durationSeconds - normal.durationSeconds) / 60;
    if (zones.length > hard.length && extraMin > config.maxExtraMinutesForPreferZones) {
      zones = hard;
      safe = await route(origin, dest, zones, apiKey);
    }
  } catch (e) {
    if (zones.length === hard.length) throw e;
    // "prefer" areas (often large suburbs) may still upset ORS; retry without them.
    zones = hard;
    safe = await route(origin, dest, zones, apiKey);
  }

  const via = pickViaPoints(safe.coords, normal.coords);
  return {
    normal,
    safe,
    zones,
    skipped: selected.skipped,
    droppedPrefer: zones.length < selected.zones.length,
    via,
    googleUrl: googleMapsUrl(origin, dest, via),
  };
}
