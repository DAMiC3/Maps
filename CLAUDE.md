# SafeRoute Pretoria

Stage 1 of the SafeRoute blueprint (docs/BLUEPRINT.md): a static web app
(home-screen PWA) that routes around crime hotspots via OpenRouteService and
hands off to Google Maps with a `maps/dir/?api=1` link plus via-points.

- Stack: Vite + TypeScript (no framework), Leaflet + OSM tiles, Vitest (jsdom).
- Run `npm test` and `npm run build` (includes `tsc --noEmit`) before finishing a change.
- Keep pure logic (kml, zones, geo, handoff) free of DOM/UI so it stays testable;
  UI wiring lives only in `src/main.ts`.
- Numbers for open decisions live in `src/config.ts`; don't hard-code them elsewhere.
- Privacy: no hotspot data in the repo or hosted site. User KML, API key and notes
  stay in localStorage. Never commit real hotspot files (`.gitignore` covers `my-hotspots*.kml`).
- Wording must never promise safety ("reduces exposure", not "safe").
- Gender-based violence incidents are deliberately excluded from routing data.
- Later stages (daily feed, community reports, business API) are NOT in scope yet.
