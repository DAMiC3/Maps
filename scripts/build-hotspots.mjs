// Build src/data/hotspots.kml and docs/HOTSPOTS.md from data/hotspots.source.json.
//
//   ORS_KEY=... node scripts/build-hotspots.mjs
//
// Places every hotspot on real road geometry:
//  - ramp:         OpenStreetMap off-ramp ends on the named cross road (small circles, one group)
//  - intersection: OpenStreetMap junction of two named roads
//  - corridor:     strip along the road between two points (route from OpenRouteService)
//  - area:         circle around the geocoded police station
// Overpass/Nominatim responses are cached in .cache/ so re-runs are quick and polite.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SRC = JSON.parse(readFileSync("data/hotspots.source.json", "utf8"));
const ORS_KEY = process.env.ORS_KEY;
const UA = "SafeRoutePretoria/0.1 (hotspot builder)";
const CACHE = ".cache/geo";
mkdirSync(CACHE, { recursive: true });

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
function distToSeg(p, a, b) {
  const kx = 111320 * Math.cos(rad(p.lat)), ky = 110540;
  const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
const distToLine = (p, line) =>
  line.length < 2 ? dist(p, line[0]) : Math.min(...line.slice(1).map((b, i) => distToSeg(p, line[i], b)));
const mean = (pts) => ({ lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length });
const ll = ([lat, lng]) => ({ lat, lng });
const fmt = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

function cluster(points, within) {
  const groups = [];
  for (const p of points) {
    const g = groups.find((g) => dist(mean(g), p) <= within);
    g ? g.push(p) : groups.push([p]);
  }
  return groups.map(mean);
}

async function cached(key, fn) {
  const file = `${CACHE}/${createHash("sha1").update(key).digest("hex")}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const value = await fn();
  writeFileSync(file, JSON.stringify(value));
  return value;
}

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
function overpass(query) {
  return cached(query, async () => {
    let wait = 5000;
    for (let attempt = 0; attempt < 8; attempt++) {
      for (const url of OVERPASS) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ data: query }),
          });
          const text = await res.text();
          if (res.ok && text.startsWith("{")) { await sleep(1500); return JSON.parse(text); }
        } catch { /* try next mirror */ }
      }
      await sleep(wait);
      wait = Math.min(wait * 2, 60000);
    }
    throw new Error("Overpass unavailable");
  });
}

function nominatim(path) {
  return cached(`nominatim:${path}`, async () => {
    await sleep(1100); // usage policy: max 1 request per second
    const res = await fetch(`https://nominatim.openstreetmap.org/${path}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return res.json();
  });
}
const reverseRoad = async (p) => {
  const r = await nominatim(`reverse?lat=${p.lat}&lon=${p.lng}&format=json&zoom=17`);
  const a = r.address ?? {};
  return [a.road, a.suburb ?? a.village ?? a.town ?? a.city].filter(Boolean).join(", ") || r.display_name;
};
async function geocode(q) {
  const r = await nominatim(`search?q=${encodeURIComponent(q + ", Gauteng, South Africa")}&format=json&limit=1&countrycodes=za`);
  if (!r.length) throw new Error(`Not found: ${q}`);
  return { lat: Number(r[0].lat), lng: Number(r[0].lon) };
}

const wayLine = (w) => w.geometry.map((g) => ({ lat: g.lat, lng: g.lon }));
const nodeAt = (w, id) => { const i = w.nodes.indexOf(id); return { lat: w.geometry[i].lat, lng: w.geometry[i].lon }; };

