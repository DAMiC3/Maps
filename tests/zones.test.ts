import { describe, expect, it } from "vitest";
import { activeHotspots, isNight, toAvoidMultiPolygon } from "../src/zones";
import type { Hotspot } from "../src/types";

const at = (h: number) => new Date(2026, 8, 24, h, 0);
const pin = (nightOnly: boolean): Hotspot => ({
  name: "x", risk: 2, nightOnly, mode: "avoid",
  shape: { kind: "point", at: { lat: -25.75, lng: 28.23 } },
});

describe("zones", () => {
  it("treats 18:00-06:00 as night", () => {
    expect(isNight(at(17))).toBe(false);
    expect(isNight(at(18))).toBe(true);
    expect(isNight(at(2))).toBe(true);
    expect(isNight(at(6))).toBe(false);
  });

  it("only activates night_only zones after dark", () => {
    const all = [pin(false), pin(true)];
    expect(activeHotspots(all, at(12))).toHaveLength(1);
    expect(activeHotspots(all, at(22))).toHaveLength(2);
  });

  it("builds a closed [lng, lat] MultiPolygon", () => {
    const mp = toAvoidMultiPolygon([pin(false)]);
    const ring = mp.coordinates[0][0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring[0][0]).toBeGreaterThan(28); // lng first
  });
});
