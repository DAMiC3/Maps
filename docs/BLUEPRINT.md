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
| Real hotspot list | 3 sample pins in `docs/sample-hotspots.kml` (approximate coords) | your My Maps |
| KML rule format | `risk=3; night_only=yes; mode=avoid; last=YYYY-MM-DD` | `src/kml.ts` |
| Radius per risk | 300 / 600 / 1000 m | `src/config.ts` |
| "After dark" hours | 18:00–06:00 | `src/config.ts` |
| Max extra minutes for "prefer" zones | 10 | `src/config.ts` |
| ORS avoid-area size limits | 200 km² area / 20 km extent (published). Zones over the limit, or containing the start/end, are skipped with a warning; total area is filled avoid-first, then by risk (unclear if the limit is per polygon or total, so treated as total) | `src/zones.ts` |
| ORS base URL | Resolved: api.heigit.org/openrouteservice and /pelias/v1 (old host deprecated 2026-04-28) | `src/config.ts` |
| Zones sent per trip | Only zones within 5 km of the normal route | `src/config.ts` |
| Zones sent per trip | Only zones within 5 km of the normal route | `src/config.ts` |
| Via-point rule | Mid-point of each stretch >120 m off the normal route, max 8 | `src/handoff.ts` |
| API key visible in static page | Accepted for personal use; entered in Settings | `src/storage.ts` |
| Done criteria | TODO: 3–5 real test trips with expected results | below |

## Test trips (fill in)
- [ ] e.g. Home → school at 18:00 must avoid the N1 Garsfontein off-ramp
- [ ]
- [ ]
