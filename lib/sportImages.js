// Endurance v2 sport hero images.
// Phase 1: only Running uses a fixed approved local asset.
// Add other sports later after visual approval.

export const sportHeroImages = {
  running: {
    src: "/sports/running.png",
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
