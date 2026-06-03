"use client";

import Link from "next/link";
import { getSportLabel } from "../../lib/trainingHelpers";
import { getMuscleGroupLabel } from "../../lib/strengthWorkoutConfig";

function summarizeWorkout(workout) {
  const structure = workout?.structure || {};
  const exercises = Array.isArray(structure.exercises) ? structure.exercises : [];
  const setCount = exercises.reduce(
    (sum, exercise) => sum + (Array.isArray(exercise.sets) ? exercise.sets.length : 0),
    0
  );
  const muscleGroups = Array.isArray(structure.muscle_groups) ? structure.muscle_groups : [];
  const muscleLabels = muscleGroups.map(getMuscleGroupLabel).filter(Boolean);

  return {
    exerciseCount: exercises.length,
    setCount,
    muscleLabels,
  };
}

function getWorkoutImageClass(workout) {
  const sportId = workout?.sport_id || "strength_training";
  if (sportId === "hyrox") return "hyrox";
  if (sportId === "crossfit") return "crossfit";
  if (sportId === "bootcamp") return "bootcamp";
  return "strength";
}

export default function WorkoutCard({ workout }) {
  if (!workout) return null;

  const href = `/workouts/${workout.id}`;
  const summary = summarizeWorkout(workout);
  const title = workout.title || "Workout";
  const sportLabel = getSportLabel(workout.sport_id);

  return (
    <Link href={href} className="workout-card-v2 workout-card-clickable" aria-label={`Open ${title}`}>
      <div className={`workout-card-v2-hero ${getWorkoutImageClass(workout)}`} aria-hidden="true" />

      <div className="workout-card-v2-body">
        <div className="workout-card-v2-topline">
          <span className="sport-badge">{sportLabel}</span>
          <span className="status-badge">{workout.visibility || "team"}</span>
        </div>

        <h2 className="workout-card-v2-title">{title}</h2>

        <div className="workout-card-v2-meta">
          <span>{summary.exerciseCount || 0} exercises</span>
          <i />
          <span>{summary.setCount || 0} sets</span>
          {summary.muscleLabels.length ? (
            <>
              <i />
              <span>{summary.muscleLabels.length} groups</span>
            </>
          ) : null}
        </div>

        {summary.muscleLabels.length ? (
          <div className="workout-card-v2-muscles">
            {summary.muscleLabels.slice(0, 3).map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        ) : null}
      </div>

      <span className="workout-card-v2-arrow" aria-hidden="true">→</span>
    </Link>
  );
}
