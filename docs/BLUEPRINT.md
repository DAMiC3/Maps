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
| Real hotspot list | Researched draft in `my-hotspots-draft.kml` (28 zones, local only, needs review) | your My Maps |
| KML rule format | `risk=3; night_only=yes; last=YYYY-MM-DD` | `src/kml.ts` |
| Radius per risk | 300 / 600 / 1000 m | `src/config.ts` |
| "After dark" hours | 18:00–06:00 | `src/config.ts` |
| Detour minutes worth per risk | 3 / 8 / 15 min (risk 1 / 2 / 3) | `src/config.ts` |
| ORS avoid-area size limits | 200 km² area / 20 km extent (published). Zones over the limit, or containing the start/end, are skipped with a warning; total area is filled highest risk first (unclear if the limit is per polygon or total, so treated as total) | `src/zones.ts` |
| ORS base URL | Resolved: api.heigit.org/openrouteservice and /pelias/v1 (old host deprecated 2026-04-28) | `src/config.ts` |
| Zones sent per trip | Only zones within 5 km of the normal route | `src/config.ts` |
| Via-point rule | Mid-point of each stretch >120 m off the normal route, max 8 | `src/handoff.ts` |
| API key visible in static page | Accepted for personal use; entered in Settings | `src/storage.ts` |
| Done criteria | 4 landmark test trips pass live (below); add your own real trips | `tests/live-trips.test.ts` |

## How a route is chosen (decided 2026-09-24)
Each risk level is worth a number of detour minutes (placeholder: risk 1 = 3,
risk 2 = 8, risk 3 = 15; `detourWorthMinutes` in `src/config.ts`). A route's
score = driving minutes + that value for every active zone it passes through.
SafeRoute tries the normal route and several avoiding routes and takes the
lowest score. If no detour is worth it, the route goes through the zone and
the app says so. Suburb areas currently count the same as a single spot of
the same risk.

## Test trips (live run 2026-09-24 with the draft hotspot list)
Run with `ORS_KEY=... npx vitest run tests/live-trips.test.ts` (uses `my-hotspots-draft.kml` if present).

| Trip | Normal (score) | Chosen (score) | What it decided |
| --- | --- | --- | --- |
| Centurion Mall to Menlyn Maine, 20:30 | 15 min (46) | 29 min (44) | Leaves the N1 to skip the Rigel and John Vorster off-ramps. Garsfontein can't be avoided: Menlyn Maine is inside its 1 km circle |
| Union Buildings to Centurion Mall, 18:00 | 24 min (64) | 32 min (56) | Goes round Fountains Circle, Jean Ave and Eeufees; still crosses the CBD, Sunnyside and Pretoria West areas |
| Union Buildings to Wonderboom Airport, 21:00 | 27 min (43) | 31 min (31) | Avoids every zone, including Wonderboompoort |
| Hatfield Gautrain to Woodlands Boulevard, 19:30 | 23 min (78) | 36 min (52) | Avoids all N1 off-ramps; start and end zones can't be avoided |

## Known design question: off-ramp pins also block the freeway
An avoid zone blocks every road inside it. A pin on an interchange therefore
also blocks the freeway passing through it, not just the off-ramp. Confirmed by
the live test trips: N1 trips leave the freeway entirely and take 13-14 min longer. Possible fixes: move
off-ramp pins onto the local road at the ramp end and use a smaller radius
for them.
