// Premium real-photo sport hero images.
// Uses fixed Unsplash photo IDs instead of generated placeholders or abstract local images.

export const sportHeroImages = {
  running: {
    src: "https://source.unsplash.com/ckQOCv6AkIw/1200x760",
    position: "center center",
  },
  trail_running: {
    src: "https://source.unsplash.com/LyORqx-3O-c/1200x760",
    position: "center center",
  },
  road_cycling: {
    src: "https://source.unsplash.com/VfUN94cUy4o/1200x760",
    position: "center center",
  },
  gravel_cycling: {
    src: "https://source.unsplash.com/yCuatMlaAoo/1200x760",
    position: "center center",
  },
  mountain_biking: {
    src: "https://source.unsplash.com/yMNbYgB-KvY/1200x760",
    position: "center center",
  },
  walking: {
    src: "https://source.unsplash.com/mQVWb7kUoOE/1200x760",
    position: "center center",
  },
  kayaking: {
    src: "https://source.unsplash.com/1200x760/?kayaking,lake,adventure",
    position: "center center",
  },
  strength_training: {
    src: "https://source.unsplash.com/t9DxAo7VOCg/1200x760",
    position: "center center",
  },
  crossfit: {
    src: "https://source.unsplash.com/1200x760/?crossfit,gym,barbell",
    position: "center center",
  },
  hyrox: {
    src: "https://source.unsplash.com/1200x760/?hyrox,functional-fitness,gym",
    position: "center center",
  },
  bootcamp: {
    src: "https://source.unsplash.com/1200x760/?bootcamp,outdoor-training,fitness",
    position: "center center",
  },
  swimming: {
    src: "https://source.unsplash.com/maNyWIfPVUk/1200x760",
    position: "center center",
  },
  padel: {
    src: "https://source.unsplash.com/1200x760/?padel,court,racket",
    position: "center center",
  },
};

export function getSportImage(sportId) {
  return (
    sportHeroImages[sportId] || {
      src: "https://source.unsplash.com/1200x760/?endurance,sport,training",
      position: "center center",
    }
  );
}
