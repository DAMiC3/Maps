import { config } from "./config";
import { toAvoidMultiPolygon } from "./zones";
import type { Hotspot, LatLng, Route } from "./types";

export type Place = { label: string; at: LatLng };

export async function geocode(text: string, apiKey: string): Promise<Place[]> {
  const { baseUrl, focus, country } = config.ors;
  const params = new URLSearchParams({
    api_key: apiKey,
    text,
    "boundary.country": country,
    "focus.point.lat": String(focus.lat),
    "focus.point.lon": String(focus.lng),
    size: "5",
  });
  const res = await fetch(`${baseUrl}/geocode/search?${params}`);
  if (!res.ok) throw new Error(`Address search failed (${res.status}).`);
  const data = await res.json();
  return (data.features ?? []).map((f: any) => ({
    label: f.properties.label,
    at: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
  }));
}

export async function route(
  from: LatLng,
  to: LatLng,
  avoid: Hotspot[],
  apiKey: string,
): Promise<Route> {
  const { baseUrl, profile } = config.ors;
  const body: Record<string, unknown> = {
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
  };
  if (avoid.length) body.options = { avoid_polygons: toAvoidMultiPolygon(avoid) };

  const res = await fetch(`${baseUrl}/v2/directions/${profile}/geojson`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error?.message ?? `Routing failed (${res.status}).`);
  }
  const data = await res.json();
  const feature = data.features[0];
  return {
    coords: feature.geometry.coordinates.map(([lng, lat]: number[]) => ({ lat, lng })),
    distanceMeters: feature.properties.summary.distance ?? 0,
    durationSeconds: feature.properties.summary.duration ?? 0,
  };
}
