import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { config } from "./config";
import { parseKml } from "./kml";
import builtInHotspots from "./data/hotspots.kml?raw";
import { geocode, route, viaProxy, type Place } from "./ors";
import { planTrip } from "./plan";
import { activeHotspots, hotspotRing, type SkipReason } from "./zones";
import { notesToKml, store } from "./storage";
import type { Hotspot, LatLng, Route } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- state ----
let hotspots: Hotspot[] = [];
let from: Place | null = null;
let to: Place | null = null;

// ---- map ----
const map = L.map("map").setView([config.mapCenter.lat, config.mapCenter.lng], config.mapCenter.zoom);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);
const zoneLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);

/** Zone colours by risk: yellow, orange, red. */
const RISK_COLORS = { 1: "#f2b705", 2: "#f07b16", 3: "#d62828" } as const;

/** Draw all zones: active ones filled by risk colour, ones the route passes outlined in purple. */
function drawZones(active: Hotspot[], passed: Hotspot[] = []) {
  zoneLayer.clearLayers();
  const activeSet = new Set(active);
  const passedSet = new Set(passed);
  for (const h of hotspots) {
    const on = activeSet.has(h);
    const hit = passedSet.has(h);
    const color = RISK_COLORS[h.risk];
    L.polygon(hotspotRing(h).map((p) => [p.lat, p.lng] as [number, number]), {
      color: hit ? "#7a3cff" : color,
      fillColor: color,
      weight: hit ? 3 : 1.5,
      dashArray: on ? undefined : "4 6",
      opacity: on ? 0.9 : 0.4,
      fillOpacity: on ? 0.12 + 0.06 * h.risk : 0.04,
    })
      .bindTooltip(
        `${h.name} · risk ${h.risk}${h.nightOnly ? " · after dark" : ""}` +
          `${h.lastReport ? ` · last ${h.lastReport}` : ""}` +
          `${hit ? " · route passes here" : on ? "" : " (not active at this time)"}`,
      )
      .addTo(zoneLayer);
  }
}

function drawRoutes(normal: Route, safe: Route) {
  routeLayer.clearLayers();
  const ll = (r: Route) => r.coords.map((p) => [p.lat, p.lng] as [number, number]);
  L.polyline(ll(normal), { color: "#7d8a91", weight: 4, dashArray: "6 8", opacity: 0.8 }).addTo(routeLayer);
  L.polyline(ll(safe), { color: "#ffffff", weight: 10, opacity: 0.9 }).addTo(routeLayer); // casing
  const safeLine = L.polyline(ll(safe), { color: "#1f8a5b", weight: 6 }).addTo(routeLayer);
  const ends = [safe.coords[0], safe.coords[safe.coords.length - 1]];
  ends.forEach((p, i) =>
    L.circleMarker([p.lat, p.lng], {
      radius: 7, weight: 3, color: "#ffffff", fillOpacity: 1, fillColor: i ? "#d0402b" : "#1f8a5b",
    }).addTo(routeLayer),
  );
  map.fitBounds(safeLine.getBounds(), { padding: [24, 24] });
}

// ---- status ----
function setStatus(msg: string, isError = false, busy = false) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.toggle("busy", busy);
}

const chip = (text: string, kind = "") =>
  Object.assign(document.createElement("span"), { className: `chip ${kind}`.trim(), textContent: text });

// ---- install as an app ----
// Android/desktop Chrome fire beforeinstallprompt; iPhone Safari needs "Add to Home Screen".
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<unknown> };
let installPrompt: InstallPrompt | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e as InstallPrompt;
  $("installBtn").hidden = false;
});
$("installBtn").onclick = async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("installBtn").hidden = true;
};
const installed =
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
if (!installed && /iphone|ipad|ipod/i.test(navigator.userAgent)) $("iosHint").hidden = false;

// ---- settings ----
const settingsBtn = $<HTMLButtonElement>("settingsBtn");
settingsBtn.onclick = () => {
  const panel = $("settings");
  panel.hidden = !panel.hidden;
  settingsBtn.setAttribute("aria-expanded", String(!panel.hidden));
};

// All routing and address search goes through the SafeRoute proxy, which holds the key.
const endpoint = viaProxy(config.proxyUrl);

// Hotspots ship with the app (src/data/hotspots.kml); users don't manage them.
hotspots = parseKml(builtInHotspots);
drawZones(activeHotspots(hotspots, new Date()));
$("hotspotInfo").textContent =
  `${hotspots.length} built-in hotspots, ${activeHotspots(hotspots, new Date()).length} active right now.`;
$("exportNotes").onclick = () => {
  const notes = store.getNotes();
  if (!notes.length) return setStatus("No incident notes yet.");
  const blob = new Blob([notesToKml(notes)], { type: "application/vnd.google-earth.kml+xml" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `saferoute-notes-${new Date().toISOString().slice(0, 10)}.kml`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
};

// ---- places ----
function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location is not available on this device."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error("Could not get your location. Check location permission.")),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

async function searchInto(input: HTMLInputElement, list: HTMLUListElement, pick: (p: Place) => void) {
  const results = await geocode(input.value, endpoint);
  list.replaceChildren(
    ...results.map((r) => {
      const li = document.createElement("li");
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: r.label });
      b.onclick = () => {
        input.value = r.label;
        list.replaceChildren();
        pick(r);
      };
      li.append(b);
      return li;
    }),
  );
  if (!results.length) setStatus("No matching address found.", true);
}

