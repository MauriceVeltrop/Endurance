import { getSportLabel } from "../trainingHelpers";
import { calculateRouteMetrics } from "../routeMetrics";

export const FALLBACK_ROUTE_SPORTS = [
  "running",
  "trail_running",
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
    draw: "Draw a paved running route yourself and let the app snap it to logical roads and paths.",
    wizard: "Generate a paved running loop with quiet streets, parks and fluent running lines.",
    upload: "Import a road-running GPX from Garmin, Strava, Komoot or another planner.",
  },
  trail_running: {
    draw: "Shape your own trail route over forest paths, tracks and technical sections.",
    wizard: "Generate a trail-focused loop with forest paths, unpaved surfaces and elevation.",
    upload: "Import a trail GPX with known paths, climbs and terrain from another platform.",
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
  running: { title: "Road running profile", focus: "Road" },
  trail_running: { title: "Trail running profile", focus: "Trail" },
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
  if (["running", "road_cycling", "walking"].includes(sportId)) return "draw";
  if (["trail_running", "gravel_cycling", "mountain_biking"].includes(sportId)) return "upload";
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
    trail_running: "/training-images/trail-running.svg",
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
    trail_running: "/route-images/trail-running.jpg",
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
    trail_running: "Trail",
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

export function normalizeRoutePoints(routePoints) {
  if (!routePoints) return [];
  if (Array.isArray(routePoints)) return routePoints;
  if (Array.isArray(routePoints.points)) return routePoints.points;
  return [];
}

export function buildEditableRouteDraft(form, profileId) {
  const routePoints = form?.route_points || null;
  const points = normalizeRoutePoints(routePoints);

  // Reopen Map Editor must preserve the draw editor's original control points.
  // Control points are the source of truth; geometry is only the rendered route.
  // Prefer explicit control_points, then waypoints. Only when neither exists do
  // we fall back to a minimal start/finish pair so the editor can open without
  // treating the full geometry as control points.
  const explicitControls = normalizeRoutePoints(routePoints?.control_points);
  const waypointControls = normalizeRoutePoints(routePoints?.waypoints);
  const storedWaypoints = explicitControls.length >= 2
    ? explicitControls
    : waypointControls.length >= 2
      ? waypointControls
      : points.length >= 2
        ? [points[0], points[points.length - 1]]
        : [];

  const metrics = calculateRouteMetrics(points);
  const distanceKm = form?.distance_km || routePoints?.distance_km || metrics.distance_km || "";
  const elevationGainM = form?.elevation_gain_m || routePoints?.elevation_gain_m || metrics.elevation_gain_m || "";

  return {
    sport_id: form?.sport_id || "",
    title: form?.title || "",
    title_is_auto: form?.title_is_auto !== false,
    description: form?.description || "",
    method: "draw",
    edit_mode: "draw",
    rehydrated: true,
    distance_km: distanceKm,
    elevation_gain_m: elevationGainM,
    route_points: {
      ...(routePoints && typeof routePoints === "object" && !Array.isArray(routePoints) ? routePoints : {}),
      source: routePoints?.source || "draw-fullscreen-reopen",
      edit_mode: "draw",
      rehydrated: true,
      points,
      geometry_points: points,
      waypoints: storedWaypoints,
      control_points: storedWaypoints,
      point_count: points.length,
      waypoint_count: storedWaypoints.length,
      distance_km: distanceKm || null,
      elevation_gain_m: elevationGainM || 0,
      start_location: routePoints?.start_location || routePoints?.start_location_label || "",
      start_location_label: routePoints?.start_location_label || routePoints?.start_location || "",
      finish_location: routePoints?.finish_location || routePoints?.finish_location_label || "",
      finish_location_label: routePoints?.finish_location_label || routePoints?.finish_location || "",
      edited_at: new Date().toISOString(),
    },
    created_by: profileId || null,
    saved_at: new Date().toISOString(),
  };
}

function pickPlaceNameFromLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(netherlands|nederland)$/i.test(part));

  const postalCodeIndex = parts.findIndex((part) => /\b\d{4}\s?[A-Z]{2}\b/i.test(part));
  if (postalCodeIndex >= 0 && parts[postalCodeIndex + 1]) return parts[postalCodeIndex + 1];

  return parts.find((part) => !/^(street|road|route|unnamed|current location|startlocatie)$/i.test(part) && !/\d/.test(part)) || parts[0] || "";
}

function cleanRouteLocationName(value) {
  const place = pickPlaceNameFromLabel(value);
  if (!place || /^(locatie bepalen|startlocatie|current location)$/i.test(place)) return "";
  return place;
}

function formatRouteDistanceLabel(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance) || distance <= 0) return "0.0 km";
  return `${distance.toFixed(1)} km`;
}

export function buildAutomaticRouteTitle({ startLocation, distanceKm, sportId }) {
  const location = cleanRouteLocationName(startLocation) || "Locatie bepalen";
  return `${location} - ${formatRouteDistanceLabel(distanceKm)} - ${getSportLabel(sportId || "running")}`;
}

export function isGenericRouteTitle(value, sportId) {
  const title = String(value || "").trim();
  const sportLabel = getSportLabel(sportId || "running");
  if (!title) return true;

  return [
    "Draw Route",
    "New route",
    "Route",
    `${sportLabel} Route`,
    `${sportLabel} route`,
  ].some((genericTitle) => title.toLowerCase() === genericTitle.toLowerCase()) || /^locatie bepalen\s*-/i.test(title);
}

function pickReverseGeocodePlace(data = {}) {
  return cleanRouteLocationName(
    data.place ||
      data.city ||
      data.town ||
      data.village ||
      data.municipality ||
      data.locality ||
      data.county ||
      data.label ||
      data.name ||
      ""
  );
}

export async function resolveStartPlaceName(routePayload) {
  const points = normalizeRoutePoints(routePayload);
  const first = points?.[0];
  if (!first?.lat || !first?.lon) return "";

  try {
    const params = new URLSearchParams({ lat: String(first.lat), lon: String(first.lon) });
    const response = await fetch(`/api/geocode/reverse?${params.toString()}`);
    const data = await response.json();
    return pickReverseGeocodePlace(data);
  } catch (error) {
    console.warn("Could not resolve route start location", error);
    return "";
  }
}