// ---------- placement ----------
async function placeRamp(h) {
  const [lat, lng] = h.near;
  const q = `[out:json][timeout:60];(way[highway=motorway_link](around:900,${lat},${lng});way[highway][name~"${h.cross}",i](around:900,${lat},${lng});way[highway~"^(motorway|trunk)$"](around:900,${lat},${lng}););out geom;`;
  const { elements } = await overpass(q);
  const links = elements.filter((w) => w.tags.highway === "motorway_link");
  const mainline = elements.filter((w) => /^(motorway|trunk)$/.test(w.tags.highway) && !new RegExp(h.cross, "i").test(w.tags.name ?? ""));
  const crossWays = elements.filter((w) => w.tags.highway !== "motorway_link" && new RegExp(h.cross, "i").test(w.tags.name ?? ""));
  const crossNodes = new Set(crossWays.flatMap((w) => w.nodes));
  // Off-ramp end = last node of a link way that lies on the cross road.
  const ends = links.filter((w) => crossNodes.has(w.nodes.at(-1))).map((w) => nodeAt(w, w.nodes.at(-1)));
  if (!ends.length) throw new Error(`${h.id}: no off-ramp ends found on "${h.cross}"`);
  const terminals = cluster(ends, 80);
  const mainLines = mainline.map(wayLine);
  const toMain = (p) => (mainLines.length ? Math.min(...mainLines.map((l) => distToLine(p, l))) : 999);
  const densify = (line) => line.slice(1).flatMap((b, i) => {
    const a = line[i], n = Math.max(1, Math.ceil(dist(a, b) / 10));
    return Array.from({ length: n }, (_, k) => ({ lat: a.lat + ((b.lat - a.lat) * k) / n, lng: a.lng + ((b.lng - a.lng) * k) / n }));
  });
  const crossPts = crossWays.flatMap((w) => densify(wayLine(w)));
  const RADIUS = 60, MIN_RADIUS = 25, CLEARANCE = 20; // circle edge must stay this far from the freeway
  const parts = terminals.map((t) => {
    // Where the street bridges over the freeway the ramp end is right next to it:
    // slide the circle along the street, away from the freeway, by at most 90 m.
    let at = t;
    if (toMain(t) < RADIUS + CLEARANCE) {
      const candidates = crossPts
        .filter((p) => dist(p, t) <= 90 && toMain(p) >= RADIUS + CLEARANCE)
        .sort((a, b) => dist(a, t) - dist(b, t));
      if (candidates[0]) at = candidates[0];
    }
    const clear = toMain(at);
    // Still too close (ramp end under or beside the freeway): drop it rather than block the freeway.
    if (clear < MIN_RADIUS + CLEARANCE) return null;
    const radius = Math.round(Math.min(RADIUS, clear - CLEARANCE));
    const moved = Math.round(dist(at, t));
    return { at, radius, check: `${Math.round(clear)} m from freeway${moved ? `, moved ${moved} m along street` : ""}` };
  }).filter(Boolean);
  if (!parts.length) throw new Error(`${h.id}: every off-ramp end is too close to the freeway`);
  return parts;
}

async function placeIntersection(h) {
  const [lat, lng] = h.near;
  const r = Math.round((h.search_km ?? 1.5) * 1000);
  const q = `[out:json][timeout:60];(way[highway][name~"${h.a}",i](around:${r},${lat},${lng});way[highway][name~"${h.b}",i](around:${r},${lat},${lng}););out geom;`;
  const { elements } = await overpass(q);
  const A = elements.filter((w) => new RegExp(h.a, "i").test(w.tags.name ?? ""));
  const B = elements.filter((w) => new RegExp(h.b, "i").test(w.tags.name ?? ""));
  const bNodes = new Set(B.flatMap((w) => w.nodes));
  const shared = A.flatMap((w) => w.nodes.filter((id) => bNodes.has(id)).map((id) => nodeAt(w, id)));
  if (!shared.length) throw new Error(`${h.id}: "${h.a}" and "${h.b}" don't meet near ${h.near}`);
  const near = ll(h.near);
  const best = cluster(shared, 100).sort((x, y) => dist(x, near) - dist(y, near))[0];
  return [{ at: best, radius: h.radius ?? 150, check: `${Math.round(dist(best, near))} m from hint` }];
}

/**
 * Nearest point on road `ref` to p. On dual carriageways only the carriageway that runs
 * in direction `heading` ({lat, lng} vector) counts, so both corridor ends share one carriageway.
 */
