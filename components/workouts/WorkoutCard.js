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

  return {
    exercises,
    exerciseCount: exercises.length,
    setCount,
    muscleGroups: muscleGroups.map(getMuscleGroupLabel).join(" · "),
    previewExercises: exercises.slice(0, 4).map((exercise) => exercise.name).filter(Boolean).join(" · "),
  };
}

export default function WorkoutCard({ workout }) {
  if (!workout) return null;

  const href = `/workouts/${workout.id}`;
  const summary = summarizeWorkout(workout);

  return (
    <article className="workout-feed-card route-feed-card-premium">
      <Link href={href} className="workout-feed-icon" aria-label={workout.title || "Open workout"}>
        <span>▦</span>
        <b>{summary.exerciseCount || 0}</b>
        <small>Exercises</small>
      </Link>

      <div className="route-feed-content">
        <div className="route-feed-top">
          <div className="route-feed-badges">
            <span className="sport-badge">{getSportLabel(workout.sport_id)}</span>
            <span className="status-badge">{workout.visibility}</span>
          </div>
          <span className="route-feed-more">•••</span>
        </div>

        <Link href={href} className="route-feed-title">
          {workout.title || "Strength Workout"}
        </Link>

        <div className="route-feed-stats">
          <span>▤ {summary.exerciseCount ? `${summary.exerciseCount} exercises` : "No exercises"}</span>
          <i />
          <span>☰ {summary.setCount ? `${summary.setCount} sets` : "No sets"}</span>
        </div>

        <span className="route-feed-elevation">
          {summary.muscleGroups || "Muscle groups not set"}
        </span>
        <span className="route-feed-place">
          {summary.previewExercises || workout.description || "Reusable workout structure"}
        </span>

        <div className="route-feed-actions">
          <Link href={href} className="route-feed-open">
            Open workout <span>→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
