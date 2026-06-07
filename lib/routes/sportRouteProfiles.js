export const PROFILE_CANDIDATES = {
  running: ["foot-walking", "cycling-regular", "cycling-road"],
  trail_running: ["foot-hiking", "foot-walking"],
  trailrunning: ["foot-hiking", "foot-walking"],
  walking: ["foot-walking", "foot-hiking"],
  hiking: ["foot-hiking", "foot-walking"],

  road_cycling: ["cycling-road", "cycling-regular"],
  roadcycling: ["cycling-road", "cycling-regular"],
  cycling: ["cycling-regular", "cycling-road"],
  gravel_cycling: ["cycling-regular", "cycling-mountain"],
  gravel: ["cycling-regular", "cycling-mountain"],
  mountain_biking: ["cycling-mountain", "cycling-regular"],
  mtb: ["cycling-mountain", "cycling-regular"],
};

export const SPORT_ROUTE_QUALITY = {
  running: {
    maxDetourFactor: 1.18,
    alternativeCount: 3,
    preferences: ["recommended", "fastest", "shortest"],
    // Running in Endurance means paved / smooth by default.
    // Trail Running is the sport choice for off-road paths and tracks.
    rewardWayTypes: ["cycleway", "footway", "pedestrian", "street", "road"],
    avoidWayTypes: ["path", "track", "state_road", "steps"],
  },
  trail_running: {
    maxDetourFactor: 1.4,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["path", "track", "footway"],
    avoidWayTypes: ["state_road", "road", "street"],
  },
  trailrunning: {
    maxDetourFactor: 1.4,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["path", "track", "footway"],
    avoidWayTypes: ["state_road", "road", "street"],
  },
  walking: {
    maxDetourFactor: 1.3,
    alternativeCount: 2,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["footway", "path", "track", "pedestrian"],
    avoidWayTypes: ["state_road"],
  },
  hiking: {
    maxDetourFactor: 1.35,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["path", "track", "footway"],
    avoidWayTypes: ["state_road", "road"],
  },
  road_cycling: {
    maxDetourFactor: 1.12,
    alternativeCount: 2,
    preferences: ["recommended", "fastest"],
    rewardWayTypes: ["cycleway", "street", "road"],
    avoidWayTypes: ["path", "steps", "ferry"],
  },
  roadcycling: {
    maxDetourFactor: 1.12,
    alternativeCount: 2,
    preferences: ["recommended", "fastest"],
    rewardWayTypes: ["cycleway", "street", "road"],
    avoidWayTypes: ["path", "steps", "ferry"],
  },
  cycling: {
    maxDetourFactor: 1.18,
    alternativeCount: 2,
    preferences: ["recommended", "fastest"],
    rewardWayTypes: ["cycleway", "street", "road", "track"],
    avoidWayTypes: ["steps", "ferry"],
  },
  gravel_cycling: {
    maxDetourFactor: 1.3,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["track", "path", "cycleway", "road"],
    avoidWayTypes: ["state_road", "steps"],
  },
  gravel: {
    maxDetourFactor: 1.3,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["track", "path", "cycleway", "road"],
    avoidWayTypes: ["state_road", "steps"],
  },
  mountain_biking: {
    maxDetourFactor: 1.35,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["track", "path"],
    avoidWayTypes: ["state_road", "road", "steps"],
  },
  mtb: {
    maxDetourFactor: 1.35,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["track", "path"],
    avoidWayTypes: ["state_road", "road", "steps"],
  },
};

export const WAYTYPE_LABELS = {
  0: "unknown",
  1: "state_road",
  2: "road",
  3: "street",
  4: "path",
  5: "track",
  6: "cycleway",
  7: "footway",
  8: "steps",
  9: "ferry",
  10: "construction",
  11: "pedestrian",
};

export const SURFACE_LABELS = {
  0: "unknown",
  1: "paved",
  2: "unpaved",
  3: "asphalt",
  4: "concrete",
  5: "cobblestone",
  6: "metal",
  7: "wood",
  8: "compacted_gravel",
  9: "fine_gravel",
  10: "gravel",
  11: "dirt",
  12: "ground",
  13: "ice",
  14: "paving_stones",
  15: "sand",
  16: "woodchips",
  17: "grass",
  18: "grass_paver",
};

