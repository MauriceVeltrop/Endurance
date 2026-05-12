export const sportImages = {
  running: "/training-images/running.svg",
  trail_running: "/training-images/trail-running.svg",
  road_cycling: "/training-images/road-cycling.svg",
  gravel_cycling: "/training-images/gravel-cycling.svg",
  mountain_biking: "/training-images/mountain-biking.svg",
  walking: "/training-images/walking.svg",
  kayaking: "/training-images/kayaking.svg",
  strength_training: "/training-images/strength-training.svg",
  crossfit: "/training-images/crossfit.svg",
  hyrox: "/training-images/hyrox.svg",
  bootcamp: "/training-images/bootcamp.svg",
  swimming: "/training-images/swimming.svg",
  padel: "/training-images/padel.svg",
  training: "/training-images/training.svg",
};

export function getSportImage(sportId) {
  return sportImages[sportId] || sportImages.training;
}

export function getTrainingImage(training) {
  if (training?.teaser_photo_url) return training.teaser_photo_url;
  const sports = Array.isArray(training?.sports) ? training.sports : [];
  return getSportImage(sports[0] || "training");
}
