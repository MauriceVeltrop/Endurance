export const strengthMuscleGroups = [
  { id: "chest", label: "Chest" },
  { id: "back", label: "Back" },
  { id: "shoulders", label: "Shoulders" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "legs", label: "Legs" },
  { id: "core", label: "Core" },
];

export const strengthExercises = [
  { id: "bench_press", name: "Bench Press", muscleGroups: ["chest", "triceps"] },
  { id: "incline_dumbbell_press", name: "Incline Dumbbell Press", muscleGroups: ["chest", "shoulders", "triceps"] },
  { id: "dumbbell_press", name: "Dumbbell Press", muscleGroups: ["chest", "shoulders", "triceps"] },
  { id: "push_up", name: "Push-up", muscleGroups: ["chest", "triceps", "core"] },
  { id: "cable_fly", name: "Cable Fly", muscleGroups: ["chest"] },

  { id: "pull_up", name: "Pull-up", muscleGroups: ["back", "biceps"] },
  { id: "chin_up", name: "Chin-up", muscleGroups: ["back", "biceps"] },
  { id: "seated_cable_row", name: "Seated Cable Row", muscleGroups: ["back", "biceps"] },
  { id: "barbell_row", name: "Barbell Row", muscleGroups: ["back", "biceps"] },
  { id: "lat_pulldown", name: "Lat Pulldown", muscleGroups: ["back", "biceps"] },
  { id: "straight_arm_pushdown", name: "Straight Arm Pushdown", muscleGroups: ["back"] },

  { id: "overhead_press", name: "Overhead Press", muscleGroups: ["shoulders", "triceps"] },
  { id: "lateral_raise", name: "Lateral Raise", muscleGroups: ["shoulders"] },
  { id: "rear_delt_fly", name: "Rear Delt Fly", muscleGroups: ["shoulders", "back"] },
  { id: "face_pull", name: "Face Pull", muscleGroups: ["shoulders", "back"] },

  { id: "barbell_curl", name: "Barbell Curl", muscleGroups: ["biceps"] },
  { id: "dumbbell_curl", name: "Dumbbell Curl", muscleGroups: ["biceps"] },
  { id: "hammer_curl", name: "Hammer Curl", muscleGroups: ["biceps"] },
  { id: "preacher_curl", name: "Preacher Curl", muscleGroups: ["biceps"] },

  { id: "triceps_pushdown", name: "Triceps Pushdown", muscleGroups: ["triceps"] },
  { id: "skull_crusher", name: "Skull Crusher", muscleGroups: ["triceps"] },
  { id: "dips", name: "Dips", muscleGroups: ["triceps", "chest"] },
  { id: "overhead_triceps_extension", name: "Overhead Triceps Extension", muscleGroups: ["triceps"] },

  { id: "squat", name: "Squat", muscleGroups: ["legs", "core"] },
  { id: "trapbar_deadlift", name: "Trapbar Deadlift", muscleGroups: ["legs", "back", "core"] },
  { id: "romanian_deadlift", name: "Romanian Deadlift", muscleGroups: ["legs", "back"] },
  { id: "leg_press", name: "Leg Press", muscleGroups: ["legs"] },
  { id: "walking_lunge", name: "Walking Lunge", muscleGroups: ["legs", "core"] },
  { id: "leg_extension", name: "Leg Extension", muscleGroups: ["legs"] },
  { id: "leg_curl", name: "Leg Curl", muscleGroups: ["legs"] },
  { id: "hip_thrust", name: "Hip Thrust", muscleGroups: ["legs"] },
  { id: "calf_raise", name: "Calf Raise", muscleGroups: ["legs"] },

  { id: "plank", name: "Plank", muscleGroups: ["core"] },
  { id: "hanging_leg_raise", name: "Hanging Leg Raise", muscleGroups: ["core"] },
  { id: "cable_crunch", name: "Cable Crunch", muscleGroups: ["core"] },
  { id: "pallof_press", name: "Pallof Press", muscleGroups: ["core"] },
];

export function getMuscleGroupLabel(groupId) {
  return strengthMuscleGroups.find((group) => group.id === groupId)?.label || groupId;
}

export function getExerciseById(exerciseId) {
  return strengthExercises.find((exercise) => exercise.id === exerciseId) || null;
}