export const SPORT_SURFACE_RULES = {
  running: {
    pavedFirst: true,
    // Road running should stay on paved/smooth surfaces where alternatives exist.
    ideal: ["asphalt", "paved", "concrete", "paving_stones", "likely_paved", "estimated_paved_surface"],
    acceptable: ["compacted_gravel", "fine_gravel", "cobblestone", "likely_compacted"],
    avoid: ["unpaved", "gravel", "dirt", "ground", "sand", "woodchips", "grass", "ice", "likely_unpaved", "likely_gravel", "estimated_trail_surface", "estimated_gravel_surface"],
    maxUnpavedRatio: 0.10,
    minIdealRatio: 0.62,
  },
  trail_running: {
    ideal: ["ground", "dirt", "unpaved", "compacted_gravel", "fine_gravel", "gravel", "likely_unpaved", "likely_gravel", "estimated_trail_surface", "estimated_gravel_surface"],
    acceptable: ["asphalt", "paved", "concrete", "likely_paved", "likely_compacted", "estimated_paved_surface"],
    avoid: ["sand", "ice"],
  },
  trailrunning: {
    ideal: ["ground", "dirt", "unpaved", "compacted_gravel", "fine_gravel", "gravel", "likely_unpaved", "likely_gravel", "estimated_trail_surface", "estimated_gravel_surface"],
    acceptable: ["asphalt", "paved", "concrete", "likely_paved", "likely_compacted", "estimated_paved_surface"],
    avoid: ["sand", "ice"],
  },
  walking: {
    ideal: ["asphalt", "paved", "concrete", "paving_stones", "compacted_gravel", "fine_gravel", "likely_paved", "likely_compacted", "estimated_paved_surface"],
    acceptable: ["ground", "dirt", "gravel", "likely_unpaved"],
    avoid: ["sand", "ice"],
  },
  road_cycling: {
    pavedFirst: true,
    ideal: ["asphalt", "paved", "concrete", "likely_paved", "estimated_paved_surface"],
    acceptable: ["paving_stones", "cobblestone"],
    avoid: ["unpaved", "compacted_gravel", "fine_gravel", "gravel", "dirt", "ground", "sand", "grass", "woodchips"],
    maxUnpavedRatio: 0.08,
  },
  roadcycling: {
    pavedFirst: true,
    ideal: ["asphalt", "paved", "concrete", "likely_paved", "estimated_paved_surface"],
    acceptable: ["paving_stones", "cobblestone"],
    avoid: ["unpaved", "compacted_gravel", "fine_gravel", "gravel", "dirt", "ground", "sand", "grass", "woodchips"],
    maxUnpavedRatio: 0.08,
  },
  cycling: {
    ideal: ["asphalt", "paved", "concrete", "paving_stones", "likely_paved", "estimated_paved_surface"],
    acceptable: ["compacted_gravel", "fine_gravel", "likely_compacted"],
    avoid: ["sand", "grass", "woodchips", "ice"],
  },
  gravel_cycling: {
    ideal: ["compacted_gravel", "fine_gravel", "gravel", "unpaved", "likely_gravel", "likely_unpaved", "estimated_gravel_surface", "estimated_trail_surface"],
    acceptable: ["asphalt", "paved", "concrete", "ground", "dirt", "likely_paved", "likely_compacted", "estimated_paved_surface"],
    avoid: ["sand", "grass", "woodchips", "ice"],
  },
  gravel: {
    ideal: ["compacted_gravel", "fine_gravel", "gravel", "unpaved", "likely_gravel", "likely_unpaved", "estimated_gravel_surface", "estimated_trail_surface"],
    acceptable: ["asphalt", "paved", "concrete", "ground", "dirt", "likely_paved", "likely_compacted", "estimated_paved_surface"],
    avoid: ["sand", "grass", "woodchips", "ice"],
  },
  mountain_biking: {
    ideal: ["ground", "dirt", "unpaved", "gravel", "compacted_gravel", "likely_unpaved", "likely_gravel", "estimated_trail_surface", "estimated_gravel_surface"],
    acceptable: ["asphalt", "paved", "concrete", "likely_paved", "likely_compacted", "estimated_paved_surface"],
    avoid: ["ice"],
  },
  mtb: {
    ideal: ["ground", "dirt", "unpaved", "gravel", "compacted_gravel", "likely_unpaved", "likely_gravel", "estimated_trail_surface", "estimated_gravel_surface"],
    acceptable: ["asphalt", "paved", "concrete", "likely_paved", "likely_compacted", "estimated_paved_surface"],
    avoid: ["ice"],
  },
};


export const ROUTE_OPTIMIZATION_MODES = {
  balanced: {
    label: "Sport profile",
    maxDetourMultiplier: 1,
    scoreAdjustments: {
      idealSurface: 0,
      acceptableSurface: 0,
      avoidedSurface: 0,
      unknownSurface: 0,
      detour: 0,
    },
  },
};

export function normalizeSportKey(sportId) {
  return String(sportId || "").toLowerCase();
}

export function routeQualityForSportConfig(sportId) {
  return SPORT_ROUTE_QUALITY[normalizeSportKey(sportId)] || SPORT_ROUTE_QUALITY.running;
}

export function surfaceRulesForSportConfig(sportId) {
  return SPORT_SURFACE_RULES[normalizeSportKey(sportId)] || SPORT_SURFACE_RULES.running;
}

export function optimizationModeConfig(mode) {
  return ROUTE_OPTIMIZATION_MODES[String(mode || "balanced")] || ROUTE_OPTIMIZATION_MODES.balanced;
}

export function effectiveMaxDetourFactor(sportId, mode) {
  const base = Number(routeQualityForSportConfig(sportId).maxDetourFactor || 1.2);
  const multiplier = Number(optimizationModeConfig(mode).maxDetourMultiplier || 1);
  return Math.max(1.04, Number((base * multiplier).toFixed(3)));
}

export function profilesForSportConfig(sportId, requestedProfile) {
  const requested = String(requestedProfile || "").trim();
  const defaults = PROFILE_CANDIDATES[normalizeSportKey(sportId)] || ["foot-walking", "foot-hiking"];
  return [...new Set([requested, ...defaults].filter(Boolean))];
}

export function preferencesForSportConfig(sportId) {
  const base = routeQualityForSportConfig(sportId).preferences || ["recommended"];
  return [...new Set(base.filter(Boolean))];
}
