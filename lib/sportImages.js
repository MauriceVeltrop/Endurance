// Endurance v2 sport hero images.
// Fixed local assets per sport for consistent branding.

export const sportHeroImages = {
  running: {
    src: "/sports/running.png",
    position: "center center",
  },

  trail_running: {
    src: "/sports/trail-running.png",
    position: "center center",
  },
};

export const fallbackSportImage = {
  src: "",
  position: "center center",
};

export function getSportImage(sportId) {
  return sportHeroImages[sportId] || fallbackSportImage;
}

export function getTrainingHeroImage(training, sportId) {
  const fallback = getSportImage(sportId);

  return {
    src: training?.teaser_photo_url || fallback.src,
    position: fallback.position || "center center",
  };
}

export function hasTrainingHeroImage(training, sportId) {
  const hero = getTrainingHeroImage(training, sportId);
  return Boolean(hero.src);
}
