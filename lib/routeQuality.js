import { getRoutePoints, getElevationStats } from "./routePreview";

function getDistance(route) {
  const distance = Number(route?.distance_km);
  return Number.isFinite(distance) ? distance : 0;
}

function getElevationGain(route) {
  const elevation = Number(route?.elevation_gain_m);
  return Number.isFinite(elevation) ? elevation : 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getDistanceScore(distance, idealMin, idealMax) {
  if (!distance) return 58;
  if (distance >= idealMin && distance <= idealMax) return 100;
  if (distance < idealMin) return clamp(100 - ((idealMin - distance) / idealMin) * 55);
  return clamp(100 - ((distance - idealMax) / idealMax) * 35);
}

function getElevationScore(distance, elevationGain, sportId) {
  if (!distance || !elevationGain) return 62;

  const metersPerKm = elevationGain / distance;

  if (sportId === "trail_running") return clamp(58 + metersPerKm * 1.3);
  if (sportId === "mountain_biking") return clamp(55 + metersPerKm * 1.1);
  if (sportId === "road_cycling") return clamp(80 - Math.max(0, metersPerKm - 22) * 0.7);
  if (sportId === "gravel_cycling") return clamp(70 + Math.min(metersPerKm, 45) * 0.4);
  if (sportId === "walking") return clamp(82 - Math.max(0, metersPerKm - 35) * 0.8);
  if (sportId === "running") return clamp(88 - Math.max(0, metersPerKm - 25) * 1.2);
  if (sportId === "kayaking") return clamp(95 - Math.min(elevationGain, 200) * 0.25);

  return 70;
}

function getPointDensityScore(route) {
  const points = getRoutePoints(route?.route_points);
  const distance = getDistance(route);

  if (!points.length || !distance) return 58;

  const pointsPerKm = points.length / distance;
  if (pointsPerKm >= 20) return 100;
  if (pointsPerKm >= 10) return 88;
  if (pointsPerKm >= 5) return 74;
  return 56;
}

const sportProfiles = {
  running: {
    idealMin: 3,
    idealMax: 18,
    label: "Road/park running",
    primary: "Smooth, clear running route with manageable elevation.",
  },
  trail_running: {
    idealMin: 4,
    idealMax: 28,
    label: "Trail running",
    primary: "Trail routes should feel natural, varied and not too road-like.",
  },
  road_cycling: {
    idealMin: 20,
    idealMax: 130,
    label: "Road cycling",
    primary: "Road cycling routes should be longer, flowing and not overly stop-start.",
  },
  gravel_cycling: {
    idealMin: 18,
    idealMax: 120,
    label: "Gravel cycling",
    primary: "Gravel routes should be adventurous with varied terrain.",
  },
  mountain_biking: {
    idealMin: 8,
    idealMax: 65,
    label: "Mountain biking",
    primary: "MTB routes should be compact, technical and have enough terrain variation.",
  },
  walking: {
    idealMin: 2,
    idealMax: 18,
    label: "Walking",
    primary: "Walking routes should be accessible and not too long or severe.",
  },
  kayaking: {
    idealMin: 3,
    idealMax: 35,
    label: "Kayaking",
    primary: "Kayak routes mainly need distance clarity and low elevation noise.",
  },
};

export function analyzeRouteQuality(route) {
  const sportId = route?.sport_id;
  const profile = sportProfiles[sportId] || {
    idealMin: 2,
    idealMax: 50,
    label: "Route",
    primary: "Route quality is based on available GPX data.",
  };

  const distance = getDistance(route);
  const elevationGain = getElevationGain(route);
  const elevationStats = getElevationStats(route?.route_points);
  const pointCount = getRoutePoints(route?.route_points).length;

  const distanceScore = getDistanceScore(distance, profile.idealMin, profile.idealMax);
  const elevationScore = getElevationScore(distance, elevationGain, sportId);
  const densityScore = getPointDensityScore(route);

  const score = clamp(distanceScore * 0.42 + elevationScore * 0.28 + densityScore * 0.30);

  const checks = [];

  checks.push({
    label: "Distance fit",
    status: distanceScore >= 82 ? "good" : distanceScore >= 65 ? "ok" : "attention",
    text: distance
      ? `${distance} km for ${profile.label.toLowerCase()}`
      : "Distance is not available yet.",
  });

  checks.push({
    label: "Elevation",
    status: elevationScore >= 82 ? "good" : elevationScore >= 65 ? "ok" : "attention",
    text: elevationGain
      ? `${elevationGain} m gain${elevationStats.available ? ` · ${elevationStats.min}-${elevationStats.max} m profile` : ""}`
      : "No elevation gain available yet.",
  });

  checks.push({
    label: "GPX detail",
    status: densityScore >= 82 ? "good" : densityScore >= 65 ? "ok" : "attention",
    text: pointCount
      ? `${pointCount} imported route points`
      : "Import GPX points to improve route preview and quality.",
  });

  let verdict = "Needs more route data";
  if (score >= 86) verdict = "Strong route fit";
  else if (score >= 72) verdict = "Good route foundation";
  else if (score >= 58) verdict = "Usable, but refine later";

  const suggestions = [];

  if (!pointCount) suggestions.push("Import a GPX file to unlock route preview and quality analysis.");
  if (!distance) suggestions.push("Add route distance so Endurance can judge sport fit.");
  if (sportId === "trail_running" && elevationGain / Math.max(distance, 1) < 20) {
    suggestions.push("For trail running, prefer more natural terrain and elevation variation.");
  }
  if (sportId === "running" && elevationGain / Math.max(distance, 1) > 35) {
    suggestions.push("For regular running, consider a smoother route with less climbing.");
  }
  if (sportId === "road_cycling" && distance < 20) {
    suggestions.push("Road cycling routes usually feel better when they are longer and flowing.");
  }
  if (sportId === "kayaking" && elevationGain > 50) {
    suggestions.push("Kayak GPX elevation can be noisy; check whether elevation data should be ignored.");
  }

  if (!suggestions.length) suggestions.push(profile.primary);

  return {
    score,
    verdict,
    label: profile.label,
    checks,
    suggestions,
  };
}
