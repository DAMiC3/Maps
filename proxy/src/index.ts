// SafeRoute proxy: holds the OpenRouteService key as a secret so it never
// reaches the browser. Only the SafeRoute site may call it, only for the two
// requests the app makes, only for the Pretoria area, and rate limited per IP.
import { checkGeocodeParams, checkRouteBody, isAllowedOrigin, LIMITS } from "./validate";

export interface Env {
  ORS_KEY: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMITER: RateLimit;
}

const ORS = "https://api.heigit.org";
const ROUTE_URL = `${ORS}/openrouteservice/v2/directions/driving-car/geojson`;
// Autocomplete finds places like "Centurion Mall" that plain search misses.
const GEOCODE_URL = `${ORS}/pelias/v1/autocomplete`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (!isAllowedOrigin(origin, env.ALLOWED_ORIGINS)) {
      return new Response("Forbidden", { status: 403 });
    }
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const json = (status: number, error: string) =>
      Response.json({ error: { message: error } }, { status, headers: cors });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!env.ORS_KEY) return json(500, "Routing is not configured.");

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return json(429, "Too many requests. Wait a minute and try again.");

    const url = new URL(request.url);
    let upstream: Response;

    if (request.method === "GET" && url.pathname === "/geocode") {
      const checked = checkGeocodeParams(url.searchParams);
      if (!checked.ok) return json(400, checked.error);
      upstream = await fetch(`${GEOCODE_URL}?${checked.value}`, {
        headers: { Authorization: env.ORS_KEY },
      });
    } else if (request.method === "POST" && url.pathname === "/route") {
      const text = await request.text();
      if (text.length > LIMITS.maxBodyBytes) return json(413, "Request too large.");
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return json(400, "Body must be JSON.");
      }
      const checked = checkRouteBody(body);
      if (!checked.ok) return json(400, checked.error);
      upstream = await fetch(ROUTE_URL, {
        method: "POST",
        headers: { Authorization: env.ORS_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(checked.value),
      });
    } else {
      return json(404, "Not found.");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  },
} satisfies ExportedHandler<Env>;
