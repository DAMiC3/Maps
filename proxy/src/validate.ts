// Request checks for the SafeRoute proxy. Pure functions so they can be unit
// tested without the Workers runtime. Anything not explicitly allowed is dropped,
// so the proxy can't be used as a general-purpose ORS gateway on our key.

/** Greater Tshwane plus a margin. Routes must start and end inside it. */
export const BBOX = { south: -26.2, north: -25.2, west: 27.7, east: 28.8 };

export const LIMITS = {
  maxBodyBytes: 64 * 1024,
  maxPolygons: 60,
  maxRingPoints: 200,
  maxRadiusMeters: 2000,
  maxTextLength: 200,
};

type Lnglat = [number, number];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function inBbox(p: unknown): p is Lnglat {
  if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) return false;
  const [lng, lat] = p;
  return lat >= BBOX.south && lat <= BBOX.north && lng >= BBOX.west && lng <= BBOX.east;
}

function validRing(ring: unknown): ring is Lnglat[] {
  return (
    Array.isArray(ring) &&
    ring.length >= 4 &&
    ring.length <= LIMITS.maxRingPoints &&
    ring.every((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]))
  );
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Rebuild a directions request body from the allowed fields only. */
export function checkRouteBody(body: unknown): Checked<Record<string, unknown>> {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;

  const coords = b.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2 || !coords.every(inBbox)) {
    return { ok: false, error: "Start and end must be two points in the Pretoria area." };
  }
  const out: Record<string, unknown> = { coordinates: coords };

  if (b.radiuses !== undefined) {
    const r = b.radiuses;
    if (!Array.isArray(r) || r.length !== 2 || !r.every((x) => isNum(x) && x > 0 && x <= LIMITS.maxRadiusMeters)) {
      return { ok: false, error: "Invalid radiuses." };
    }
    out.radiuses = r;
  }

  const avoid = (b.options as Record<string, unknown> | undefined)?.avoid_polygons as
    | { type?: unknown; coordinates?: unknown }
    | undefined;
  if (avoid !== undefined) {
    const polys = avoid.coordinates;
    if (
      avoid.type !== "MultiPolygon" ||
      !Array.isArray(polys) ||
      polys.length > LIMITS.maxPolygons ||
      !polys.every((poly) => Array.isArray(poly) && poly.length === 1 && validRing(poly[0]))
    ) {
      return { ok: false, error: "Invalid avoid_polygons." };
    }
    out.options = { avoid_polygons: { type: "MultiPolygon", coordinates: polys } };
  }
  return { ok: true, value: out };
}

/** Build the geocoder query from the allowed params only; country fixed to ZA. */
export function checkGeocodeParams(params: URLSearchParams): Checked<URLSearchParams> {
  const text = params.get("text")?.trim() ?? "";
  if (!text || text.length > LIMITS.maxTextLength) return { ok: false, error: "Invalid search text." };
  const out = new URLSearchParams({ text, "boundary.country": "ZA", size: "5" });
  const lat = Number(params.get("focus.point.lat"));
  const lon = Number(params.get("focus.point.lon"));
  if (inBbox([lon, lat])) {
    out.set("focus.point.lat", String(lat));
    out.set("focus.point.lon", String(lon));
  }
  return { ok: true, value: out };
}

export function isAllowedOrigin(origin: string | null, allowedCsv: string): origin is string {
  if (!origin) return false;
  return allowedCsv.split(",").map((s) => s.trim()).includes(origin);
}
