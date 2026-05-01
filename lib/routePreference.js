export function normalizeSportName(sport) {
  return String(sport || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

export function getRoutePreference(sports = []) {
  const normalizedSports = Array.isArray(sports)
    ? sports.map(normalizeSportName)
    : [normalizeSportName(sports)];

  // Trail Running always wins, also when Running + Trail Running are both selected.
  if (normalizedSports.includes("trail-running")) return "trail";

  if (normalizedSports.includes("running")) return "paved";

  return "default";
}

export function getRoutePreferenceLabel(preference) {
  if (preference === "trail") return "mostly unpaved / trail";
  if (preference === "paved") return "mostly paved";
  return "standard";
}

export function getRouteProfileForPreference(preference, fallbackSport = "running") {
  if (preference === "trail") return "foot-hiking";
  if (preference === "paved") return "foot-walking";

  const sport = normalizeSportName(fallbackSport);

  const profileMap = {
    running: "foot-walking",
    "trail-running": "foot-hiking",
    walking: "foot-walking",
    "road-cycling": "cycling-road",
    "gravel-cycling": "cycling-regular",
    "mountain-biking": "cycling-mountain",
  };

  return profileMap[sport] || "foot-walking";
}