async function snapToRoad(p, ref, heading) {
  const q = `[out:json][timeout:60];way[highway][ref~"(^|;| )${ref}(;| |$)"](around:5000,${p.lat},${p.lng});out geom;`;
  const { elements } = await overpass(q);
  if (!elements.length) throw new Error(`No ${ref} within 5 km of ${fmt(p)}`);
  let best = null;
  for (const w of elements) {
    const oneway = w.tags.oneway === "yes" || w.tags.oneway === "-1" || (w.tags.highway === "motorway" && w.tags.oneway !== "no");
    const sign = w.tags.oneway === "-1" ? -1 : 1;
    const pts = wayLine(w);
    pts.forEach((c, i) => {
      if (oneway && pts.length > 1) {
        const [u, v] = i < pts.length - 1 ? [c, pts[i + 1]] : [pts[i - 1], c];
        const along = sign * ((v.lat - u.lat) * heading.lat + (v.lng - u.lng) * heading.lng * Math.cos(rad(c.lat)) ** 2);
        if (along <= 0) return;
      }
      const d = dist(c, p);
      if (!best || d < best.d) best = { ...c, d };
    });
  }
  if (!best) throw new Error(`No ${ref} carriageway heading the right way near ${fmt(p)}`);
  return { lat: best.lat, lng: best.lng };
}

async function orsRoute(a, b) {
  return cached(`ors:${fmt(a)}>${fmt(b)}`, async () => {
    const res = await fetch("https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: { Authorization: ORS_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: [[a.lng, a.lat], [b.lng, b.lat]], radiuses: [500, 500] }),
    });
    if (!res.ok) throw new Error(`ORS ${res.status}: ${await res.text()}`);
    const f = (await res.json()).features[0];
    return { coords: f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), meters: f.properties.summary.distance };
  });
}

/** Strip polygon of half-width w metres around a polyline, resampled every `step` metres. */
function buffer(line, w, step) {
  const pts = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += dist(line[i - 1], line[i]);
    if (acc >= step) { pts.push(line[i]); acc = 0; }
  }
  if (pts.at(-1) !== line.at(-1)) pts.push(line.at(-1));
  const left = [], right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const kx = 111320 * Math.cos(rad(p.lat)), ky = 110540;
    const dx = (b.lng - a.lng) * kx, dy = (b.lat - a.lat) * ky, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // left normal
    left.push({ lat: p.lat + (ny * w) / ky, lng: p.lng + (nx * w) / kx });
    right.push({ lat: p.lat - (ny * w) / ky, lng: p.lng - (nx * w) / kx });
  });
  const ring = [...left, ...right.reverse()];
  ring.push(ring[0]);
  return ring;
}

async function placeCorridor(h) {
  if (!ORS_KEY) throw new Error("ORS_KEY is required for corridors");
  const [from, to] = [await geocodeOrCoord(h.from), await geocodeOrCoord(h.to)];
  const heading = { lat: to.lat - from.lat, lng: to.lng - from.lng };
  const a = await snapToRoad(from, h.road, heading);
  const b = await snapToRoad(to, h.road, heading);
  const r = await orsRoute(a, b);
  // The snapped ends can sit on the opposite carriageway, so the route may run past an end
  // to U-turn at the next interchange. Keep only the stretch between the two ends.
  const near = (p, q) => dist(p, q) < 80;
  const end = r.coords.findIndex((c) => near(c, b));
  const start = r.coords.slice(0, end + 1).findLastIndex((c) => near(c, a));
  const line = r.coords.slice(Math.max(0, start), end + 1);
  const meters = line.slice(1).reduce((s, c, i) => s + dist(line[i], c), 0);
  const straight = dist(a, b);
  const ring = buffer(line, 100, Math.max(150, meters / 90));
  const lats = ring.map((p) => p.lat), lngs = ring.map((p) => p.lng);
  const extentKm = Math.max(
    dist({ lat: Math.min(...lats), lng: lngs[0] }, { lat: Math.max(...lats), lng: lngs[0] }),
    dist({ lat: lats[0], lng: Math.min(...lngs) }, { lat: lats[0], lng: Math.max(...lngs) }),
  ) / 1000;
  return [{ ring, from: a, to: b, check: `${(meters / 1000).toFixed(1)} km (route ${(r.meters / 1000).toFixed(1)}, straight ${(straight / 1000).toFixed(1)}), extent ${extentKm.toFixed(1)} km, ${ring.length} pts` }];
}

const geocodeOrCoord = (v) => (Array.isArray(v) ? ll(v) : geocode(v));

async function placeArea(h) {
  const c = await geocodeOrCoord(h.center);
  const ring = [];
  for (let i = 0; i <= 32; i++) {
    const t = (2 * Math.PI * i) / 32, km = h.radius_km;
    ring.push({ lat: c.lat + (km / 110.54) * Math.sin(t), lng: c.lng + (km / (111.32 * Math.cos(rad(c.lat)))) * Math.cos(t) });
  }
  return [{ ring, center: c, check: `centre ${fmt(c)}` }];
}

