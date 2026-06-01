"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import BottomNav from "../../../components/BottomNav";
import { supabase } from "../../../lib/supabase";
import { getSportLabel } from "../../../lib/trainingHelpers";
import { getMuscleGroupLabel } from "../../../lib/strengthWorkoutConfig";

function displayName(profile) {
  return profile?.name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Endurance athlete";
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function summarizeWorkout(workout) {
  const structure = workout?.structure || {};
  const exercises = Array.isArray(structure.exercises) ? structure.exercises : [];
  const setCount = exercises.reduce((sum, exercise) => sum + (Array.isArray(exercise.sets) ? exercise.sets.length : 0), 0);
  const muscleGroups = Array.isArray(structure.muscle_groups) ? structure.muscle_groups : [];

  return {
    structure,
    exercises,
    exerciseCount: exercises.length,
    setCount,
    muscleGroups,
    muscleGroupText: muscleGroups.map(getMuscleGroupLabel).join(" · "),
  };
}

function formatLoad(set) {
  if (set?.weight_kg === null || set?.weight_kg === undefined || set?.weight_kg === "") return "open";
  return `${set.weight_kg}kg`;
}

function setSignature(set) {
  const reps = set?.reps || "?";
  return `${reps} @ ${formatLoad(set)}`;
}

function compactSetSummary(sets = []) {
  if (!sets.length) return "No sets";

  const groups = [];
  sets.forEach((set) => {
    const signature = setSignature(set);
    const last = groups[groups.length - 1];
    if (last?.signature === signature) {
      last.count += 1;
    } else {
      groups.push({ signature, count: 1 });
    }
  });

  return groups
    .map((group) => (group.count > 1 ? `${group.count}x ${group.signature}` : `1x ${group.signature}`))
    .join("   ");
}

function canEditWorkout(workout, profile) {
  if (!workout || !profile) return false;
  return workout.creator_id === profile.id || profile.role === "admin" || profile.role === "moderator";
}

function getExerciseMuscleText(exercise) {
  const groups = Array.isArray(exercise?.muscle_groups) && exercise.muscle_groups.length
    ? exercise.muscle_groups
    : exercise?.primary_muscle_group
      ? [exercise.primary_muscle_group]
      : [];

  return groups.map(getMuscleGroupLabel).join(" · ") || "Strength";
}

function getExerciseMeta(exercise) {
  const parts = [getExerciseMuscleText(exercise), exercise?.equipment].filter(Boolean);
  return parts.join(" · ");
}

function estimateTotalLoad(exercises) {
  const total = exercises.reduce((sum, exercise) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
    return sum + sets.reduce((setSum, set) => {
      const reps = Number(set?.reps);
      const weight = Number(set?.weight_kg);
      if (!Number.isFinite(reps) || !Number.isFinite(weight)) return setSum;
      return setSum + reps * weight;
    }, 0);
  }, 0);

  if (!total) return "—";
  return total >= 1000 ? `${Math.round(total / 100) / 10}k kg` : `${Math.round(total)} kg`;
}

