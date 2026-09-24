// Tunable numbers for Stage 1. These are PLACEHOLDER defaults for the open
// decisions listed in docs/BLUEPRINT.md ("Uncertainties before building").
// Change them here once the owner has decided.

export type Risk = 1 | 2 | 3;

export const config = {
  /** No-go circle radius in metres, per risk level. */
  radiusByRisk: { 1: 300, 2: 600, 3: 1000 } as Record<Risk, number>,

  /** "After dark" window for night_only zones, local 24h hours. Wraps midnight. */
  night: { startHour: 18, endHour: 6 },

  /**
   * How many extra driving minutes it is worth to avoid ONE zone of each risk
   * level. A route's cost = driving minutes + this value for every zone it
   * passes through; the cheapest route wins. So a detour around a risk-3 spot
   * is taken if it costs up to 15 min, and two risk-2 spots justify 16 min.
   */
  detourWorthMinutes: { 1: 3, 2: 8, 3: 15 } as Record<Risk, number>,

  /** Sides of the polygon used to approximate each circle. */
  circleSegments: 16,

  /** A safe-route point this far (m) from the normal route counts as a detour. */
  detourThresholdMeters: 120,

  /** Google Maps URLs accept a limited number of waypoints; keep it small. */
  maxViaPoints: 8,

  /** Only zones within this distance (m) of the normal route are sent to ORS. */
  corridorMeters: 5000,

  ors: {
    // api.openrouteservice.org was deprecated on 2026-04-28 (reduced quota).
    // No trailing slashes: they cause 405 errors on the new host.
    routingBaseUrl: "https://api.heigit.org/openrouteservice",
    geocodeBaseUrl: "https://api.heigit.org/pelias/v1",
    profile: "driving-car",
    /** How far (m) ORS may search for a road from start/end (its default is 350). */
    snapRadiusMeters: 1000,
    /** Published avoid_polygons limits (openrouteservice.org/restrictions). */
    maxAvoidAreaKm2: 200,
    maxAvoidExtentKm: 20,
    /** Bias address search towards Pretoria. */
    focus: { lat: -25.7479, lng: 28.2293 },
    country: "ZA",
  },

  /** Starting view for the preview map (Pretoria). */
  mapCenter: { lat: -25.7479, lng: 28.2293, zoom: 11 },
};
