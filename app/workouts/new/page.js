"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import BottomNav from "../../../components/BottomNav";
import { supabase } from "../../../lib/supabase";
import {
  getExerciseById,
  getMuscleGroupLabel,
  strengthExercises,
  strengthMuscleGroups,
} from "../../../lib/strengthWorkoutConfig";

const emptySet = (index) => ({ set: index + 1, reps: "", weight_kg: "" });

function createExerciseBlock(exercise) {
  return {
    id: `${exercise.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    exercise_id: exercise.id,
    name: exercise.name,
    muscle_groups: exercise.muscleGroups,
    sets: [emptySet(0), emptySet(1), emptySet(2)],
  };
}

export default function NewWorkoutPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [allowedSportIds, setAllowedSportIds] = useState([]);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("Strength Workout");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [selectedExercises, setSelectedExercises] = useState([]);

  useEffect(() => {
    loadAccess();
  }, []);

  async function loadAccess() {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      setProfile(profileData);

      const { data: sportRows, error: sportsError } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);

      if (sportsError) throw sportsError;
      setAllowedSportIds((sportRows || []).map((row) => row.sport_id).filter(Boolean));
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Could not prepare workout builder.");
    } finally {
      setChecking(false);
    }
  }

  const canCreateStrength = allowedSportIds.includes("strength_training");

  const filteredExercises = useMemo(() => {
    if (!selectedGroups.length) return [];
    return strengthExercises.filter((exercise) =>
      exercise.muscleGroups.some((group) => selectedGroups.includes(group))
    );
  }, [selectedGroups]);

  const selectedExerciseIds = useMemo(
    () => new Set(selectedExercises.map((exercise) => exercise.exercise_id)),
    [selectedExercises]
  );

  function toggleGroup(groupId) {
    setSelectedGroups((current) => {
      if (current.includes(groupId)) return current.filter((id) => id !== groupId);
      return [...current, groupId];
    });
  }

  function addExercise(exerciseId) {
    const exercise = getExerciseById(exerciseId);
    if (!exercise || selectedExerciseIds.has(exercise.id)) return;
    setSelectedExercises((current) => [...current, createExerciseBlock(exercise)]);
  }

  function removeExercise(blockId) {
    setSelectedExercises((current) => current.filter((exercise) => exercise.id !== blockId));
  }

  function updateSet(blockId, setIndex, key, value) {
    setSelectedExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== blockId) return exercise;
        const sets = exercise.sets.map((set, index) =>
          index === setIndex ? { ...set, [key]: value } : set
        );
        return { ...exercise, sets };
      })
    );
  }

  function addSet(blockId) {
    setSelectedExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== blockId) return exercise;
        return { ...exercise, sets: [...exercise.sets, emptySet(exercise.sets.length)] };
      })
    );
  }

  function removeSet(blockId, setIndex) {
    setSelectedExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== blockId) return exercise;
        const sets = exercise.sets
          .filter((_, index) => index !== setIndex)
          .map((set, index) => ({ ...set, set: index + 1 }));
        return { ...exercise, sets: sets.length ? sets : [emptySet(0)] };
      })
    );
  }

  function normalizeExercise(exercise) {
    return {
      exercise_id: exercise.exercise_id,
      name: exercise.name,
      muscle_groups: exercise.muscle_groups,
      sets: exercise.sets.map((set, index) => ({
        set: index + 1,
        reps: set.reps === "" ? null : Number(set.reps),
        weight_kg: set.weight_kg === "" ? null : Number(set.weight_kg),
      })),
    };
  }

  async function saveWorkout(event) {
    event.preventDefault();
    setMessage("");

    if (!profile?.id) {
      router.replace("/login");
      return;
    }

    if (!canCreateStrength) {
      setMessage("Add Strength Training to your preferred sports before creating strength workouts.");
      return;
    }

    if (!title.trim()) {
      setMessage("Add a workout title.");
      return;
    }

    if (!selectedGroups.length) {
      setMessage("Choose at least one muscle group.");
      return;
    }

    if (!selectedExercises.length) {
      setMessage("Add at least one exercise.");
      return;
    }

    try {
      setSaving(true);
      const normalizedExercises = selectedExercises.map(normalizeExercise);

      const { error } = await supabase.from("workouts").insert({
        creator_id: profile.id,
        sport_id: "strength_training",
        title: title.trim(),
        description: description.trim() || null,
        workout_type: "strength",
        level: null,
        duration_min: null,
        structure: {
          type: "strength",
          muscle_groups: selectedGroups,
          exercises: normalizedExercises,
        },
        visibility,
      });

      if (error) throw error;
      router.push("/workouts");
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Could not save workout.");
    } finally {
      setSaving(false);
    }
  }

  const exerciseCount = selectedExercises.length;
  const setCount = selectedExercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <Link href="/workouts" style={styles.backLink}>← Back to workouts</Link>

        <header style={styles.header}>
          <div style={styles.kicker}>Strength workout builder</div>
          <h1 style={styles.title}>Build by muscle group.</h1>
          <p style={styles.subtitle}>
            Choose the muscle groups first. Endurance then shows only relevant strength exercises,
            with sets, reps and weight per set.
          </p>
        </header>

        {message ? <section style={styles.message}>{message}</section> : null}

        {checking ? (
          <section style={styles.card}>Checking profile...</section>
        ) : !canCreateStrength ? (
          <section style={styles.emptyCard}>
            <h2 style={styles.emptyTitle}>Strength is not in your preferred sports yet.</h2>
            <p style={styles.emptyText}>
              Add Strength Training to your preferred sports before creating strength workouts.
            </p>
            <button type="button" onClick={() => router.push("/profile/edit")} style={styles.primaryButton}>
              Edit preferred sports
            </button>
          </section>
        ) : (
          <form onSubmit={saveWorkout} style={styles.form}>
            <section style={styles.card}>
              <div style={styles.formGrid}>
                <label style={styles.field}>
                  <span>Workout title</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} style={styles.input} />
                </label>

                <label style={styles.field}>
                  <span>Visibility</span>
                  <select value={visibility} onChange={(event) => setVisibility(event.target.value)} style={styles.input}>
                    <option value="public">Public</option>
                    <option value="team">Team</option>
                    <option value="private">Private</option>
                    <option value="selected">Selected people</option>
                    <option value="group">Group</option>
                  </select>
                </label>

                <label style={styles.fieldFull}>
                  <span>Description</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Optional notes for this workout"
                    style={styles.textarea}
                  />
                </label>
              </div>
            </section>

            <section style={styles.card}>
              <div style={styles.sectionTop}>
                <div>
                  <div style={styles.kickerSmall}>Step 1</div>
                  <h2 style={styles.sectionTitle}>Choose muscle groups</h2>
                </div>
                <span style={styles.counterBadge}>{selectedGroups.length} selected</span>
              </div>

              <div style={styles.groupGrid}>
                {strengthMuscleGroups.map((group) => {
                  const active = selectedGroups.includes(group.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      style={{ ...styles.groupButton, ...(active ? styles.groupButtonActive : {}) }}
                    >
                      {group.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={styles.card}>
              <div style={styles.sectionTop}>
                <div>
                  <div style={styles.kickerSmall}>Step 2</div>
                  <h2 style={styles.sectionTitle}>Add relevant exercises</h2>
                </div>
                <span style={styles.counterBadge}>{filteredExercises.length} available</span>
              </div>

              {!selectedGroups.length ? (
                <p style={styles.mutedText}>Select one or more muscle groups to show matching exercises.</p>
              ) : (
                <div style={styles.exerciseGrid}>
                  {filteredExercises.map((exercise) => {
                    const added = selectedExerciseIds.has(exercise.id);
                    return (
                      <button
                        key={exercise.id}
                        type="button"
                        onClick={() => addExercise(exercise.id)}
                        disabled={added}
                        style={{ ...styles.exerciseButton, ...(added ? styles.exerciseButtonAdded : {}) }}
                      >
                        <strong>{added ? "✓ " : "+ "}{exercise.name}</strong>
                        <span>{exercise.muscleGroups.map(getMuscleGroupLabel).join(" · ")}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section style={styles.card}>
              <div style={styles.sectionTop}>
                <div>
                  <div style={styles.kickerSmall}>Step 3</div>
                  <h2 style={styles.sectionTitle}>Sets, reps and load</h2>
                </div>
                <span style={styles.counterBadge}>{exerciseCount} exercises · {setCount} sets</span>
              </div>

              {!selectedExercises.length ? (
                <p style={styles.mutedText}>Added exercises will appear here.</p>
              ) : (
                <div style={styles.selectedStack}>
                  {selectedExercises.map((exercise) => (
                    <article key={exercise.id} style={styles.exerciseCard}>
                      <div style={styles.exerciseCardTop}>
                        <div>
                          <h3 style={styles.exerciseTitle}>{exercise.name}</h3>
                          <p style={styles.exerciseMeta}>{exercise.muscle_groups.map(getMuscleGroupLabel).join(" · ")}</p>
                        </div>
                        <button type="button" onClick={() => removeExercise(exercise.id)} style={styles.removeButton}>Remove</button>
                      </div>

                      <div style={styles.setHeader}>
                        <span>Set</span>
                        <span>Reps</span>
                        <span>Weight kg</span>
                        <span></span>
                      </div>

                      {exercise.sets.map((set, setIndex) => (
                        <div key={`${exercise.id}-${setIndex}`} style={styles.setRow}>
                          <strong style={styles.setNumber}>{setIndex + 1}</strong>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={set.reps}
                            onChange={(event) => updateSet(exercise.id, setIndex, "reps", event.target.value)}
                            style={styles.setInput}
                            placeholder="8"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            inputMode="decimal"
                            value={set.weight_kg}
                            onChange={(event) => updateSet(exercise.id, setIndex, "weight_kg", event.target.value)}
                            style={styles.setInput}
                            placeholder="80"
                          />
                          <button type="button" onClick={() => removeSet(exercise.id, setIndex)} style={styles.tinyButton}>×</button>
                        </div>
                      ))}

                      <button type="button" onClick={() => addSet(exercise.id)} style={styles.addSetButton}>+ Add set</button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <button type="submit" disabled={saving} style={styles.submitButton}>
              {saving ? "Saving..." : "Save strength workout"}
            </button>
          </form>
        )}
      </section>
      <BottomNav />
    </main>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 16px 132px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: { width: "100%", maxWidth: 980, margin: "0 auto", display: "grid", gap: 18 },
  backLink: {
    width: "fit-content",
    color: "#e4ef16",
    textDecoration: "none",
    fontWeight: 950,
    border: "1px solid rgba(228,239,22,0.24)",
    borderRadius: 999,
    padding: "10px 14px",
    background: "rgba(228,239,22,0.08)",
  },
  header: { display: "grid", gap: 8 },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  kickerSmall: { color: "#e4ef16", fontSize: 11, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  title: { margin: 0, fontSize: "clamp(38px, 10vw, 66px)", lineHeight: 0.96, letterSpacing: "-0.065em" },
  subtitle: { margin: 0, maxWidth: 720, color: "rgba(255,255,255,0.68)", lineHeight: 1.5 },
  message: {
    borderRadius: 22,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  form: { display: "grid", gap: 16 },
  card: { borderRadius: 32, padding: 20, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gap: 16 },
  emptyCard: { borderRadius: 32, padding: 22, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gap: 12 },
  emptyTitle: { margin: 0, fontSize: 26, letterSpacing: "-0.04em" },
  emptyText: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.5 },
  primaryButton: { minHeight: 46, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", padding: "0 16px", fontWeight: 950, cursor: "pointer", justifySelf: "start" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 },
  field: { display: "grid", gap: 7, color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 13 },
  fieldFull: { gridColumn: "1 / -1", display: "grid", gap: 7, color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 13 },
  input: { width: "100%", minHeight: 48, borderRadius: 16, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.24)", color: "white", padding: "0 12px", boxSizing: "border-box", outline: "none", fontSize: 15 },
  textarea: { width: "100%", minHeight: 88, borderRadius: 16, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.24)", color: "white", padding: 12, boxSizing: "border-box", outline: "none", fontSize: 15, resize: "vertical" },
  sectionTop: { display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 },
  sectionTitle: { margin: "3px 0 0", fontSize: 26, lineHeight: 1, letterSpacing: "-0.05em" },
  counterBadge: { borderRadius: 999, padding: "8px 11px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.78)", fontWeight: 900, whiteSpace: "nowrap", fontSize: 12 },
  groupGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 10 },
  groupButton: { minHeight: 50, borderRadius: 18, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(255,255,255,0.07)", color: "white", fontWeight: 950, cursor: "pointer" },
  groupButtonActive: { background: "rgba(228,239,22,0.16)", border: "1px solid rgba(228,239,22,0.45)", color: "#e4ef16" },
  exerciseGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 },
  exerciseButton: { minHeight: 76, borderRadius: 20, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "white", padding: 12, display: "grid", gap: 5, textAlign: "left", cursor: "pointer" },
  exerciseButtonAdded: { opacity: 0.62, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.24)", cursor: "default" },
  mutedText: { margin: 0, color: "rgba(255,255,255,0.62)", lineHeight: 1.5 },
  selectedStack: { display: "grid", gap: 14 },
  exerciseCard: { borderRadius: 24, padding: 14, background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.10)", display: "grid", gap: 12 },
  exerciseCardTop: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" },
  exerciseTitle: { margin: 0, fontSize: 21, letterSpacing: "-0.04em" },
  exerciseMeta: { margin: "5px 0 0", color: "rgba(255,255,255,0.58)", fontWeight: 750, fontSize: 13 },
  removeButton: { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "white", borderRadius: 999, padding: "9px 11px", fontWeight: 900, cursor: "pointer" },
  setHeader: { display: "grid", gridTemplateColumns: "48px 1fr 1fr 40px", gap: 8, color: "rgba(255,255,255,0.52)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" },
  setRow: { display: "grid", gridTemplateColumns: "48px 1fr 1fr 40px", gap: 8, alignItems: "center" },
  setNumber: { width: 36, height: 36, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(228,239,22,0.12)", color: "#e4ef16" },
  setInput: { width: "100%", minHeight: 42, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.24)", color: "white", padding: "0 10px", boxSizing: "border-box", fontSize: 15, outline: "none" },
  tinyButton: { width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "white", fontWeight: 950, cursor: "pointer" },
  addSetButton: { minHeight: 42, borderRadius: 999, border: "1px solid rgba(228,239,22,0.26)", background: "rgba(228,239,22,0.08)", color: "#e4ef16", fontWeight: 950, cursor: "pointer", justifySelf: "start", padding: "0 14px" },
  submitButton: { minHeight: 56, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", fontWeight: 950, fontSize: 16, cursor: "pointer" },
};
