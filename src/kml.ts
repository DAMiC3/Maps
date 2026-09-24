import type { Risk } from "./config";
import type { Hotspot, LatLng, ZoneMode } from "./types";

/**
 * Parse a Google My Maps KML export into hotspots.
 *
 * Rules live in each pin's description as `key=value` pairs separated by `;`
 * or new lines, e.g. `risk=3; night_only=yes; mode=avoid; last=2026-09-01`.
 * Missing keys fall back to risk=2, night_only=no, mode=avoid.
 */
export function parseKml(text: string): Hotspot[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("This file is not valid KML.");
  }
  const out: Hotspot[] = [];
  for (const pm of Array.from(doc.getElementsByTagName("Placemark"))) {
    const name = childText(pm, "name") || "Unnamed hotspot";
    const rules = parseRules(stripHtml(childText(pm, "description")));
    const base = {
      name,
      risk: toRisk(rules.risk),
      nightOnly: isYes(rules.night_only),
      mode: (rules.mode === "prefer" ? "prefer" : "avoid") as ZoneMode,
      lastReport: rules.last,
    };

    const polygon = pm.getElementsByTagName("Polygon")[0];
    const point = pm.getElementsByTagName("Point")[0];
    if (polygon) {
      const outer = polygon.getElementsByTagName("outerBoundaryIs")[0] ?? polygon;
      const ring = parseCoords(childText(outer, "coordinates"));
      if (ring.length >= 3) out.push({ ...base, shape: { kind: "polygon", ring } });
    } else if (point) {
      const [at] = parseCoords(childText(point, "coordinates"));
      if (at) out.push({ ...base, shape: { kind: "point", at } });
    }
  }
  return out;
}

export function parseRules(text: string): Record<string, string> {
  const rules: Record<string, string> = {};
  for (const part of text.split(/[;\n]/)) {
    const m = part.match(/^\s*([a-z_]+)\s*[=:]\s*(.+?)\s*$/i);
    if (m) rules[m[1].toLowerCase()] = m[2].toLowerCase();
  }
  return rules;
}

function childText(el: Element, tag: string): string {
  return el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
}

/** KML coordinates are "lng,lat[,alt]" tuples separated by whitespace. */
function parseCoords(text: string): LatLng[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.split(",").map(Number))
    .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
    .map(([lng, lat]) => ({ lat, lng }));
}

function toRisk(v: string | undefined): Risk {
  const n = Number(v);
  return n === 1 || n === 3 ? n : 2;
}

function isYes(v: string | undefined): boolean {
  return v === "yes" || v === "true" || v === "1";
}
