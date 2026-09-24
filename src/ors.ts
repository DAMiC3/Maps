import { config } from "./config";
import { toAvoidMultiPolygon } from "./zones";
import type { Hotspot, LatLng, Route } from "./types";

export type Place = { label: string; at: LatLng };

/** Where requests go: the SafeRoute proxy (app) or ORS directly with a key (owner tests). */
export type Endpoint = { routeUrl: string; geocodeUrl: string; headers: Record<string, string> };

export function viaProxy(baseUrl: string): Endpoint {
  return { routeUrl: `${baseUrl}/route`, geocodeUrl: `${baseUrl}/geocode`, headers: {} };
}

export function direct(apiKey: string): Endpoint {
  const { routingBaseUrl, geocodeBaseUrl, profile } = config.ors;
  return {
    routeUrl: `${routingBaseUrl}/v2/directions/${profile}/geojson`,
    geocodeUrl: `${geocodeBaseUrl}/search`,
    // Key in a header, not the URL, so it stays out of logs and history.
    headers: { Authorization: apiKey },
  };
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const detail = await res.json().catch(() => null);
  return detail?.error?.message ?? `${fallback} (${res.status}).`;
}

export async function geocode(text: string, ep: Endpoint): Promise<Place[]> {
  const { focus, country } = config.ors;
  const params = new URLSearchParams({
    text,
    "boundary.country": country,
    "focus.point.lat": String(focus.lat),
    "focus.point.lon": String(focus.lng),
    size: "5",
  });
  const res = await fetch(`${ep.geocodeUrl}?${params}`, { headers: ep.headers });
  if (!res.ok) throw new Error(await errorMessage(res, "Address search failed"));
  const data = await res.json();
  return (data.features ?? []).map((f: any) => ({
    label: f.properties.label,
    at: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
  }));
}

export async function route(from: LatLng, to: LatLng, avoid: Hotspot[], ep: Endpoint): Promise<Route> {
  const { snapRadiusMeters } = config.ors;
  const body: Record<string, unknown> = {
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    // Places like airports or malls can geocode far from the nearest road.
    radiuses: [snapRadiusMeters, snapRadiusMeters],
  };
  if (avoid.length) body.options = { avoid_polygons: toAvoidMultiPolygon(avoid) };

  const res = await fetch(ep.routeUrl, {
    method: "POST",
    headers: { ...ep.headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Routing failed"));
  const data = await res.json();
  const feature = data.features[0];
  return {
    coords: feature.geometry.coordinates.map(([lng, lat]: number[]) => ({ lat, lng })),
    distanceMeters: feature.properties.summary.distance ?? 0,
    durationSeconds: feature.properties.summary.duration ?? 0,
  };
}
