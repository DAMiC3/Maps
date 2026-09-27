# SafeRoute Pretoria

A Google Maps companion that plans a route around hijacking and smash-and-grab
hotspots, then opens Google Maps with that route loaded. Live at
https://damic3.github.io/Maps/ (see [docs/BLUEPRINT.md](docs/BLUEPRINT.md) for the plan).

## How it works

1. The user enters a start (or uses their location) and a destination.
   Hotspots are built in (`src/data/hotspots.kml`); users don't manage zones.
2. SafeRoute gets the normal route and several routes that avoid some or all
   active hotspots near it, via the SafeRoute proxy (OpenRouteService).
3. Each route is scored: driving minutes plus the detour minutes each zone it
   passes is worth (by risk). The lowest score wins, so a detour is only taken
   when the danger it avoids is worth the extra time.
4. It previews the route on a map, then builds a Google Maps link with a few
   via-points that keep Google on that route.

## Architecture

```
Phone (static site on GitHub Pages)  --->  saferoute-proxy (Cloudflare Worker)  --->  OpenRouteService
                                           holds the ORS key as a secret,
                                           only accepts our site, Pretoria-area
                                           requests, 60 requests/min per IP
```

## Getting started

```bash
npm install
npm run dev
```

The dev server (http://localhost:5173) uses the deployed proxy, which allows
that origin. No key is needed in the app.

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm test` | Unit tests (Vitest) |
| `ORS_KEY=... npx vitest run tests/live-trips.test.ts` | Run the test trips directly against OpenRouteService |
| `npm run build` | Typecheck and build to `dist/` |
| `node scripts/make-icons.mjs` | Regenerate PNG app icons from `public/icon.svg` |

## Updating the hotspots

Edit the pins in Google My Maps, export KML, replace `src/data/hotspots.kml`,
push. Each pin's description holds its rules:

```
risk=3; night_only=yes; last=2026-09-01
```

- `risk` 1–3 sets the zone circle size and how many detour minutes it is worth
  (`radiusByRisk` and `detourWorthMinutes` in `src/config.ts`).
- `night_only=yes` applies the zone only after dark (judged by the **Leave at** time).
- Polygons drawn in My Maps are used as-is.

## Project layout

```
src/config.ts         tunable numbers (radii, night hours, detour worth, proxy URL)
src/data/hotspots.kml built-in hotspot list
src/kml.ts            My Maps KML -> hotspots
src/zones.ts          active zones and which ones ORS can avoid
src/plan.ts           route options and the time-vs-danger choice
src/ors.ts            geocoding + routing (via proxy, or direct for tests)
src/handoff.ts        via-point selection and Google Maps link
src/main.ts           UI wiring and Leaflet map
proxy/                Cloudflare Worker holding the ORS key
```

## Deploying

- **App:** push to `main`. `.github/workflows/deploy.yml` tests, builds and
  publishes to GitHub Pages.
- **Proxy:** `cd proxy && npx wrangler deploy`. The key is a Worker secret:
  `npx wrangler secret put ORS_KEY`. Allowed sites are `ALLOWED_ORIGINS` in
  `proxy/wrangler.jsonc`.
