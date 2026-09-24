import { config, type Risk } from "./config";
import { lineEntersRing } from "./geo";
import { googleMapsUrl, pickViaPoints } from "./handoff";
import { route as orsRoute } from "./ors";
import { activeHotspots, hotspotRing, selectZonesForTrip, type Skipped } from "./zones";
import type { Hotspot, LatLng, Route } from "./types";

export type Router = (from: LatLng, to: LatLng, avoid: Hotspot[], apiKey: string) => Promise<Route>;

/** One candidate route and what it costs. */
export type RouteOption = {
  label: string;
  route: Route;
  /** Zones this route was told to avoid. */
  avoided: Hotspot[];
  /** Active zones this route still passes through. */
  passes: Hotspot[];
  /** Driving minutes + detour-worth minutes of every zone passed. */
  cost: number;
};

export type TripPlan = {
  normal: Route;
  chosen: RouteOption;
  /** All options tried, cheapest first. */
  options: RouteOption[];
  skipped: Skipped[];
  via: LatLng[];
  googleUrl: string;
};

const minutes = (r: Route) => r.durationSeconds / 60;

export function routePasses(r: Route, zones: Hotspot[]): Hotspot[] {
  return zones.filter((h) => lineEntersRing(r.coords, hotspotRing(h)));
}

export function routeCost(r: Route, passes: Hotspot[], worth = config.detourWorthMinutes): number {
  return minutes(r) + passes.reduce((sum, h) => sum + worth[h.risk], 0);
}

/**
 * Plan one trip by weighing detour time against danger.
 *
 * Options tried: the normal route, then for each risk threshold (3, 2+, 1+):
 * (a) avoid the zones at that level the route would pass through, adding any
 * the detour runs into (a few rounds); (b) the same using only specific spots,
 * not suburb areas; (c) avoid every zone at that level near the route.
 * The option with the lowest cost wins, so a detour is only taken when the
 * danger it avoids is worth the extra minutes.
 * Worst case about 22 routing calls per trip (free tier: 2,000 a day, 40 a minute).
 */
export async function planTrip(
  origin: LatLng,
  dest: LatLng,
  hotspots: Hotspot[],
  when: Date,
  apiKey: string,
  router: Router = orsRoute,
): Promise<TripPlan> {
  const normal = await router(origin, dest, [], apiKey);
  const active = activeHotspots(hotspots, when);
  const { zones: usable, skipped } = selectZonesForTrip(active, origin, dest, normal.coords);

  const option = (label: string, r: Route, avoided: Hotspot[]): RouteOption => {
    const passes = routePasses(r, active);
    return { label, route: r, avoided, passes, cost: routeCost(r, passes) };
  };
  const options: RouteOption[] = [option("Normal route", normal, [])];

  const tried = new Set<string>();
  const tryAvoiding = async (avoid: Hotspot[], minRisk: Risk): Promise<Route | null> => {
    const key = avoid.map((h) => h.name).sort().join("|");
    if (!avoid.length || tried.has(key)) return null;
    tried.add(key);
    let r: Route;
    try {
      r = await router(origin, dest, avoid, apiKey);
    } catch {
      return null; // ORS could not route around this set; other options remain.
    }
    const same = options.some(
      (o) => o.route.distanceMeters === r.distanceMeters && o.route.durationSeconds === r.durationSeconds,
    );
    if (!same) {
      const level = minRisk === 1 ? "any risk" : `risk ${minRisk}+`;
      options.push(option(`Avoid ${avoid.length} zone${avoid.length === 1 ? "" : "s"} (${level})`, r, avoid));
    }
    return r;
  };

  // Avoid what the route would hit, adding zones the detour runs into (a few rounds).
  const avoidHits = async (eligible: Hotspot[], minRisk: Risk) => {
    let avoid = routePasses(normal, eligible);
    for (let round = 0; round < 3; round++) {
      const r = await tryAvoiding(avoid, minRisk);
      if (!r) return;
      const newHits = routePasses(r, eligible).filter((h) => !avoid.includes(h));
      if (!newHits.length) return;
      avoid = [...avoid, ...newHits];
    }
  };

  for (const minRisk of [3, 2, 1] as Risk[]) {
    const eligible = usable.filter((h) => h.risk >= minRisk);
    await avoidHits(eligible, minRisk);
    // Same, but only specific spots: dodging a whole suburb can push the
    // route into worse spots elsewhere.
    await avoidHits(eligible.filter((h) => h.shape.kind === "point"), minRisk);
    // Every zone at this level near the route in one go.
    await tryAvoiding(eligible, minRisk);
  }

  options.sort((a, b) => a.cost - b.cost);
  const chosen = options[0];
  const via = chosen.route === normal ? [] : pickViaPoints(chosen.route.coords, normal.coords);
  return { normal, chosen, options, skipped, via, googleUrl: googleMapsUrl(origin, dest, via) };
}
