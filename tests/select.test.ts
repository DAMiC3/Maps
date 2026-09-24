import { describe, expect, it } from "vitest";
import { selectZonesForTrip } from "../src/zones";
import { pointInRing, ringAreaKm2, ringExtentKm } from "../src/geo";
import type { Hotspot, LatLng } from "../src/types";

const pin = (name: string, lat: number, lng: number, extra: Partial<Hotspot> = {}): Hotspot => ({
  name, risk: 2, nightOnly: false, shape: { kind: "point", at: { lat, lng } }, ...extra,
});
const square = (name: string, lat: number, lng: number, sizeDeg: number, extra: Partial<Hotspot> = {}): Hotspot => ({
  name, risk: 1, nightOnly: false,
  shape: {
    kind: "polygon",
    ring: [
      { lat, lng }, { lat, lng: lng + sizeDeg }, { lat: lat + sizeDeg, lng: lng + sizeDeg },
      { lat: lat + sizeDeg, lng }, { lat, lng },
    ],
  },
  ...extra,
});

// Straight route along lat -25.75 from lng 28.10 to 28.30.
const origin: LatLng = { lat: -25.75, lng: 28.1 };
const dest: LatLng = { lat: -25.75, lng: 28.3 };
const normal: LatLng[] = Array.from({ length: 21 }, (_, i) => ({ lat: -25.75, lng: 28.1 + i * 0.01 }));
const names = (hs: Hotspot[]) => hs.map((h) => h.name);

describe("geo helpers", () => {
  const { shape } = square("s", -25.8, 28.2, 0.1);
  const ring = shape.kind === "polygon" ? shape.ring : [];
  it("measures a ~10 km square", () => {
    expect(ringAreaKm2(ring)).toBeGreaterThan(95);
    expect(ringAreaKm2(ring)).toBeLessThan(115);
    expect(ringExtentKm(ring)).toBeCloseTo(11, 0);
  });
  it("tests points inside polygons", () => {
    expect(pointInRing({ lat: -25.75, lng: 28.25 }, ring)).toBe(true);
    expect(pointInRing({ lat: -25.6, lng: 28.25 }, ring)).toBe(false);
  });
});

describe("selectZonesForTrip", () => {
  it("keeps zones near the route and drops distant ones", () => {
    const { zones, skipped } = selectZonesForTrip(
      [pin("near", -25.755, 28.2), pin("far", -25.5, 28.2)], origin, dest, normal,
    );
    expect(names(zones)).toEqual(["near"]);
    expect(skipped).toEqual([]);
  });

  it("skips a zone containing the start", () => {
    const { zones, skipped } = selectZonesForTrip([pin("home", -25.7502, 28.1)], origin, dest, normal);
    expect(zones).toEqual([]);
    expect(skipped[0].reason).toBe("contains-endpoint");
  });

  it("notices a big zone the route cuts through, and skips it as too large", () => {
    // ~33 km square whose corners are all >5 km from the route, which crosses its middle.
    const { skipped } = selectZonesForTrip(
      [square("huge", -25.9, 28.05, 0.3)],
      { lat: -25.75, lng: 27.9 }, { lat: -25.75, lng: 28.5 },
      Array.from({ length: 61 }, (_, i) => ({ lat: -25.75, lng: 27.9 + i * 0.01 })),
    );
    expect(skipped.map((s) => s.reason)).toEqual(["too-large"]);
  });

  it("fills the total area budget by risk, highest first", () => {
    // Two ~110 km² risk-1/risk-3 squares beside the route: only one fits under 200 km².
    const a = square("area-a", -25.86, 28.11, 0.1);
    const b = square("area-b", -25.86, 28.22, 0.1, { risk: 3 });
    const { zones, skipped } = selectZonesForTrip([a, pin("hard", -25.755, 28.2), b], origin, dest, normal);
    expect(names(zones)).toEqual(["area-b", "hard"]);
    expect(skipped.map((s) => [s.hotspot.name, s.reason])).toEqual([["area-a", "over-total-area"]]);
  });
});
