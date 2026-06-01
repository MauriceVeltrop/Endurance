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
  if (set?.weight_kg === null || set?.weight_kg === undefined || set?.weight_kg === "") return "bodyweight / open";
  return `${set.weight_kg} kg`;
}

function canEditWorkout(workout, profile) {
  if (!workout || !profile) return false;
  return workout.creator_id === profile.id || profile.role === "admin" || profile.role === "moderator";
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
    <main className="endurance-page route-detail-page workout-detail-page">
      <AppHeader active="workouts" />

      <section className="endurance-shell route-detail-hero workout-detail-hero endurance-card">
        <div className="route-detail-hero-copy">
          <div className="route-detail-badges">
            <span className="sport-badge">{sportLabel}</span>
            <span className="status-badge">{workout.visibility}</span>
            <span className="status-badge">{workout.workout_type || "Workout"}</span>
          </div>

          <h1>{workout.title}</h1>

          <p>
            {workout.description ||
              "A reusable Endurance workout. Inspect the exercises and plan a training session with this workout."}
          </p>

          <div className="route-detail-creator">
            <span className="route-detail-avatar">
              {creator?.avatar_url ? <img src={creator.avatar_url} alt="" /> : displayName(creator).slice(0, 1)}
            </span>
            <span>
              <b>{displayName(creator)}</b>
              <small>Created {formatDate(workout.created_at)}</small>
            </span>
          </div>
        </div>

        <div className="route-detail-hero-stats">
          <div>
            <span>Exercises</span>
            <strong>{summary.exerciseCount}</strong>
          </div>
          <div>
            <span>Sets</span>
            <strong>{summary.setCount}</strong>
          </div>
          <div>
            <span>Muscles</span>
            <strong>{summary.muscleGroups.length || "—"}</strong>
          </div>
          <div>
            <span>Duration</span>
            <strong>{workout.duration_min ? `${workout.duration_min} min` : "—"}</strong>
          </div>
        </div>
      </section>

      {message ? <section className="endurance-shell route-detail-message">{message}</section> : null}

      <section className="endurance-shell route-detail-action-bar">
        <button type="button" className="route-detail-primary" onClick={createTrainingFromWorkout}>
          Plan training with this workout
        </button>
        <button type="button" className="route-detail-secondary" onClick={shareWorkout}>Share</button>
        {editable ? (
          <button type="button" className="route-detail-secondary" disabled title="Workout editing comes next">
            Edit soon
          </button>
        ) : null}
      </section>

      <section className="endurance-shell workout-focus-strip endurance-card">
        <div>
          <p className="eyebrow">Muscle groups</p>
          <h2>Training focus</h2>
        </div>

        <div className="workout-muscle-tags compact">
          {summary.muscleGroups.length ? (
            summary.muscleGroups.map((group) => <span key={group}>{getMuscleGroupLabel(group)}</span>)
          ) : (
            <p className="route-detail-muted">No muscle groups saved.</p>
          )}
        </div>
      </section>

      <section className="endurance-shell workout-exercise-panel endurance-card">
        <div className="route-section-title workout-section-title-compact">
          <div>
            <p className="eyebrow">Exercise plan</p>
            <h2>Sets, reps & load</h2>
          </div>
          <span>{summary.setCount} sets</span>
        </div>

        {summary.exercises.length ? (
          <div className="workout-exercise-list">
            {summary.exercises.map((exercise, exerciseIndex) => (
              <article key={`${exercise.exercise_id || exercise.name}-${exerciseIndex}`} className="workout-exercise-card">
                <div className="workout-exercise-head">
                  <div>
                    <h3>{exercise.name || "Exercise"}</h3>
                    <p>
                      {(Array.isArray(exercise.muscle_groups) ? exercise.muscle_groups : [])
                        .map(getMuscleGroupLabel)
                        .join(" · ") || "Strength"}
                    </p>
                  </div>
                  <span>{Array.isArray(exercise.sets) ? exercise.sets.length : 0} sets</span>
                </div>

                <div className="workout-set-list">
                  {(Array.isArray(exercise.sets) ? exercise.sets : []).map((set, setIndex) => (
                    <div key={setIndex} className="workout-set-row">
                      <b>Set {setIndex + 1}</b>
                      <span>{set?.reps || "—"} reps</span>
                      <span>{formatLoad(set)}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="route-detail-muted">No exercises saved in this workout yet.</p>
        )}
      </section>

      <section className="endurance-shell route-linked-trainings endurance-card">
        <div className="route-section-title">
          <div>
            <p className="eyebrow">Training usage</p>
            <h2>Sessions with this workout</h2>
          </div>
        </div>

        {linkedTrainings.length ? (
          <div className="route-linked-list">
            {linkedTrainings.map((training) => (
              <Link href={`/trainings/${training.id}`} key={training.id}>
                <strong>{training.title}</strong>
                <span>{formatDate(training.final_starts_at || training.starts_at) || training.planning_type}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="route-detail-muted">No training session uses this workout yet. Start one now and invite your team.</p>
        )}
      </section>

      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
