"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import { supabase } from "../../lib/supabase";
import { getSportLabel } from "../../lib/trainingHelpers";
import { getMuscleGroupLabel } from "../../lib/strengthWorkoutConfig";

function describeWorkout(workout) {
  const structure = workout?.structure || {};
  const exercises = Array.isArray(structure.exercises) ? structure.exercises : [];
  const setCount = exercises.reduce((sum, exercise) => sum + (Array.isArray(exercise.sets) ? exercise.sets.length : 0), 0);
  const muscleGroups = Array.isArray(structure.muscle_groups) ? structure.muscle_groups : [];

  return {
    exerciseCount: exercises.length,
    setCount,
    muscleGroups: muscleGroups.map(getMuscleGroupLabel).join(" · "),
  };
}

export default function WorkoutsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [message, setMessage] = useState("Loading workouts...");

  useEffect(() => {
    loadWorkouts();
  }, []);

  async function loadWorkouts() {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      setProfile(profileData);

      const { data, error } = await supabase
        .from("workouts")
        .select("id,creator_id,sport_id,title,description,workout_type,level,duration_min,structure,visibility,created_at,updated_at")
        .or(`visibility.eq.public,creator_id.eq.${user.id}`)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) throw error;
      setWorkouts(data || []);
      setMessage("");
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Could not load workouts.");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Workouts</div>
          <div style={styles.titleRow}>
            <h1 style={styles.title}>Build the work.</h1>
          </div>
          <p style={styles.subtitle}>
            Create reusable workout structures. Strength starts with muscle groups, relevant exercises,
            and sets with reps and load per set.
          </p>
        </header>

        <section style={styles.heroCard}>
          <div>
            <div style={styles.kickerSmall}>Strength MVP</div>
            <h2 style={styles.heroTitle}>Muscle groups → exercises → sets</h2>
            <p style={styles.heroText}>
              Start with Chest, Back, Shoulders, Biceps, Triceps, Legs and Core. Endurance only shows
              relevant strength exercises for the selected muscle groups.
            </p>
          </div>
          <button onClick={() => router.push("/workouts/new")} style={styles.heroButton}>Create strength workout</button>
        </section>

        {message ? <section style={styles.message}>{message}</section> : null}

        {!message && !workouts.length ? (
          <section style={styles.emptyCard}>
            <h2>No workouts yet.</h2>
            <p>Create your first reusable strength workout.</p>
            <button onClick={() => router.push("/workouts/new")} style={styles.primaryButton}>Create first workout</button>
          </section>
        ) : null}

        {workouts.length ? (
          <section style={styles.grid}>
            {workouts.map((workout) => {
              const summary = describeWorkout(workout);
              return (
                <article key={workout.id} style={styles.card}>
                  <div style={styles.cardTop}>
                    <span style={styles.sportBadge}>{getSportLabel(workout.sport_id)}</span>
                    <span style={styles.visibilityBadge}>{workout.visibility}</span>
                  </div>

                  <h2 style={styles.cardTitle}>{workout.title}</h2>
                  {workout.description ? <p style={styles.cardText}>{workout.description}</p> : null}

                  {summary.muscleGroups ? <p style={styles.muscleLine}>{summary.muscleGroups}</p> : null}

                  <div style={styles.facts}>
                    <span>{workout.workout_type || "Workout"}</span>
                    <span>{summary.exerciseCount ? `${summary.exerciseCount} exercises` : "No exercises yet"}</span>
                    <span>{summary.setCount ? `${summary.setCount} sets` : "No sets yet"}</span>
                    <span>{workout.duration_min ? `${workout.duration_min} min` : "Duration not set"}</span>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}
      </section>
      <BottomNav />
    </main>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 16px 132px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: { width: "100%", maxWidth: 960, margin: "0 auto", display: "grid", gap: 18 },
  header: { display: "grid", gap: 10 },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  kickerSmall: { color: "#e4ef16", fontSize: 11, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  titleRow: { display: "grid", gap: 12 },
  title: { margin: 0, fontSize: "clamp(38px, 11vw, 64px)", lineHeight: 0.96, letterSpacing: "-0.065em" },
  subtitle: { margin: 0, maxWidth: 680, color: "rgba(255,255,255,0.68)", lineHeight: 1.5 },
  primaryButton: { minHeight: 46, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", padding: "0 16px", fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" },
  heroCard: { borderRadius: 32, padding: 20, background: "linear-gradient(145deg, rgba(228,239,22,0.16), rgba(255,255,255,0.055))", border: "1px solid rgba(228,239,22,0.22)", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, alignItems: "center" },
  heroTitle: { margin: "4px 0 0", fontSize: 28, letterSpacing: "-0.05em", lineHeight: 1 },
  heroText: { margin: "8px 0 0", color: "rgba(255,255,255,0.70)", lineHeight: 1.5 },
  heroButton: { minHeight: 46, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", padding: "0 16px", fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" },
  message: { borderRadius: 22, padding: 14, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.18)", color: "#e4ef16", fontWeight: 850 },
  emptyCard: { borderRadius: 30, padding: 22, background: glass, border: "1px solid rgba(255,255,255,0.13)" },
  grid: { display: "grid", gap: 16 },
  card: { borderRadius: 30, padding: 20, background: glass, border: "1px solid rgba(255,255,255,0.13)", boxShadow: "0 24px 70px rgba(0,0,0,0.30)", display: "grid", gap: 14 },
  cardTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" },
  sportBadge: { display: "inline-flex", borderRadius: 999, padding: "8px 12px", background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.28)", color: "#e4ef16", fontWeight: 950 },
  visibilityBadge: { display: "inline-flex", borderRadius: 999, padding: "8px 12px", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.80)", textTransform: "capitalize", fontWeight: 900 },
  cardTitle: { margin: 0, fontSize: 30, letterSpacing: "-0.055em", lineHeight: 1 },
  cardText: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.45 },
  muscleLine: { margin: 0, color: "#e4ef16", fontWeight: 900, lineHeight: 1.35 },
  facts: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, color: "rgba(255,255,255,0.68)", fontWeight: 750 },
};
