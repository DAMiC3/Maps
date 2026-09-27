# SafeRoute Pretoria

Stage 1 of the SafeRoute blueprint (docs/BLUEPRINT.md): a static web app
(home-screen PWA) that routes around crime hotspots via OpenRouteService and
hands off to Google Maps with a `maps/dir/?api=1` link plus via-points.

- Stack: Vite + TypeScript (no framework), Leaflet + OSM tiles, Vitest (jsdom).
- Run `npm test` and `npm run build` (includes `tsc --noEmit`) before finishing a change.
- Keep pure logic (kml, zones, geo, handoff) free of DOM/UI so it stays testable;
  UI wiring lives only in `src/main.ts`.
- Numbers for open decisions live in `src/config.ts`; don't hard-code them elsewhere.
- Hotspots ship with the app in `src/data/hotspots.kml` (owner decision 2026-09-24);
  users do not load or manage zones. Incident notes stay in localStorage.
- The OpenRouteService key lives only as the `ORS_KEY` secret on the Cloudflare
  Worker in `proxy/`. The app calls the proxy; never put the key in the repo or the
  site bundle. Proxy request checks live in `proxy/src/validate.ts` (unit tested).
- Wording must never promise safety ("reduces exposure", not "safe").
- Gender-based violence incidents are deliberately excluded from routing data.
- Later stages (daily feed, community reports, business API) are NOT in scope yet.
