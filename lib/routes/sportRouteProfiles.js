// lib/routes/sportRouteProfiles.js
// Small, explicit sport routing profiles. Keep this file boring on purpose.

export const SPORT_ROUTE_PROFILES = {
  running: {
    label: "Running",
    routingProvider: "ors",
    providerProfiles: ["foot-walking"],
    preferences: ["recommended", "shortest"],
    maxDetourFactor: 1.6,

    // Running should prefer predictable paved lines: sidewalks/footways,
    // residential streets, pedestrian links and safe cycleways.
    // Unknown OSM surface is no longer treated as fully neutral, and mud/dirt
    // are deliberately punished hard so road-running does not drift onto trails.
    suitableSurfaces: ["asphalt", "concrete", "paved", "paving_stones", "sett"],
    acceptableSurfaces: ["compacted", "fine_gravel"],
    unsuitableSurfaces: ["mud", "dirt", "ground", "earth", "grass", "sand", "unpaved", "gravel", "woodchips", "ice"],
    suitableWaytypes: ["footway", "pedestrian", "cycleway", "living_street", "residential", "street"],
    acceptableWaytypes: ["road"],
    unsuitableWaytypes: ["track", "path", "state_road", "steps"],
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
  return getSportRouteProfile(value).providerProfiles || ["foot-walking"];
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
