export const sportHeroImages = {
  running: {
    query: "runner,road,morning,cinematic",
    position: "center center",
  },
  trail_running: {
    query: "trail-running,forest,singletrack,cinematic",
    position: "center center",
  },
  road_cycling: {
    query: "road-cycling,mountain-road,cinematic",
    position: "center center",
  },
  gravel_cycling: {
    query: "gravel-bike,dust,forest-road,cinematic",
    position: "center center",
  },
  mountain_biking: {
    query: "mountain-bike,trail,forest,cinematic",
    position: "center center",
  },
  walking: {
    query: "walking,nature,path,morning-light",
    position: "center center",
  },
  kayaking: {
    query: "kayaking,lake,water,cinematic",
    position: "center center",
  },
  strength_training: {
    query: "strength-training,gym,barbell,dark,cinematic",
    position: "center center",
  },
  crossfit: {
    query: "crossfit,gym,workout,dark,cinematic",
    position: "center center",
  },
  hyrox: {
    query: "hyrox,functional-fitness,gym,dark,cinematic",
    position: "center center",
  },
  bootcamp: {
    query: "bootcamp,outdoor-training,fitness,cinematic",
    position: "center center",
  },
  swimming: {
    query: "swimming,pool,lane,water,cinematic",
    position: "center center",
  },
  padel: {
    query: "padel,court,racket,sport,cinematic",
    position: "center center",
  },
};

const fallbackQuery = "endurance,sport,training,cinematic";

export function getSportImage(sportId, variant = "card") {
  const image = sportHeroImages[sportId] || { query: fallbackQuery, position: "center center" };
  const size = variant === "detail" ? "1400x900" : "900x640";
  return {
    src: `https://source.unsplash.com/${size}/?${encodeURIComponent(image.query)}`,
    position: image.position,
  };
}
