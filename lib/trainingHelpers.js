export const sportLabels = {
  running: "Running",
  trail_running: "Trail Running",
  road_cycling: "Road Cycling",
  gravel_cycling: "Gravel Cycling",
  mountain_biking: "Mountain Biking",
  walking: "Walking",
  kayaking: "Kayaking",
  strength_training: "Strength Training",
  crossfit: "CrossFit",
  hyrox: "HYROX",
  bootcamp: "Bootcamp",
  swimming: "Swimming",
  padel: "Padel",
};

export function getPrimarySport(training) {
  const firstSport = Array.isArray(training?.sports) ? training.sports[0] : null;
  return firstSport || "training";
}

export function getSportLabel(sportId) {
  return sportLabels[sportId] || sportId || "Training";
}

export function formatTrainingTime(training) {
  const value =
    training?.final_starts_at ||
    training?.starts_at ||
    null;

  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  if (training?.planning_type === "flexible") {
    const date = training?.flexible_date || "Flexible date";
    const from = training?.flexible_start_time?.slice(0, 5);
    const until = training?.flexible_end_time?.slice(0, 5);

    if (from && until) return `${date} · possible start ${from}–${until}`;
    return date;
  }

  return "Date to be confirmed";
}

export function formatTrainingIntensity(training) {
  const parts = [];

  if (training?.pace_min && training?.pace_max) {
    parts.push(`${training.pace_min}–${training.pace_max}/km`);
  } else if (training?.speed_min && training?.speed_max) {
    parts.push(`${training.speed_min}–${training.speed_max} km/h`);
  }

  if (training?.intensity_label) parts.push(training.intensity_label);

  return parts.join(" · ") || "Intensity not set";
}
