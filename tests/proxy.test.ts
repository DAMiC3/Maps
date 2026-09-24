import { describe, expect, it } from "vitest";
import { checkGeocodeParams, checkRouteBody, isAllowedOrigin } from "../proxy/src/validate";

const pretoria = [[28.18, -25.75], [28.27, -25.78]];
const ring = [[28.2, -25.76], [28.21, -25.76], [28.21, -25.77], [28.2, -25.76]];

describe("proxy: route body", () => {
  it("passes an app-shaped request through, rebuilt from allowed fields", () => {
    const r = checkRouteBody({
      coordinates: pretoria,
      radiuses: [1000, 1000],
      options: { avoid_polygons: { type: "MultiPolygon", coordinates: [[ring]] } },
      instructions: true, // not allowed: dropped
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value).sort()).toEqual(["coordinates", "options", "radiuses"]);
  });

  it("rejects routes outside the Pretoria area", () => {
    expect(checkRouteBody({ coordinates: [[18.42, -33.92], [28.27, -25.78]] }).ok).toBe(false);
  });

  it("rejects extra waypoints, huge radiuses and bad polygons", () => {
    expect(checkRouteBody({ coordinates: [...pretoria, [28.2, -25.7]] }).ok).toBe(false);
    expect(checkRouteBody({ coordinates: pretoria, radiuses: [50000, 1] }).ok).toBe(false);
    expect(checkRouteBody({ coordinates: pretoria, options: { avoid_polygons: { type: "Polygon", coordinates: [ring] } } }).ok).toBe(false);
  });
});

describe("proxy: geocode params", () => {
  it("keeps text and a Pretoria focus, forces country ZA", () => {
    const r = checkGeocodeParams(new URLSearchParams({ text: "Menlyn", "boundary.country": "US", "focus.point.lat": "-25.75", "focus.point.lon": "28.23", api_key: "x" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.get("boundary.country")).toBe("ZA");
      expect(r.value.get("focus.point.lat")).toBe("-25.75");
      expect(r.value.has("api_key")).toBe(false);
    }
  });

  it("rejects empty or very long text", () => {
    expect(checkGeocodeParams(new URLSearchParams({ text: " " })).ok).toBe(false);
    expect(checkGeocodeParams(new URLSearchParams({ text: "x".repeat(300) })).ok).toBe(false);
  });
});

describe("proxy: origin", () => {
  it("allows only listed origins", () => {
    const allowed = "https://damic3.github.io,http://localhost:5173";
    expect(isAllowedOrigin("https://damic3.github.io", allowed)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
    expect(isAllowedOrigin(null, allowed)).toBe(false);
  });
});
