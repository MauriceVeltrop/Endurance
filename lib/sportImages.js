import { isLikelyImageUrl } from "./trainingPhotos";

// Endurance v2 sport hero images.
// These are stable placeholders. A real uploaded training photo replaces them via teaser_photo_url.

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
  gravel_cycling: {
    src: "/sports/gravel-cycling.png",
    position: "center center",
  },
  mountain_biking: {
    src: "/sports/mountain-biking.png",
    position: "center center",
  },
  walking: {
    src: "/sports/walking.png",
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
  const uploadedPhoto = String(training?.teaser_photo_url || "").trim();

  return {
    src: isLikelyImageUrl(uploadedPhoto) ? uploadedPhoto : fallback.src,
    position: isLikelyImageUrl(uploadedPhoto) ? "center center" : fallback.position || "center center",
  };
}

export function hasTrainingHeroImage(training, sportId) {
  const hero = getTrainingHeroImage(training, sportId);
  return Boolean(hero.src);
}
