import type { Risk } from "./config";

export type LatLng = { lat: number; lng: number };

/** How strictly a zone is avoided. */
export type ZoneMode = "avoid" | "prefer";

export type Hotspot = {
  name: string;
  risk: Risk;
  nightOnly: boolean;
  mode: ZoneMode;
  /** Optional ISO date of the most recent report, shown in the UI. */
  lastReport?: string;
  /** A pin (turned into a circle) or an explicit polygon ring from My Maps. */
  shape: { kind: "point"; at: LatLng } | { kind: "polygon"; ring: LatLng[] };
};

export type Route = {
  /** Polyline as [lat, lng] points. */
  coords: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
};
