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

const workoutSportIds = ["strength_training", "hyrox", "crossfit", "bootcamp"];

function matchesFilters(workout, ownershipFilter, sportFilter) {
  if (ownershipFilter === "my" && !workout._isOwnWorkout) return false;
  if (ownershipFilter === "team" && (workout._isOwnWorkout || workout.visibility !== "team")) return false;
  if (ownershipFilter === "groups" && workout.visibility !== "group") return false;

  if (sportFilter !== "all" && workout.sport_id !== sportFilter) return false;

  return true;
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
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [sportFilter, setSportFilter] = useState("all");
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


  const ownershipTabs = [
    { id: "all", label: "All" },
    { id: "my", label: "My" },
    { id: "team", label: "Team" },
    { id: "groups", label: "Groups" },
  ];

  const sportTabs = useMemo(() => {
    const preferredWorkoutSports = preferredSportIds.filter((sportId) => workoutSportIds.includes(sportId));
    const fallbackSports = preferredWorkoutSports.length ? preferredWorkoutSports : ["strength_training", "hyrox", "crossfit", "bootcamp"];

    return [
      { id: "all", label: "All types" },
      ...fallbackSports.map((sportId) => ({ id: sportId, label: getSportLabel(sportId) })),
    ];
  }, [preferredSportIds]);


  const filteredWorkouts = workouts
    .filter((workout) => matchesSearch(workout, search))
    .filter((workout) => matchesFilters(workout, ownershipFilter, sportFilter));

  return (
    <main className="endurance-page workout-feed-page training-feed-multisport-hero">
      <section className="training-feed-hero-shell workout-hero-shell">
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

        <div className="workout-filter-stack">
          <div className="training-tabs route-tabs workout-filter-row" aria-label="Workout ownership filter">
            {ownershipTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={ownershipFilter === tab.id ? "active" : ""}
                onClick={() => setOwnershipFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="training-tabs route-tabs workout-filter-row" aria-label="Workout type filter">
            {sportTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={sportFilter === tab.id ? "active" : ""}
                onClick={() => setSportFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
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
