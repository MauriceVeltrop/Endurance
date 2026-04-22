export const SPORTS = [
  {
    id: "running",
    label: "Running",
    category: "endurance",
    icon: "🏃"
  },
  {
    id: "trail-running",
    label: "Trail Running",
    category: "endurance",
    icon: "🏔️"
  },
  {
    id: "road-cycling",
    label: "Road Cycling",
    category: "cycling",
    icon: "🚴"
  },
  {
    id: "mountain-biking",
    label: "Mountain Biking",
    category: "cycling",
    icon: "🚵"
  },
  {
    id: "gravel-cycling",
    label: "Gravel Cycling",
    category: "cycling",
    icon: "🚴‍♂️"
  },
  {
    id: "swimming",
    label: "Swimming",
    category: "endurance",
    icon: "🏊"
  },
  {
    id: "walking",
    label: "Walking",
    category: "endurance",
    icon: "🚶"
  },
  {
    id: "padel",
    label: "Padel",
    category: "racket",
    icon: "🎾"
  },
  {
    id: "kayaking",
    label: "Kayaking",
    category: "water",
    icon: "🛶"
  }
]


// handige helper om sport op id te vinden
export function getSportById(id) {
  return SPORTS.find((sport) => sport.id === id)
}


// helper om meerdere sportnamen op te halen
export function getSportLabels(ids = []) {
  return ids
    .map((id) => SPORTS.find((sport) => sport.id === id))
    .filter(Boolean)
    .map((sport) => sport.label)
}
