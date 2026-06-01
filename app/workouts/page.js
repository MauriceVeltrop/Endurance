"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import WorkoutCard from "../../components/workouts/WorkoutCard";
import { supabase } from "../../lib/supabase";
import { getSportLabel } from "../../lib/trainingHelpers";

function matchesSearch(workout, search) {
  if (!search) return true;

  const structure = workout?.structure || {};
  const exercises = Array.isArray(structure.exercises) ? structure.exercises : [];
  const haystack = [
    workout.title,
    workout.description,
    workout.visibility,
    workout.sport_id,
    getSportLabel(workout.sport_id),
    workout.workout_type,
    ...(Array.isArray(structure.muscle_groups) ? structure.muscle_groups : []),
    ...exercises.map((exercise) => exercise.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function matchesTab(workout, activeTab) {
  if (activeTab === "all") return true;
  if (activeTab === "my") return workout._isOwnWorkout;
  if (activeTab === "public") return workout.visibility === "public";
  if (activeTab === "strength") return workout.sport_id === "strength_training" || workout.workout_type === "strength";
  return workout.sport_id === activeTab;
}

function firstNameFromProfile(profile) {
  return profile?.first_name || String(profile?.name || "").split(" ")[0] || "Maurice";
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function workoutSummary(workout) {
  const structure = workout?.structure || {};
  const exercises = Array.isArray(structure.exercises) ? structure.exercises : [];
  const setCount = exercises.reduce((sum, exercise) => sum + (Array.isArray(exercise.sets) ? exercise.sets.length : 0), 0);
  return { exerciseCount: exercises.length, setCount };
}

export default function WorkoutsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [preferredSportIds, setPreferredSportIds] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadWorkouts() {
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

      if (profileRow?.blocked) {
        setProfile(profileRow);
        setWorkouts([]);
        setMessage("Your account is blocked. Contact an administrator.");
        return;
      }

      setProfile(profileRow);

      const { data: sportRows, error: sportError } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);

      if (sportError) throw sportError;

      const allowedSports = (sportRows || []).map((row) => row.sport_id).filter(Boolean);
      setPreferredSportIds(allowedSports);

      const { data, error } = await supabase
        .from("workouts")
        .select("id,creator_id,sport_id,title,description,workout_type,level,duration_min,structure,visibility,created_at,updated_at")
        .or(`visibility.eq.public,creator_id.eq.${user.id}`)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) throw error;

      const visibleWorkouts =
        profileRow?.role === "admin" || profileRow?.role === "moderator"
          ? data || []
          : (data || []).filter((workout) => allowedSports.includes(workout.sport_id) || workout.creator_id === user.id);

      setWorkouts(
        visibleWorkouts.map((workout) => ({
          ...workout,
          _isOwnWorkout: workout.creator_id === user.id,
        }))
      );

      const [{ count: notificationCount }, { count: inviteCount }] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
      ]);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    } catch (error) {
      console.error("Workouts load error", error);
      setMessage(error?.message || "Could not load workouts.");
      setWorkouts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkouts();
  }, []);

  const strengthCount = workouts.filter((workout) => workout.sport_id === "strength_training" || workout.workout_type === "strength").length;
  const ownWorkoutCount = workouts.filter((workout) => workout._isOwnWorkout).length;
  const totalExercises = workouts.reduce((sum, workout) => sum + workoutSummary(workout).exerciseCount, 0);
  const totalSets = workouts.reduce((sum, workout) => sum + workoutSummary(workout).setCount, 0);

  const tabs = useMemo(() => {
    const sportTabs = preferredSportIds
      .filter((sportId) => sportId !== "strength_training")
      .slice(0, 2)
      .map((sportId) => ({ id: sportId, label: getSportLabel(sportId) }));

    return [
      { id: "all", label: "All workouts" },
      { id: "strength", label: "Strength" },
      { id: "my", label: "My workouts" },
      { id: "public", label: "Public" },
      ...sportTabs,
    ];
  }, [preferredSportIds]);

  const filteredWorkouts = workouts
    .filter((workout) => matchesSearch(workout, search))
    .filter((workout) => matchesTab(workout, activeTab));

  return (
    <main className="endurance-page route-feed-page workout-feed-page training-feed-multisport-hero route-feed-multisport-layout">
      <section className="training-feed-hero-shell route-hero-shell">
        <AppHeader active="workouts" />

        <section className="endurance-shell training-dashboard route-dashboard">
          <div className="training-dashboard-top">
            <div>
              <p className="training-greeting">{getGreeting()}, {firstNameFromProfile(profile)}</p>
              <p className="training-subline">
                <strong>{filteredWorkouts.length}</strong> workout{filteredWorkouts.length === 1 ? "" : "s"} ready for your sports
              </p>
            </div>
            <Link href="/workouts/new" className="primary-action route-create-hero-btn workout-create-hero-btn">
              + Create workout
            </Link>
          </div>

          <div className="training-metric-row route-metric-row">
            <div className="training-metric-tile">
              <span>▦</span>
              <strong>{loading ? "…" : workouts.length}</strong>
              <small>Workouts</small>
            </div>
            <div className="training-metric-tile">
              <span>🏋</span>
              <strong>{loading ? "…" : strengthCount}</strong>
              <small>Strength</small>
            </div>
            <div className="training-metric-tile">
              <span>▤</span>
              <strong>{loading ? "…" : totalExercises}</strong>
              <small>Exercises</small>
            </div>
            <div className="training-metric-tile">
              <span>☰</span>
              <strong>{loading ? "…" : totalSets}</strong>
              <small>Sets</small>
            </div>
          </div>
        </section>
      </section>

      <section className="endurance-shell smart-search-row premium-feed-controls route-feed-controls">
        <label className="feed-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search workout, exercise or muscle group..."
          />
        </label>

        <div className="premium-tabs-row route-tabs-row">
          <div className="training-tabs route-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "active" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <select
            value={activeTab}
            onChange={(event) => setActiveTab(event.target.value)}
            className="feed-select-pill"
            aria-label="Workout filter"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="endurance-shell training-feed-stack route-feed-stack">
        {loading && <div className="endurance-card notification-empty">Loading workouts...</div>}

        {!loading && message ? (
          <div className="endurance-card notification-empty">
            <h2>Could not load workouts</h2>
            <p>{message}</p>
            <button type="button" className="primary-action" onClick={loadWorkouts}>
              Try again
            </button>
          </div>
        ) : null}

        {!loading && !message && filteredWorkouts.map((workout) => <WorkoutCard key={workout.id} workout={workout} />)}

        {!loading && !message && !filteredWorkouts.length ? (
          <div className="endurance-card notification-empty">
            <h2>No workouts found</h2>
            <p>Create a workout or change your filters.</p>
            <Link href="/workouts/new" className="primary-action">
              Create workout
            </Link>
          </div>
        ) : null}
      </section>

      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
