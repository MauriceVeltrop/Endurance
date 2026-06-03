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
  const previewExercises = exercises
    .slice(0, 3)
    .map((exercise) => exercise.name)
    .filter(Boolean);

  return {
    exercises,
    exerciseCount: exercises.length,
    setCount,
    muscleLabels,
    previewExercises,
    moreCount: Math.max(0, exercises.length - previewExercises.length),
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
  const title = workout.title || "Strength Workout";

  return (
    <article className="workout-card-v2">
      <Link href={href} className={`workout-card-v2-hero ${getWorkoutImageClass(workout)}`} aria-label={title}>
        <span>{getSportLabel(workout.sport_id)}</span>
      </Link>

      <div className="workout-card-v2-body">
        <div className="workout-card-v2-topline">
          <span className="sport-badge">{getSportLabel(workout.sport_id)}</span>
          <span className="status-badge">{workout.visibility || "team"}</span>
        </div>

        <Link href={href} className="workout-card-v2-title">
          {title}
        </Link>

        <div className="workout-card-v2-meta">
          <span>{summary.exerciseCount || 0} exercises</span>
          <i />
          <span>{summary.setCount || 0} sets</span>
        </div>

        {summary.muscleLabels.length ? (
          <div className="workout-card-v2-muscles">
            {summary.muscleLabels.slice(0, 4).map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        ) : null}

        <div className="workout-card-v2-exercises">
          {summary.previewExercises.length ? (
            <>
              {summary.previewExercises.map((name) => (
                <span key={name}>{name}</span>
              ))}
              {summary.moreCount ? <b>+{summary.moreCount} more exercises</b> : null}
            </>
          ) : (
            <span>{workout.description || "Reusable workout structure"}</span>
          )}
        </div>

        <div className="workout-card-v2-footer">
          <Link href={href} className="workout-card-v2-open">
            Open workout <span>→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
