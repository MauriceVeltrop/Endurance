export const SPORTS = [
  {
    id: "running",
    label: "Running",
    category: "endurance",
    icon: "🏃",
    distance: true
  },
  {
    id: "trail-running",
    label: "Trail Running",
    category: "endurance",
    icon: "🏔️",
    distance: true
  },
  {
    id: "road-cycling",
    label: "Road Cycling",
    category: "cycling",
    icon: "🚴",
    distance: true
  },
  {
    id: "mountain-biking",
    label: "Mountain Biking",
    category: "cycling",
    icon: "🚵",
    distance: true
  },
  {
    id: "gravel-cycling",
    label: "Gravel Cycling",
    category: "cycling",
    icon: "🚴‍♂️",
    distance: true
  },
  {
    id: "swimming",
    label: "Swimming",
    category: "endurance",
    icon: "🏊",
    distance: true
  },
  {
    id: "walking",
    label: "Walking",
    category: "endurance",
    icon: "🚶",
    distance: true
  },
  {
    id: "kayaking",
    label: "Kayaking",
    category: "water",
    icon: "🛶",
    distance: true
  },
  {
    id: "padel",
    label: "Padel",
    category: "racket",
    icon: "🎾",
    distance: false
  },
  {
    id: "crossfit",
    label: "CrossFit",
    category: "fitness",
    icon: "🏋️",
    distance: false
  },
  {
    id: "hyrox",
    label: "HYROX",
    category: "fitness",
    icon: "🔥",
    distance: false
  },
  {
    id: "strength-training",
    label: "Strength Training",
    category: "fitness",
    icon: "💪",
    distance: false
  }
]



// sport op id vinden
export function getSportById(id) {
  return SPORTS.find((sport) => sport.id === id)
}



// labels ophalen uit meerdere ids
export function getSportLabels(ids = []) {
  return ids
    .map((id) => SPORTS.find((sport) => sport.id === id))
    .filter(Boolean)
    .map((sport) => sport.label)
}



// helper: sporten met distance
export function getDistanceSports() {
  return SPORTS.filter((sport) => sport.distance)
}
