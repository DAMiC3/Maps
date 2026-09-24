import type { Risk } from "./config";

export type LatLng = { lat: number; lng: number };

export type Hotspot = {
  name: string;
  risk: Risk;
  nightOnly: boolean;
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
