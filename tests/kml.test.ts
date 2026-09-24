import { describe, expect, it } from "vitest";
import { parseKml, parseRules } from "../src/kml";

const kml = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>Off-ramp A</name>
    <description><![CDATA[risk=3<br>night_only=yes<br>last=2026-09-01]]></description>
    <Point><coordinates>28.30,-25.79,0</coordinates></Point></Placemark>
  <Placemark><name>Suburb B</name>
    <description>mode=prefer; risk=1</description>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>
      28.1,-25.7,0 28.2,-25.7,0 28.2,-25.8,0 28.1,-25.7,0
    </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
  <Placemark><name>No rules</name><Point><coordinates>28.0,-25.0</coordinates></Point></Placemark>
</Document></kml>`;

describe("parseKml", () => {
  const hs = parseKml(kml);

  it("reads pins with rules from the description", () => {
    expect(hs[0]).toMatchObject({
      name: "Off-ramp A", risk: 3, nightOnly: true, mode: "avoid", lastReport: "2026-09-01",
      shape: { kind: "point", at: { lat: -25.79, lng: 28.3 } },
    });
  });

  it("reads polygons and prefer mode", () => {
    expect(hs[1].mode).toBe("prefer");
    expect(hs[1].risk).toBe(1);
    expect(hs[1].shape.kind).toBe("polygon");
  });

  it("falls back to defaults", () => {
    expect(hs[2]).toMatchObject({ risk: 2, nightOnly: false, mode: "avoid" });
  });

  it("rejects non-KML", () => {
    expect(() => parseKml("<not closed")).toThrow();
  });
});

describe("parseRules", () => {
  it("accepts ; or newlines and = or :", () => {
    expect(parseRules("Risk: 2\nnight_only = YES")).toEqual({ risk: "2", night_only: "yes" });
  });
});
