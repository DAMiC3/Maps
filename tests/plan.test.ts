import { describe, expect, it } from "vitest";
import { planTrip, type Router } from "../src/plan";
import type { Hotspot, LatLng, Route } from "../src/types";

// Normal route runs straight east along lat -25.75; zones sit on it.
// The detour dips 3 km south, around every zone, and costs `extraMin`.
const origin: LatLng = { lat: -25.75, lng: 28.1 };
const dest: LatLng = { lat: -25.75, lng: 28.3 };
const straight = Array.from({ length: 21 }, (_, i) => ({ lat: -25.75, lng: 28.1 + i * 0.01 }));
const around = straight.map((p, i) => (i === 0 || i === 20 ? p : { ...p, lat: -25.78 }));
const zone = (name: string, lng: number, risk: 1 | 2 | 3): Hotspot => ({
  name, risk, nightOnly: false, shape: { kind: "point", at: { lat: -25.75, lng } },
});

function fakeRouter(extraMin: number): Router {
  return async (_f, _t, avoid) => {
    const r: Route = avoid.length
      ? { coords: around, distanceMeters: 25000, durationSeconds: (20 + extraMin) * 60 }
      : { coords: straight, distanceMeters: 20000, durationSeconds: 20 * 60 };
    return r;
  };
}

const plan = (zones: Hotspot[], extraMin: number) =>
  planTrip(origin, dest, zones, new Date(2026, 8, 24, 12), "k", fakeRouter(extraMin));

describe("planTrip weighs detour time against danger (worth: risk1 3, risk2 8, risk3 15 min)", () => {
  it("takes a 10 min detour around a risk-3 zone", async () => {
    const p = await plan([zone("R3", 28.2, 3)], 10);
    expect(p.chosen.passes).toEqual([]);
    expect(p.via.length).toBeGreaterThan(0);
  });

  it("goes through a risk-3 zone when the detour costs 20 min", async () => {
    const p = await plan([zone("R3", 28.2, 3)], 20);
    expect(p.chosen.label).toBe("Normal route");
    expect(p.chosen.passes.map((h) => h.name)).toEqual(["R3"]);
    expect(p.via).toEqual([]);
  });

  it("goes through one risk-2 zone rather than detour 12 min", async () => {
    const p = await plan([zone("A", 28.15, 2)], 12);
    expect(p.chosen.label).toBe("Normal route");
  });

  it("detours 12 min when the route would pass two risk-2 zones (16 min worth)", async () => {
    const p = await plan([zone("A", 28.15, 2), zone("B", 28.25, 2)], 12);
    expect(p.chosen.passes).toEqual([]);
  });

  it("lists every option, cheapest first", async () => {
    const p = await plan([zone("A", 28.15, 2), zone("B", 28.25, 2)], 12);
    expect(p.options.map((o) => Math.round(o.cost))).toEqual([32, 36]);
    expect(p.options[0].label).toBe("Avoid 2 zones (risk 2+)");
  });
});
