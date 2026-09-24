import { describe, expect, it } from "vitest";
import { googleMapsUrl, pickViaPoints } from "../src/handoff";
import type { LatLng } from "../src/types";

// Straight west-east road; the safe route bulges ~1 km south in the middle.
const line = (n: number, bulge: (i: number) => number): LatLng[] =>
  Array.from({ length: n + 1 }, (_, i) => ({ lat: -25.75 - bulge(i), lng: 28.1 + i * 0.01 }));

describe("pickViaPoints", () => {
  const normal = line(20, () => 0);

  it("returns nothing when routes match", () => {
    expect(pickViaPoints(normal, normal)).toEqual([]);
  });

  it("places one via-point in the middle of a detour", () => {
    const safe = line(20, (i) => (i >= 8 && i <= 12 ? 0.01 : 0));
    const via = pickViaPoints(safe, normal);
    expect(via).toHaveLength(1);
    expect(via[0].lng).toBeCloseTo(28.2, 5);
  });

  it("keeps the longest detours in route order when over the limit", () => {
    const safe = line(20, (i) => ([2, 3, 4, 10, 16, 17].includes(i) ? 0.01 : 0));
    const via = pickViaPoints(safe, normal, 120, 2);
    expect(via.map((p) => p.lng)).toEqual([safe[3].lng, safe[17].lng]);
  });
});

describe("googleMapsUrl", () => {
  it("builds a directions link with waypoints", () => {
    const url = new URL(googleMapsUrl({ lat: -25.7, lng: 28.1 }, { lat: -25.8, lng: 28.3 }, [{ lat: -25.75, lng: 28.2 }]));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("waypoints")).toBe("-25.750000,28.200000");
    expect(url.searchParams.get("travelmode")).toBe("driving");
  });
});
