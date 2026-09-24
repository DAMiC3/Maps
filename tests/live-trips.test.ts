// Live end-to-end check of the proposed test trips (docs/BLUEPRINT.md) against
// the real OpenRouteService API. Skipped unless ORS_KEY is set:
//   ORS_KEY=... npx vitest run tests/live-trips.test.ts
// Uses my-hotspots-draft.kml if present (never committed), else the sample file.
import { existsSync, readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parseKml } from "../src/kml";
import { planTrip } from "../src/plan";
import { pointInRing } from "../src/geo";
import { hotspotRing } from "../src/zones";
import type { LatLng } from "../src/types";

const key = process.env.ORS_KEY ?? "";
const file = existsSync("my-hotspots-draft.kml") ? "my-hotspots-draft.kml" : "docs/sample-hotspots.kml";
const hotspots = parseKml(readFileSync(file, "utf8"));

const P: Record<string, LatLng> = {
  "Centurion Mall": { lat: -25.8565, lng: 28.1869 },
  "Menlyn Maine": { lat: -25.785, lng: 28.277 },
  "Union Buildings": { lat: -25.7406, lng: 28.2125 },
  "Wonderboom Airport": { lat: -25.657047, lng: 28.21379 }, // ORS geocoder result
  "Hatfield Gautrain": { lat: -25.7471, lng: 28.2385 },
  "Woodlands Boulevard": { lat: -25.8238, lng: 28.3137 },
};

const trips: [string, string, string, string[]][] = [
  ["Centurion Mall", "Menlyn Maine", "20:30", ["N1 Garsfontein Rd off-ramp", "N1 Atterbury Rd off-ramp"]],
  ["Union Buildings", "Centurion Mall", "18:00", ["Fountains Circle", "N14 Jean Ave off-ramp"]],
  ["Union Buildings", "Wonderboom Airport", "21:00", ["Paul Kruger St through Wonderboompoort"]],
  ["Hatfield Gautrain", "Woodlands Boulevard", "19:30", ["N1 Garsfontein Rd off-ramp", "Garsfontein Rd and Delfi Ave"]],
];

const at = (hhmm: string) => {
  const d = new Date();
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

describe.skipIf(!key)(`live test trips (${file})`, () => {
  for (const [from, to, time, mustAvoid] of trips) {
    it(`${from} -> ${to} at ${time}`, async () => {
      const plan = await planTrip(P[from], P[to], hotspots, at(time), key);
      const min = (s: number) => Math.round(s / 60);
      const entered = (line: LatLng[]) =>
        hotspots.filter((h) => line.some((p) => pointInRing(p, hotspotRing(h)))).map((h) => h.name);

      console.log(
        [
          `\n=== ${from} -> ${to} at ${time}`,
          `normal: ${(plan.normal.distanceMeters / 1000).toFixed(1)} km, ${min(plan.normal.durationSeconds)} min; passes: ${entered(plan.normal.coords).join(", ") || "none"}`,
          `avoid : ${(plan.safe.distanceMeters / 1000).toFixed(1)} km, ${min(plan.safe.durationSeconds)} min; passes: ${entered(plan.safe.coords).join(", ") || "none"}`,
          `zones avoided: ${plan.zones.length}${plan.droppedPrefer ? " (prefer areas dropped)" : ""}; skipped: ${plan.skipped.map((s) => `${s.hotspot.name} [${s.reason}]`).join(", ") || "none"}`,
          `via-points: ${plan.via.length}; ${plan.googleUrl}`,
        ].join("\n"),
      );

      // Every must-avoid hotspot that was sent to ORS must actually be avoided.
      const avoided = new Set(plan.zones.map((h) => h.name));
      for (const name of mustAvoid.filter((n) => avoided.has(n))) {
        expect(entered(plan.safe.coords), `${name} entered`).not.toContain(name);
      }
    }, 60_000);
  }
});
