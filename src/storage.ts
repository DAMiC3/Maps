// Everything lives only in this phone's browser. Nothing is uploaded.
import type { LatLng } from "./types";

const KEYS = { kml: "sr.kml", apiKey: "sr.orsKey", notes: "sr.notes" };

export type IncidentNote = { at: LatLng; time: string; text: string };

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked (private mode) - app still works for this session */
  }
}

export const store = {
  getKml: () => get(KEYS.kml),
  setKml: (v: string | null) => set(KEYS.kml, v),
  getApiKey: () => get(KEYS.apiKey) || import.meta.env.VITE_ORS_KEY || "",
  setApiKey: (v: string) => set(KEYS.apiKey, v.trim() || null),
  getNotes: (): IncidentNote[] => {
    try {
      return JSON.parse(get(KEYS.notes) ?? "[]");
    } catch {
      return [];
    }
  },
  addNote: (n: IncidentNote) => set(KEYS.notes, JSON.stringify([...store.getNotes(), n])),
};

/** Export notes as KML so they can be imported back into My Maps. */
export function notesToKml(notes: IncidentNote[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const placemarks = notes
    .map(
      (n) => `  <Placemark>
    <name>${esc(n.text || "Incident")}</name>
    <description>noted=${n.time}</description>
    <Point><coordinates>${n.at.lng},${n.at.lat},0</coordinates></Point>
  </Placemark>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<name>SafeRoute incident notes</name>
${placemarks}
</Document></kml>
`;
}
