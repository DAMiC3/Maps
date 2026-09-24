# SafeRoute Pretoria

A Google Maps companion that plans a route around hijacking and smash-and-grab
hotspots, then opens Google Maps with that route loaded. This repo is **Stage 1:
the personal safe-route tool** (see [docs/BLUEPRINT.md](docs/BLUEPRINT.md)).

## How it works

1. Load your hotspots (KML exported from Google My Maps) in **Settings**.
2. Enter a destination. SafeRoute asks OpenRouteService for the normal route
   and a route that avoids active hotspot zones.
3. Only active zones near the route are sent. Zones that contain your start
   or end, or exceed the routing service size limits, are skipped with a warning.
4. It previews both on a map, then builds a Google Maps link with a few
   via-points that keep Google on the safe path.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed URL, go to **Settings**, paste an OpenRouteService API key
(free at https://openrouteservice.org/dev/#/signup; the app uses the new api.heigit.org address) and load
`docs/sample-hotspots.kml` or your own export.

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Typecheck and build to `dist/` |
| `node scripts/make-icons.mjs` | Regenerate PNG app icons from `public/icon.svg` |
| `node scripts/make-icons.mjs` | Regenerate PNG app icons from `public/icon.svg` |

## Hotspot format (My Maps pin description)

```
risk=3; night_only=yes; mode=avoid; last=2026-09-01
```

- `risk` 1–3 sets the no-go circle size (see `src/config.ts`).
- `night_only=yes` applies the zone only after dark (judged by the **Leave at** time).
- `mode=prefer` means "avoid if the detour is short" (use for suburb-sized areas).
- Polygons drawn in My Maps are used as-is.

## Project layout

```
src/config.ts   tunable numbers (radii, night hours, detour limits)
src/kml.ts      My Maps KML -> hotspots
src/zones.ts    active zones and avoid polygons
src/ors.ts      OpenRouteService geocoding + routing
src/handoff.ts  via-point selection and Google Maps link
src/storage.ts  browser-only storage and incident notes
src/main.ts     UI wiring and Leaflet map
```

## Deploying

Push to `main` on GitHub and enable Pages (Settings > Pages > Source: GitHub
Actions). The workflow in `.github/workflows/deploy.yml` tests, builds and
publishes. The hosted page holds no hotspot data; each phone loads its own KML.