export default function WorkoutDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [profile, setProfile] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [creator, setCreator] = useState(null);
  const [linkedTrainings, setLinkedTrainings] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadWorkout() {
    if (!id) return;

    setLoading(true);
    setMessage("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,first_name,last_name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      setProfile(profileRow);

      const { data: workoutRow, error: workoutError } = await supabase
        .from("workouts")
        .select("id,creator_id,sport_id,title,description,workout_type,level,duration_min,structure,visibility,created_at,updated_at")
        .eq("id", id)
        .maybeSingle();

      if (workoutError) throw workoutError;

      if (!workoutRow) {
        setWorkout(null);
        setMessage("Workout not found.");
        return;
      }

      const allowed =
        workoutRow.visibility === "public" ||
        workoutRow.creator_id === user.id ||
        profileRow?.role === "admin" ||
        profileRow?.role === "moderator";

      if (!allowed) {
        setWorkout(null);
        setMessage("You do not have access to this workout yet.");
        return;
      }

      setWorkout(workoutRow);

      const [{ data: creatorRow }, { data: trainingRows }, { count: notificationCount }, { count: inviteCount }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id,name,first_name,last_name,avatar_url")
            .eq("id", workoutRow.creator_id)
            .maybeSingle(),
          supabase
            .from("training_sessions")
            .select("id,title,starts_at,final_starts_at,planning_type,visibility")
            .eq("workout_id", workoutRow.id)
            .order("starts_at", { ascending: false, nullsFirst: false })
            .limit(6),
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .is("read_at", null),
          supabase
            .from("training_invites")
            .select("id", { count: "exact", head: true })
            .eq("invitee_id", user.id)
            .eq("status", "pending"),
        ]);

      setCreator(creatorRow || null);
      setLinkedTrainings(trainingRows || []);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    } catch (error) {
      console.error("Workout detail error", error);
      setMessage(error?.message || "Could not load workout.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkout();
  }, [id]);

  const summary = useMemo(() => summarizeWorkout(workout), [workout]);
  const sportLabel = getSportLabel(workout?.sport_id);
  const editable = canEditWorkout(workout, profile);

  function createTrainingFromWorkout() {
    if (!workout) return;
    router.push(`/trainings/new?workout_id=${workout.id}`);
  }

  async function shareWorkout() {
    if (!workout) return;
    const url = `${window.location.origin}/workouts/${workout.id}`;

    if (navigator.share) {
      await navigator.share({ title: workout.title, text: "Check this Endurance workout.", url });
      return;
    }

    await navigator.clipboard.writeText(url);
    setMessage("Workout link copied.");
  }

  async function duplicateWorkout() {
    if (!workout || !profile) return;

    try {
      const { data, error } = await supabase
        .from("workouts")
        .insert({
          creator_id: profile.id,
          sport_id: workout.sport_id,
          title: `${workout.title} copy`,
          description: workout.description || "",
          workout_type: workout.workout_type || "strength",
          level: workout.level,
          duration_min: workout.duration_min,
          structure: workout.structure || {},
          visibility: "private",
        })
        .select("id")
        .single();

      if (error) throw error;
      router.push(`/workouts/${data.id}/edit`);
    } catch (error) {
      console.error("Duplicate workout failed", error);
      setMessage(error?.message || "Could not duplicate workout.");
    }
  }

  async function deleteWorkout() {
    if (!workout || !editable) return;
    const confirmed = window.confirm(`Delete ${workout.title}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await supabase.from("training_sessions").update({ workout_id: null }).eq("workout_id", workout.id);

      try {
        const { data: exerciseRows } = await supabase
          .from("workout_exercises")
          .select("id")
          .eq("workout_id", workout.id);

        const exerciseIds = (exerciseRows || []).map((row) => row.id);
        if (exerciseIds.length) {
          await supabase.from("workout_exercise_sets").delete().in("workout_exercise_id", exerciseIds);
        }
        await supabase.from("workout_exercises").delete().eq("workout_id", workout.id);
      } catch (normalizedError) {
        console.warn("Normalized workout cleanup skipped", normalizedError);
      }

      const { error } = await supabase.from("workouts").delete().eq("id", workout.id);
      if (error) throw error;

      router.push("/workouts");
    } catch (error) {
      console.error("Delete workout failed", error);
      setMessage(error?.message || "Could not delete workout.");
    }
  }

  if (loading) {
    return (
      <main className="endurance-page route-detail-page workout-detail-page">
        <AppHeader active="workouts" />
        <section className="endurance-shell endurance-card notification-empty">Loading workout...</section>
        <BottomNav unreadCount={unreadCount} />
      </main>
    );
  }

  if (!workout) {
    return (
      <main className="endurance-page route-detail-page workout-detail-page">
        <AppHeader active="workouts" />
        <section className="endurance-shell endurance-card notification-empty">
          <h2>Workout unavailable</h2>
          <p>{message || "This workout could not be loaded."}</p>
          <Link href="/workouts" className="primary-action">Back to workouts</Link>
        </section>
        <BottomNav unreadCount={unreadCount} />
      </main>
    );
  }

  return (
    <main className="endurance-page route-detail-page workout-detail-page workout-detail-premium">
      <AppHeader active="workouts" />

      <section className="endurance-shell workout-premium-hero endurance-card">
        <div className="workout-premium-hero-main">
          <div className="workout-premium-kicker">
            <span>{sportLabel}</span>
            <span>{workout.visibility}</span>
            <span>{workout.level || "All levels"}</span>
          </div>

          <h1>{workout.title}</h1>

          {summary.muscleGroupText ? (
            <p className="workout-premium-focus">{summary.muscleGroupText}</p>
          ) : null}

          {workout.description ? (
            <p className="workout-premium-description">{workout.description}</p>
          ) : null}

          <div className="workout-premium-author">
            <span className="workout-premium-avatar">
              {creator?.avatar_url ? <img src={creator.avatar_url} alt="" /> : displayName(creator).slice(0, 1)}
            </span>
            <span>
              <b>{displayName(creator)}</b>
              <small>Created {formatDate(workout.created_at)}</small>
            </span>
          </div>
        </div>

        <div className="workout-premium-stat-grid">
          <div>
            <span>Exercises</span>
            <strong>{summary.exerciseCount}</strong>
          </div>
          <div>
            <span>Sets</span>
            <strong>{summary.setCount}</strong>
          </div>
          <div>
            <span>Volume</span>
            <strong>{estimateTotalLoad(summary.exercises)}</strong>
          </div>
          <div>
            <span>Duration</span>
            <strong>{workout.duration_min ? `${workout.duration_min}m` : "—"}</strong>
          </div>
        </div>
      </section>

      {message ? <section className="endurance-shell route-detail-message">{message}</section> : null}

      <section className="endurance-shell workout-premium-actions">
        <Link href={`/workouts/${workout.id}/start`} className="workout-action-primary">
          Start workout
        </Link>
        <Link href="/workouts/history" className="workout-action-secondary">
          History
        </Link>
        <button type="button" className="workout-action-secondary" onClick={createTrainingFromWorkout}>
          Use in training
        </button>
        {editable ? (
          <Link href={`/workouts/${workout.id}/edit`} className="workout-action-secondary">
            Edit
          </Link>
        ) : null}
        <button type="button" className="workout-action-secondary" onClick={duplicateWorkout}>
          Duplicate
        </button>
        <button type="button" className="workout-action-secondary" onClick={shareWorkout}>
          Share
        </button>
      </section>

      <section className="endurance-shell workout-plan-card endurance-card">
        <div className="workout-plan-header">
          <div>
            <p className="eyebrow">Exercise plan</p>
            <h2>Workout structure</h2>
          </div>
          <span>{summary.setCount} sets</span>
        </div>

        {summary.exercises.length ? (
          <div className="workout-plan-list">
            {summary.exercises.map((exercise, exerciseIndex) => (
              <article key={`${exercise.exercise_id || exercise.name}-${exerciseIndex}`} className="workout-plan-row">
                <span className="workout-plan-index">{exerciseIndex + 1}</span>
                <div className="workout-plan-copy">
                  <h3>{exercise.name || "Exercise"}</h3>
                  <p>{compactSetSummary(Array.isArray(exercise.sets) ? exercise.sets : [])}</p>
                  <small>{getExerciseMeta(exercise)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="route-detail-muted">No exercises saved in this workout yet.</p>
        )}
      </section>

      <section className="endurance-shell workout-premium-secondary-grid">
        <article className="endurance-card workout-compact-card">
          <div className="workout-plan-header mini">
            <div>
              <p className="eyebrow">Focus</p>
              <h2>Muscle groups</h2>
            </div>
          </div>
          <div className="workout-muscle-tags compact">
            {summary.muscleGroups.length ? (
              summary.muscleGroups.map((group) => <span key={group}>{getMuscleGroupLabel(group)}</span>)
            ) : (
              <p className="route-detail-muted">No muscle groups saved.</p>
            )}
          </div>
        </article>

        <article className="endurance-card workout-compact-card">
          <div className="workout-plan-header mini">
            <div>
              <p className="eyebrow">Training usage</p>
              <h2>Linked sessions</h2>
            </div>
          </div>

          {linkedTrainings.length ? (
            <div className="route-linked-list compact">
              {linkedTrainings.map((training) => (
                <Link href={`/trainings/${training.id}`} key={training.id}>
                  <strong>{training.title}</strong>
                  <span>{formatDate(training.final_starts_at || training.starts_at) || training.planning_type}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="route-detail-muted">No training session uses this workout yet.</p>
          )}
        </article>
      </section>

      {editable ? (
        <section className="endurance-shell workout-danger-zone">
          <button type="button" onClick={deleteWorkout}>Delete workout</button>
        </section>
      ) : null}
      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
