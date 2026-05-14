// Endurance v2 sport hero images.
// Clean fixed local assets per sport.

export const sportHeroImages = {
  running: {
    src: "/sports/running.png",
    position: "center center",
  },

  trail_running: {
    src: "/sports/trail-running.png",
    position: "center center",
  },

  road_cycling: {
    src: "/sports/road-cycling.png",
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
  // Ignore random uploaded/test images for now.
  // Only use clean sport placeholders.
  return getSportImage(sportId);
}

export function hasTrainingHeroImage(training, sportId) {
  const hero = getTrainingHeroImage(training, sportId);
  return Boolean(hero.src);
}