function wireSearch(inputId: string, listId: string, pick: (p: Place | null) => void) {
  const input = $<HTMLInputElement>(inputId);
  const list = $<HTMLUListElement>(listId);
  let timer: number | undefined;
  input.oninput = () => {
    pick(null);
    clearTimeout(timer);
    if (input.value.trim().length < 3) return list.replaceChildren();
    timer = window.setTimeout(() => searchInto(input, list, pick).catch((e) => setStatus(e.message, true)), 400);
  };
}
wireSearch("from", "fromResults", (p) => (from = p));
wireSearch("to", "toResults", (p) => (to = p));

$("useLocation").onclick = async () => {
  $<HTMLInputElement>("from").value = "";
  from = null;
  setStatus("Using your current location.");
};

// ---- routing ----
/** Departure time from the "Leave at" field (today), or now if empty. */
function departureTime(): Date {
  const value = $<HTMLInputElement>("leaveAt").value;
  const when = new Date();
  if (value) {
    const [h, m] = value.split(":").map(Number);
    when.setHours(h, m, 0, 0);
  }
  return when;
}

const SKIP_TEXT: Record<SkipReason, string> = {
  "contains-endpoint": "your start or destination is inside it",
  "too-large": "it is larger than the routing service allows",
  "over-total-area": "the total avoid area is over the routing service limit",
};

const li = (text: string) => Object.assign(document.createElement("li"), { textContent: text });
const mins = (r: Route) => Math.round(r.durationSeconds / 60);

async function findSafeRoute(origin: LatLng, dest: LatLng, when: Date) {
  setStatus("Comparing routes around hotspots…", false, true);
  const { normal, chosen, options, skipped, googleUrl } =
    await planTrip(origin, dest, hotspots, when, (f, t, avoid) => route(f, t, avoid, endpoint));
  const r = chosen.route;

  drawZones(activeHotspots(hotspots, when), chosen.passes);
  drawRoutes(normal, r);
  const extra = Math.max(0, mins(r) - mins(normal));
  const avoided = chosen.avoided.length;
  $("summary").replaceChildren(
    chip(`${mins(r)} min`, "big"),
    chip(`${(r.distanceMeters / 1000).toFixed(1)} km`),
    extra ? chip(`+${extra} min detour`, "warn") : chip("Fastest route", "good"),
    ...(avoided ? [chip(`✓ avoids ${avoided} zone${avoided === 1 ? "" : "s"}`, "good")] : []),
    ...(chosen.passes.length ? [chip(`passes ${chosen.passes.length}`, "warn")] : []),
  );

  // Zones the chosen route still passes, with the cheapest option that would avoid each.
  const passWarnings = chosen.passes.map((h) => {
    const around = options.find((o) => !o.passes.includes(h));
    const others = around?.passes.length ?? 0;
    const why = around
      ? ` · way around: ${mins(around.route)} min` + (others ? `, ${others} other zone${others === 1 ? "" : "s"}` : "")
      : " · no way around";
    // Drop trailing "(area)", "(night)", "(1 of 2)" from names to keep the line short.
    return li(`Through ${h.name.replace(/\s*\([^)]*\)$/, "")} · risk ${h.risk}${why}`);
  });
  $("warnings").replaceChildren(
    ...passWarnings,
    ...skipped
      .filter((s) => s.reason !== "contains-endpoint" || chosen.passes.includes(s.hotspot))
      .map((s) => li(`Could not avoid ${s.hotspot.name}: ${SKIP_TEXT[s.reason]}.`)),
  );
  $("options").replaceChildren(
    ...options.map((o) =>
      li(`${o === chosen ? "✔ " : ""}${o.label}: ${mins(o.route)} min, passes ${o.passes.length} zone${o.passes.length === 1 ? "" : "s"}, score ${Math.round(o.cost)}`),
    ),
  );
  $<HTMLAnchorElement>("openGoogle").href = googleUrl;
  $("result").hidden = false;
  setStatus("");
}

async function run(useLiveLocation: boolean) {
  const btn = $<HTMLButtonElement>("goBtn");
  btn.disabled = true;
  try {
    if (!to) throw new Error("Pick a destination from the search results.");
    const origin = !useLiveLocation && from ? from.at : await currentPosition();
    await findSafeRoute(origin, to.at, useLiveLocation ? new Date() : departureTime());
  } catch (e) {
    setStatus((e as Error).message, true);
  } finally {
    btn.disabled = false;
  }
}

$<HTMLFormElement>("tripForm").onsubmit = (e) => {
  e.preventDefault();
  run(false);
};
$("recheck").onclick = () => run(true);

// ---- incident notes ----
$("noteBtn").onclick = async () => {
  try {
    const at = await currentPosition();
    const text = prompt("What happened? (You can also do this later, somewhere safe.)") ?? "";
    store.addNote({ at, time: new Date().toISOString(), text });
    setStatus("Incident noted on this phone. Export it from Settings.");
  } catch (e) {
    setStatus((e as Error).message, true);
  }
};


// Offline shell + home-screen install. Skipped in dev so Vite reloads aren't cached.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