// ---------- run ----------
const placed = [];
const problems = [];
for (const h of SRC.hotspots) {
  try {
    const parts = await { ramp: placeRamp, intersection: placeIntersection, point: async () => [{ at: ll(h.near), radius: h.radius ?? 150, check: "given" }], corridor: placeCorridor, area: placeArea }[h.kind](h);
    for (const p of parts) {
      const where = p.at ?? p.center ?? p.from;
      p.road = await reverseRoad(where);
      if (p.to) p.roadTo = await reverseRoad(p.to);
    }
    placed.push({ h, parts });
    console.log(`OK  ${h.id.padEnd(30)} ${parts.map((p) => `[${p.at ? fmt(p.at) + " r" + p.radius : p.check}] ${p.road}${p.roadTo ? " -> " + p.roadTo : ""}${p.at ? " (" + p.check + ")" : ""}`).join(" | ")}`);
  } catch (e) {
    problems.push(`${h.id}: ${e.message}`);
    console.log(`ERR ${h.id.padEnd(30)} ${e.message}`);
  }
}

// ---------- write KML ----------
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const coords = (ring) => ring.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)},0`).join(" ");
const marks = [];
for (const { h, parts } of placed) {
  parts.forEach((p, i) => {
    const rules = [`risk=${h.risk}`, `night_only=${h.night_only ? "yes" : "no"}`, `last=${h.last}`];
    if (p.radius) rules.push(`radius=${p.radius}`);
    const group = h.group ?? (parts.length > 1 ? h.id : undefined);
    if (group) rules.push(`group=${group}`);
    if (h.kind === "corridor") rules.push("min_inside=500");
    if (h.kind === "area") rules.push("min_inside=1000");
    const name = parts.length > 1 ? `${h.name} (${i + 1} of ${parts.length})` : h.name;
    const geom = p.at
      ? `<Point><coordinates>${p.at.lng.toFixed(6)},${p.at.lat.toFixed(6)},0</coordinates></Point>`
      : `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(p.ring)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    marks.push(`  <Placemark>\n    <name>${esc(name)}</name>\n    <description>${rules.join("; ")}</description>\n    ${geom}\n  </Placemark>`);
  });
}
writeFileSync("src/data/hotspots.kml", `<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERATED by scripts/build-hotspots.mjs from data/hotspots.source.json. Do not edit by hand.
     Evidence and sources for every entry: docs/HOTSPOTS.md -->
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>SafeRoute Pretoria hotspots</name>
${marks.join("\n")}
</Document></kml>
`);

// ---------- write docs ----------
const kindLabel = { ramp: "Off-ramp ends", intersection: "Intersection", point: "Spot", corridor: "Road stretch", area: "Police area" };
const rows = placed
  .sort((x, y) => y.h.risk - x.h.risk || x.h.name.localeCompare(y.h.name))
  .map(({ h, parts }) =>
    `| ${h.risk} | ${esc(h.name)} | ${kindLabel[h.kind]}${parts.length > 1 ? ` (${parts.length})` : ""} | ${h.night_only ? "Night" : "Always"} | ${h.last} | ${esc(h.evidence)} | ${h.sources.map((u, i) => `[${i + 1}](${u})`).join(" ")} |`);
writeFileSync("docs/HOTSPOTS.md", `# SafeRoute hotspot list

Generated from \`data/hotspots.source.json\` by \`scripts/build-hotspots.mjs\`. ${placed.length} hotspots, researched 2026-10-28.

**Risk rubric**
- **3**: ${SRC._rubric["3"]}
- **2**: ${SRC._rubric["2"]}
- **1**: ${SRC._rubric["1"]}

Detour worth per risk and zone sizes are in \`src/config.ts\`. "Night" zones apply 18:00–06:00.
Hijacking peaks 16:00–21:00 and also happens by day (Tracker), so spots apply all day.

| Risk | Place | Type | When | Last report | Evidence | Sources |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
${problems.length ? `\n## Not placed\n\n${problems.map((p) => `- ${p}`).join("\n")}\n` : ""}`);

console.log(`\n${placed.length} placed, ${problems.length} problems, ${marks.length} placemarks written.`);
