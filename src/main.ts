import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { config } from "./config";
import { parseKml } from "./kml";
import { geocode, type Place } from "./ors";
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

function drawZones(active: Hotspot[]) {
  zoneLayer.clearLayers();
  const activeSet = new Set(active);
  for (const h of hotspots) {
    const on = activeSet.has(h);
    L.polygon(hotspotRing(h).map((p) => [p.lat, p.lng] as [number, number]), {
      color: "#be3a2a",
      weight: 1.5,
      dashArray: on ? undefined : "4 6",
      fillOpacity: on ? (h.mode === "prefer" ? 0.08 : 0.18) : 0.03,
    })
      .bindTooltip(
        `${h.name} · risk ${h.risk}${h.nightOnly ? " · after dark" : ""}` +
          `${h.mode === "prefer" ? " · prefer to avoid" : ""}${h.lastReport ? ` · last ${h.lastReport}` : ""}` +
          `${on ? "" : " (not used right now)"}`,
      )
      .addTo(zoneLayer);
  }
}

function drawRoutes(normal: Route, safe: Route) {
  routeLayer.clearLayers();
  const ll = (r: Route) => r.coords.map((p) => [p.lat, p.lng] as [number, number]);
  L.polyline(ll(normal), { color: "#8a8f94", weight: 4, dashArray: "6 8" }).addTo(routeLayer);
  const safeLine = L.polyline(ll(safe), { color: "#2e7a58", weight: 6 }).addTo(routeLayer);
  map.fitBounds(safeLine.getBounds(), { padding: [24, 24] });
}

// ---- status ----
function setStatus(msg: string, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

// ---- settings ----
const settingsBtn = $<HTMLButtonElement>("settingsBtn");
settingsBtn.onclick = () => {
  const panel = $("settings");
  panel.hidden = !panel.hidden;
  settingsBtn.setAttribute("aria-expanded", String(!panel.hidden));
};

const apiKeyInput = $<HTMLInputElement>("apiKey");
apiKeyInput.value = store.getApiKey();
apiKeyInput.onchange = () => store.setApiKey(apiKeyInput.value);

function loadHotspots(kml: string | null) {
  try {
    hotspots = kml ? parseKml(kml) : [];
    $("kmlStatus").textContent = hotspots.length
      ? `${hotspots.length} hotspots loaded (${activeHotspots(hotspots, new Date()).length} active now).`
      : "No hotspots loaded.";
  } catch (e) {
    hotspots = [];
    $("kmlStatus").textContent = (e as Error).message;
  }
  drawZones(activeHotspots(hotspots, new Date()));
}

$<HTMLInputElement>("kmlFile").onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const text = await file.text();
  store.setKml(text);
  loadHotspots(text);
};
$("clearKml").onclick = () => {
  store.setKml(null);
  loadHotspots(null);
};
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
  const key = requireKey();
  const results = await geocode(input.value, key);
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
    if (input.value.trim().length < 3 || !store.getApiKey()) return list.replaceChildren();
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

function requireKey(): string {
  const key = store.getApiKey();
  if (!key) {
    $("settings").hidden = false;
    throw new Error("Add your OpenRouteService API key in Settings first.");
  }
  return key;
}

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

async function findSafeRoute(origin: LatLng, dest: LatLng, when: Date) {
  const key = requireKey();
  setStatus("Finding routes…");
  const { normal, safe, zones, skipped, droppedPrefer, via, googleUrl } =
    await planTrip(origin, dest, hotspots, when, key);

  drawZones(zones);
  drawRoutes(normal, safe);
  const extra = Math.max(0, Math.round((safe.durationSeconds - normal.durationSeconds) / 60));
  $("summary").textContent =
    `${(safe.distanceMeters / 1000).toFixed(1)} km, about ${Math.round(safe.durationSeconds / 60)} min ` +
    `(${extra ? `+${extra} min to avoid ${zones.length} zones near this route` : "no detour needed"}). ` +
    `${via.length} via-point${via.length === 1 ? "" : "s"}.` +
    (droppedPrefer ? " Large 'prefer to avoid' areas were skipped because the detour was too long." : "");
  $("warnings").replaceChildren(
    ...skipped.map((s) =>
      Object.assign(document.createElement("li"), {
        textContent: `Not avoided: ${s.hotspot.name}, because ${SKIP_TEXT[s.reason]}.`,
      }),
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

loadHotspots(store.getKml());

// Offline shell + home-screen install. Skipped in dev so Vite reloads aren't cached.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
