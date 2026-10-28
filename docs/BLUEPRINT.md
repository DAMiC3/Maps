# Blueprint notes

Full proposal: "SafeRoute Pretoria – App blueprint and proposal" (Claude artifact
https://claude.ai/artifact/WH37nB7EBhKBQ4Q3Z8BiN9).

## Stages
1. **Personal safe-route tool** (this repo) – KML hotspots, ORS avoid-routing,
   preview, Google Maps hand-off, recheck button, incident notes.
2. Daily incident feed – scheduled job + Claude API extraction from news/SAPS/security alerts.
3. Community reporting – phone-verified accounts, multi-source confirmation, POPIA.
4. Business version – route-risk API for fleets, rental companies, insurers.

## Open decisions for Stage 1 (current placeholder in brackets)

| Decision | Placeholder | Where |
| --- | --- | --- |
| Real hotspot list | 36 researched hotspots (news, SAPS stats, security alerts; 2026-10-28), built by `scripts/build-hotspots.mjs` from `data/hotspots.source.json`; evidence in `docs/HOTSPOTS.md`. Needs a local review | `data/hotspots.source.json` |
| KML rule format | `risk=3; night_only=yes; last=YYYY-MM; radius=60; group=id; min_inside=500` | `src/kml.ts` |
| Radius per risk | 300 / 600 / 1000 m | `src/config.ts` |
| "After dark" hours | 18:00–06:00 | `src/config.ts` |
| Detour minutes worth per risk | 3 / 8 / 15 min (risk 1 / 2 / 3) | `src/config.ts` |
| ORS avoid-area size limits | 200 km² area / 20 km extent (published). Zones over the limit, or containing the start/end, are skipped with a warning; total area is filled highest risk first (unclear if the limit is per polygon or total, so treated as total) | `src/zones.ts` |
| ORS base URL | Resolved: api.heigit.org/openrouteservice and /pelias/v1 (old host deprecated 2026-04-28) | `src/config.ts` |
| Zones sent per trip | Only zones within 5 km of the normal route | `src/config.ts` |
| Via-point rule | Mid-point of each stretch >120 m off the normal route, max 8 | `src/handoff.ts` |
| API key | Held as a secret by the Cloudflare proxy; never in the app | `proxy/` |
| Done criteria | 4 landmark test trips pass live (below); add your own real trips | `tests/live-trips.test.ts` |

## How a route is chosen (decided 2026-09-24)
Each risk level is worth a number of detour minutes (placeholder: risk 1 = 3,
risk 2 = 8, risk 3 = 15; `detourWorthMinutes` in `src/config.ts`). A route's
score = driving minutes + that value for every active zone it passes through.
SafeRoute tries the normal route and several avoiding routes and takes the
lowest score. If no detour is worth it, the route goes through the zone and
the app says so. Suburb areas currently count the same as a single spot of
the same risk.

## Test trips (live run 2026-10-28 with the researched hotspot list)
Run with `ORS_KEY=... npx vitest run tests/live-trips.test.ts`.

| Trip | Normal (score) | Chosen (score) | What it decided |
| --- | --- | --- | --- |
| Centurion Mall to Menlyn Maine, 20:30 | 15 min (33) | 16 min (22) | Stays on the N1 and only skips the Garsfontein Rd off-ramp (risk 3); still passes two risk-1 off-ramps |
| Union Buildings to Centurion Mall, 18:00 | 24 min (48) | 30 min (33) | Goes round Fountains Circle and the Eeufees and Jean Ave interchanges; passes one risk-1 off-ramp |
| Union Buildings to Wonderboom Airport, 21:00 | 27 min (27) | 27 min (27) | No researched hotspot on the way (the old Wonderboompoort pin had no recent evidence) |
| Hatfield Gautrain to Woodlands Boulevard, 19:30 | 23 min (37) | 28 min (28) | Avoids every zone, including De Villebois Mareuil / Garsfontein and Garsfontein / Delfi |

## Off-ramp pins no longer block the freeway (resolved 2026-10-28)
An avoid zone blocks every road inside it. Off-ramp hotspots are now small
circles (25–60 m) on the cross street at each ramp end, kept at least 20 m clear
of the freeway, so a route can stay on the freeway and only avoid the exit.
