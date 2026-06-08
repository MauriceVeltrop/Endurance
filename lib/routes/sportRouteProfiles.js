// lib/routes/sportRouteProfiles.js
// Small, explicit sport routing profiles. Keep this file boring on purpose.

export const SPORT_ROUTE_PROFILES = {
  running: {
    label: "Running",
    routingProvider: "graphhopper",
    providerProfiles: ["foot"],
    fallbackProviderProfiles: [],
    maxDetourFactor: 2.0,

    // Only provider-side GraphHopper routing rules live here.
    // Endurance should not use separate Running quality conditions to steer routing.
    graphhopperAlternativeRoute: {
      max_paths: 3,
      max_weight_factor: 2.0,
      max_share_factor: 0.6,
    },

    graphhopperCustomModel: {
      distance_influence: 110,
      priority: [
        { if: "road_class == motorway", multiply_by: "0" },
        { if: "road_class == trunk", multiply_by: "0.01" },
        { if: "road_class == primary", multiply_by: "0.10" },
        { if: "road_class == secondary", multiply_by: "0.28" },
        { if: "road_class == tertiary", multiply_by: "0.55" },

        { if: "road_class == footway", multiply_by: "3.00" },
        { if: "road_class == cycleway", multiply_by: "2.50" },
        { if: "road_class == residential", multiply_by: "2.00" },
        { if: "road_class == living_street", multiply_by: "2.00" },
        { if: "road_class == pedestrian", multiply_by: "1.80" },
        { if: "road_class == service", multiply_by: "0.35" },
        { if: "road_class == path", multiply_by: "0.05" },
        { if: "road_class == track", multiply_by: "0.01" },
        { if: "road_class == steps", multiply_by: "0.01" },

        { if: "road_environment == tunnel", multiply_by: "0.05" },
        { if: "road_environment == bridge", multiply_by: "0.85" },
        { if: "road_environment == park", multiply_by: "1.15" },

        { if: "surface == asphalt", multiply_by: "1.70" },
        { if: "surface == concrete", multiply_by: "1.55" },
        { if: "surface == paved", multiply_by: "1.45" },
        { if: "surface == paving_stones", multiply_by: "1.25" },
        { if: "surface == cobblestone", multiply_by: "0.45" },
        { if: "surface == unknown", multiply_by: "0.03" },
        { if: "surface == missing", multiply_by: "0.03" },

        { if: "surface == compacted", multiply_by: "0.08" },
        { if: "surface == fine_gravel", multiply_by: "0.04" },
        { if: "surface == gravel", multiply_by: "0.02" },
        { if: "surface == unpaved", multiply_by: "0.01" },
        { if: "surface == ground", multiply_by: "0.01" },
        { if: "surface == dirt", multiply_by: "0.01" },
        { if: "surface == grass", multiply_by: "0.01" },
        { if: "surface == sand", multiply_by: "0.01" },
        { if: "surface == mud", multiply_by: "0.01" },
        { if: "surface == woodchips", multiply_by: "0.01" },
      ],
      speed: [
        { if: "surface == asphalt", limit_to: "13" },
        { if: "surface == concrete", limit_to: "12" },
        { if: "surface == paved", limit_to: "12" },
        { if: "surface == unknown", limit_to: "3" },
        { if: "surface == missing", limit_to: "3" },
        { if: "surface == compacted", limit_to: "5" },
        { if: "surface == fine_gravel", limit_to: "4" },
        { if: "surface == gravel", limit_to: "3" },
        { if: "surface == ground", limit_to: "2" },
        { if: "surface == dirt", limit_to: "2" },
        { if: "surface == grass", limit_to: "2" },
        { if: "surface == sand", limit_to: "2" },
      ],
    },
  },

  trail_running: {
    label: "Trail Running",
    providerProfiles: ["foot-hiking", "foot-walking"],
    preferences: ["recommended", "shortest"],
    maxDetourFactor: 1.5,
    suitableSurfaces: ["ground", "dirt", "earth", "grass", "gravel", "fine_gravel", "compacted", "woodchips"],
    unsuitableSurfaces: ["sand", "mud"],
    suitableWaytypes: ["path", "track", "footway"],
    unsuitableWaytypes: ["state_road", "road"],
  },

  road_cycling: {
    label: "Road Cycling",
    providerProfiles: ["cycling-road", "cycling-regular"],
    preferences: ["recommended", "fastest"],
    maxDetourFactor: 1.18,
    suitableSurfaces: ["asphalt", "paved", "concrete"],
    unsuitableSurfaces: ["ground", "dirt", "mud", "sand", "grass"],
    suitableWaytypes: ["cycleway", "street", "road"],
    unsuitableWaytypes: ["path", "steps"],
  },

  gravel_cycling: {
    label: "Gravel Cycling",
    providerProfiles: ["cycling-mountain", "cycling-regular"],
    preferences: ["recommended", "shortest"],
    maxDetourFactor: 1.55,
    suitableSurfaces: ["gravel", "fine_gravel", "compacted", "ground", "dirt", "earth"],
    unsuitableSurfaces: ["sand", "mud", "grass"],
    suitableWaytypes: ["track", "path", "cycleway"],
    unsuitableWaytypes: ["steps", "state_road"],
  },

  mountain_biking: {
    label: "Mountain Biking",
    providerProfiles: ["cycling-mountain", "foot-hiking", "cycling-regular"],
    preferences: ["recommended", "shortest"],
    maxDetourFactor: 1.65,
    suitableSurfaces: ["ground", "dirt", "earth", "grass", "gravel", "fine_gravel", "woodchips", "compacted"],
    unsuitableSurfaces: ["sand", "mud"],
    suitableWaytypes: ["path", "track"],
    unsuitableWaytypes: ["state_road", "steps"],
  },

  walking: {
    label: "Walking",
    providerProfiles: ["foot-walking", "foot-hiking"],
    preferences: ["recommended", "shortest"],
    maxDetourFactor: 1.4,
    suitableSurfaces: ["asphalt", "paved", "concrete", "paving_stones", "compacted", "fine_gravel", "ground"],
    unsuitableSurfaces: ["mud", "sand"],
    suitableWaytypes: ["footway", "path", "pedestrian", "track"],
    unsuitableWaytypes: ["state_road"],
  },
};

export function normalizeSportId(value) {
  const key = String(value || "running").toLowerCase();
  if (key === "trailrunning") return "trail_running";
  if (key === "roadcycling") return "road_cycling";
  if (key === "gravel") return "gravel_cycling";
  if (key === "mtb") return "mountain_biking";
  return SPORT_ROUTE_PROFILES[key] ? key : "running";
}

export function getSportRouteProfile(value) {
  return SPORT_ROUTE_PROFILES[normalizeSportId(value)] || SPORT_ROUTE_PROFILES.running;
}

export function getRoutingProvider(value) {
  return getSportRouteProfile(value).routingProvider || "ors";
}

export function getProviderProfiles(value) {
  const profile = getSportRouteProfile(value);
  return profile.routingProvider === "graphhopper"
    ? profile.fallbackProviderProfiles || ["foot-walking"]
    : profile.providerProfiles;
}

export function getRoutingPreferences(value) {
  return getSportRouteProfile(value).preferences;
}

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
  8: "compacted",
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
