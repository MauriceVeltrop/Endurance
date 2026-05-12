// Premium real-photo sport hero images.
// Direct images.unsplash.com URLs are used because source.unsplash.com can fail or redirect unpredictably in production.

export const sportHeroImages = {
  running: {
    src: "https://images.unsplash.com/photo-1544717297-fa95b6ee9643?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  trail_running: {
    src: "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  road_cycling: {
    src: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  gravel_cycling: {
    src: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  mountain_biking: {
    src: "https://images.unsplash.com/photo-1576858574144-9ae1ebcf5ae5?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  walking: {
    src: "https://images.unsplash.com/photo-1445307806294-bff7f67ff225?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  kayaking: {
    src: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  strength_training: {
    src: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  crossfit: {
    src: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  hyrox: {
    src: "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  bootcamp: {
    src: "https://images.unsplash.com/photo-1526401485004-2fda9f4d61f1?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  swimming: {
    src: "https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
  padel: {
    src: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=80",
    position: "center center",
  },
};

export const fallbackSportImage = {
  src: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80",
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
