import { getSportLabel } from "../trainingHelpers";
import { calculateRouteMetrics } from "../routeMetrics";

export const FALLBACK_ROUTE_SPORTS = [
  "running",
  "road_cycling",
  "gravel_cycling",
  "mountain_biking",
  "walking",
  "kayaking",
];

export const METHOD_ORDER = ["draw", "wizard", "upload"];

export const METHOD_DETAILS = {
  draw: {
    title: "Draw Route",
    eyebrow: "Manual",
    icon: "✏️",
    action: "Open fullscreen editor",
    body: "Build the route yourself on the map. The line follows roads and paths automatically.",
  },
  wizard: {
    title: "Route Wizard",
    eyebrow: "Smart",
    icon: "✨",
    action: "Set up route idea",
    body: "Let Endurance create a sport-specific route based on distance, start point and terrain.",
  },
  upload: {
    title: "Upload GPX",
    eyebrow: "Import",
    icon: "⬆️",
    action: "Choose GPX file",
    body: "Import an existing route from Garmin, Komoot, Strava, RouteYou or another planner.",
  },
};

const METHOD_COPY_BY_SPORT = {
  running: {
    draw: "Draw a (trail)running route yourself and let the app snap it to logical roads and paths.",
    wizard: "Generate a (trail)running loop with the standard foot-walking router, then review the route quality.",
    upload: "Import a running or trail running GPX from Garmin, Strava, Komoot or another planner.",
  },
  trail_running: {
    draw: "Draw a (trail)running route yourself and let the app snap it to logical roads and paths.",
    wizard: "Generate a (trail)running loop with the standard foot-walking router, then review the route quality.",
    upload: "Import a running or trail running GPX from Garmin, Strava, Komoot or another planner.",
  },
  road_cycling: {
    draw: "Draw a road cycling route over asphalt and logical cycling roads.",
    wizard: "Generate a fast road loop that prefers safe asphalt and cycling infrastructure.",
    upload: "Import a road cycling GPX from Garmin, Strava, Komoot or RideWithGPS.",
  },
  gravel_cycling: {
    draw: "Draw a gravel route and refine the line around roads, tracks and forest roads.",
    wizard: "Generate a gravel loop with compacted paths, gravel surfaces and quiet links.",
    upload: "Import a gravel GPX with known surfaces and sectors.",
  },
  mountain_biking: {
    draw: "Draw an MTB route manually and keep control over technical sections.",
    wizard: "Generate an MTB-focused route using trail logic and technical terrain signals.",
    upload: "Import an MTB GPX with singletracks, climbs and known trail sections.",
  },
  walking: {
    draw: "Draw a walking route through safe paths, nature and comfortable links.",
    wizard: "Generate a walking loop focused on comfort, nature and low-traffic paths.",
    upload: "Import a walking or hiking GPX from an existing route source.",
  },
  kayaking: {
    draw: "Sketch a water route manually and save it as a kayaking route.",
    wizard: "Later: generate water-specific routes from suitable launch points and waterways.",
    upload: "Import an existing kayaking GPX from a known route or activity.",
  },
};

const SPORT_ROUTE_PROFILES = {
  running: { title: "(Trail)Running profile", focus: "Foot-walking routing with route quality analysis." },
  trail_running: { title: "(Trail)Running profile", focus: "Foot-walking routing with route quality analysis." },
  road_cycling: { title: "Road cycling profile", focus: "Fast" },
  gravel_cycling: { title: "Gravel profile", focus: "Adventure" },
  mountain_biking: { title: "MTB profile", focus: "Technical" },
  walking: { title: "Walking / hiking profile", focus: "Comfortable paths, nature and safety." },
  kayaking: { title: "Kayaking profile", focus: "Water-based routes." },
};

export function methodCopyFor(methodId, sportId) {
  return METHOD_COPY_BY_SPORT[sportId]?.[methodId] || METHOD_DETAILS[methodId]?.body || "Choose this route method.";
}

export function recommendedMethodFor(sportId) {
  if (["running", "trail_running", "road_cycling", "walking"].includes(sportId)) return "draw";
  if (["gravel_cycling", "mountain_biking"].includes(sportId)) return "upload";
  return "draw";
}

export function initialForm() {
  return {
    sport_id: "",
    method: "",
    title: "",
    title_is_auto: true,
    description: "",
    visibility: "team",
    distance_km: "",
    elevation_gain_m: "",
    gpx_file_url: "",
    route_points: null,
  };
}

export function sportIconFor(sportId) {
  const map = {
    running: "/training-images/running.svg",
    trail_running: "/training-images/running.svg",
    road_cycling: "/training-images/road-cycling.svg",
    gravel_cycling: "/training-images/gravel-cycling.svg",
    mountain_biking: "/training-images/mountain-biking.svg",
    walking: "/training-images/walking.svg",
    kayaking: "/training-images/kayaking.svg",
    swimming: "/training-images/swimming.svg",
  };

  return map[sportId] || "/training-images/training.svg";
}

export function routeSportImageFor(sportId) {
  const map = {
    running: "/route-images/running.jpg",
    trail_running: "/route-images/running.jpg",
    road_cycling: "/route-images/road-cycling.jpg",
    gravel_cycling: "/route-images/gravel-cycling.jpg",
    mountain_biking: "/route-images/mountain-biking.jpg",
    walking: "/route-images/walking.jpg",
  };

  return map[sportId] || "/route-images/running.jpg";
}

export function routeSportShortLabel(sportId) {
  const map = {
    running: "Run",
    trail_running: "Run",
    road_cycling: "Road",
    gravel_cycling: "Gravel",
    mountain_biking: "MTB",
    walking: "Walk",
  };

  return map[sportId] || getSportLabel(sportId);
}

export function routeProfileFor(sportId) {
  return SPORT_ROUTE_PROFILES[sportId] || {
    title: `${getSportLabel(sportId)} route profile`,
    focus: "Sport-specific route creation.",
  };
}
