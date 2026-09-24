// Tunable numbers for Stage 1. These are PLACEHOLDER defaults for the open
// decisions listed in docs/BLUEPRINT.md ("Uncertainties before building").
// Change them here once the owner has decided.

export type Risk = 1 | 2 | 3;

export const config = {
  /** No-go circle radius in metres, per risk level. */
  radiusByRisk: { 1: 300, 2: 600, 3: 1000 } as Record<Risk, number>,

  /** "After dark" window for night_only zones, local 24h hours. Wraps midnight. */
  night: { startHour: 18, endHour: 6 },

  /** "Prefer to avoid" zones are dropped if avoiding them costs more than this. */
  maxExtraMinutesForPreferZones: 10,

  /** Sides of the polygon used to approximate each circle. */
  circleSegments: 16,

  /** A safe-route point this far (m) from the normal route counts as a detour. */
  detourThresholdMeters: 120,

  /** Google Maps URLs accept a limited number of waypoints; keep it small. */
  maxViaPoints: 8,

  ors: {
    // The blueprint mentions a newer address (api.heigit.org). Verify which is
    // current before relying on it; both are configurable here.
    baseUrl: "https://api.openrouteservice.org",
    profile: "driving-car",
    /** Bias address search towards Pretoria. */
    focus: { lat: -25.7479, lng: 28.2293 },
    country: "ZA",
  },

  /** Starting view for the preview map (Pretoria). */
  mapCenter: { lat: -25.7479, lng: 28.2293, zoom: 11 },
};
