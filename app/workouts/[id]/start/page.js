"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "../../../../components/AppHeader";
import BottomNav from "../../../../components/BottomNav";
import { supabase } from "../../../../lib/supabase";
import { getSportLabel } from "../../../../lib/trainingHelpers";
import { getMuscleGroupLabel } from "../../../../lib/strengthWorkoutConfig";

function normalizeSets(sets = []) {
  if (!Array.isArray(sets) || !sets.length) {
    return [1, 2, 3].map((number) => ({ set_number: number, reps: null, weight_kg: null, completed: false }));
  }

  return sets.map((set, index) => ({
    set_number: Number(set?.set_number) || index + 1,
    reps: set?.reps ?? "",
    weight_kg: set?.weight_kg ?? "",
    rest_seconds: set?.rest_seconds ?? null,
    completed: false,
  }));
}

function getWorkoutExercises(workout) {
  const exercises = Array.isArray(workout?.structure?.exercises) ? workout.structure.exercises : [];
  return exercises.map((exercise, index) => ({
    id: `${exercise.id || exercise.exercise_id || exercise.name || "exercise"}-${index}`,
    name: exercise.name || exercise.exercise_name_snapshot || "Exercise",
    primary_muscle_group: exercise.primary_muscle_group || exercise.primary_muscle_group_snapshot || "Strength",
    equipment: exercise.equipment || exercise.equipment_snapshot || "",
    position: Number(exercise.position) || index,
    sets: normalizeSets(exercise.sets),
  })).sort((a, b) => a.position - b.position);
}

function formatSetLine(set) {
  const reps = set.reps || "?";
  const weight = set.weight_kg === "" || set.weight_kg === null || set.weight_kg === undefined ? "open" : `${set.weight_kg}kg`;
  return `${reps} @ ${weight}`;
}

function setSummary(sets = []) {
  if (!sets.length) return "No sets";
  const groups = [];
  sets.forEach((set) => {
    const key = formatSetLine(set);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.count += 1;
    else groups.push({ key, count: 1 });
  });
  return groups.map((group) => `${group.count}x ${group.key}`).join(" · ");
}

function getExerciseMeta(exercise) {
  const parts = [exercise.primary_muscle_group ? getMuscleGroupLabel(exercise.primary_muscle_group) : "Strength", exercise.equipment].filter(Boolean);
  return parts.join(" · ");
}

export default function StartWorkoutPage() {
  const params = useParams();
  const router = useRouter();
  const workoutId = params?.id;

  const [profile, setProfile] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [activeExerciseId, setActiveExerciseId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadWorkout();
  }, [workoutId]);

  async function loadWorkout() {
    if (!workoutId) return;
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
        .eq("id", workoutId)
        .maybeSingle();
      if (workoutError) throw workoutError;
      if (!workoutRow) {
        setMessage("Workout not found.");
        return;
      }

      const allowed = workoutRow.visibility === "public" || workoutRow.creator_id === user.id || profileRow?.role === "admin" || profileRow?.role === "moderator";
      if (!allowed) {
        setMessage("You do not have access to start this workout.");
        return;
      }

      const list = getWorkoutExercises(workoutRow);
      setWorkout(workoutRow);
      setExercises(list);
      setActiveExerciseId(list[0]?.id || null);

      const [{ count: notificationCount }, { count: inviteCount }] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
      ]);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    } catch (error) {
      console.error("Start workout load error", error);
      setMessage(error?.message || "Could not load workout.");
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    const totalSets = exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    const completedSets = exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0);
    const percentage = totalSets ? Math.round((completedSets / totalSets) * 100) : 0;
    return { totalSets, completedSets, percentage };
  }, [exercises]);

  function updateSet(exerciseId, setIndex, key, value) {
    setExercises((current) => current.map((exercise) => {
      if (exercise.id !== exerciseId) return exercise;
      return {
        ...exercise,
        sets: exercise.sets.map((set, index) => index === setIndex ? { ...set, [key]: value } : set),
      };
    }));
  }

  function toggleSet(exerciseId, setIndex) {
    setExercises((current) => current.map((exercise) => {
      if (exercise.id !== exerciseId) return exercise;
      return {
        ...exercise,
        sets: exercise.sets.map((set, index) => index === setIndex ? { ...set, completed: !set.completed } : set),
      };
    }));
  }

  function cleanNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function setVolume(set) {
    const reps = cleanNumber(set.reps);
    const weight = cleanNumber(set.weight_kg);
    if (!Number.isFinite(reps) || !Number.isFinite(weight)) return 0;
    return reps * weight;
  }

  async function completeWorkout() {
    if (!profile?.id || !workout?.id) return;
    setSaving(true);
    setMessage("");

    try {
      const startedAt = new Date(Date.now() - 1000 * 60 * 45).toISOString();
      const completedAt = new Date().toISOString();
      const completedExerciseSets = exercises.flatMap((exercise) => exercise.sets.filter((set) => set.completed));
      const totalVolume = completedExerciseSets.reduce((sum, set) => sum + setVolume(set), 0);

      const { data: sessionRow, error: sessionError } = await supabase
        .from("workout_sessions")
        .insert({
          workout_id: workout.id,
          user_id: profile.id,
          started_at: startedAt,
          completed_at: completedAt,
          duration_seconds: 45 * 60,
          notes: null,
          summary: {
            total_sets: totals.totalSets,
            completed_sets: totals.completedSets,
            completion_percentage: totals.percentage,
            total_volume_kg: totalVolume,
            exercise_count: exercises.length,
          },
        })
        .select("id")
        .single();

      if (sessionError) throw sessionError;

      const setRows = exercises.flatMap((exercise, exerciseIndex) => exercise.sets.map((set, setIndex) => ({
        session_id: sessionRow.id,
        exercise_position: exerciseIndex,
        set_number: setIndex + 1,
        exercise_name: exercise.name,
        primary_muscle_group: exercise.primary_muscle_group,
        equipment: exercise.equipment || null,
        reps: cleanNumber(set.reps),
        weight_kg: cleanNumber(set.weight_kg),
        completed: Boolean(set.completed),
      })));

      let insertedSets = [];
      if (setRows.length) {
        const { data: insertedRows, error: setError } = await supabase
          .from("workout_session_sets")
          .insert(setRows)
          .select("id,exercise_name,equipment,reps,weight_kg,completed");
        if (setError) throw setError;
        insertedSets = insertedRows || [];
      }

      const completedSets = insertedSets.filter((row) => row.completed && Number(row.weight_kg) > 0 && Number(row.reps) > 0);
      const prGroups = new Map();
      completedSets.forEach((row) => {
        const normalizedEquipment = row.equipment || "Strength";
        const key = `${row.exercise_name}__${normalizedEquipment}`;
        const volume = Number(row.reps || 0) * Number(row.weight_kg || 0);
        const existing = prGroups.get(key);
        if (!existing || Number(row.weight_kg) > Number(existing.weight_kg) || volume > existing.volume) {
          prGroups.set(key, { ...row, equipment: normalizedEquipment, volume });
        }
      });

      let newPrCount = 0;
      for (const candidate of prGroups.values()) {
        const { data: currentPr } = await supabase
          .from("exercise_prs")
          .select("id,best_weight_kg,best_reps,best_volume")
          .eq("user_id", profile.id)
          .eq("exercise_name", candidate.exercise_name)
          .eq("equipment", candidate.equipment || "Strength")
          .maybeSingle();

        const candidateWeight = Number(candidate.weight_kg || 0);
        const candidateReps = Number(candidate.reps || 0);
        const candidateVolume = Number(candidate.volume || 0);
        const currentWeight = Number(currentPr?.best_weight_kg || 0);
        const currentVolume = Number(currentPr?.best_volume || 0);

        if (!currentPr || candidateWeight > currentWeight || candidateVolume > currentVolume) {
          newPrCount += 1;
          if (currentPr?.id) {
            const { error: prUpdateError } = await supabase
              .from("exercise_prs")
              .update({
                best_weight_kg: candidateWeight,
                best_reps: candidateReps,
                best_volume: candidateVolume,
                session_id: sessionRow.id,
                set_id: candidate.id,
                achieved_at: completedAt,
                updated_at: completedAt,
              })
              .eq("id", currentPr.id);
            if (prUpdateError) throw prUpdateError;
          } else {
            const { error: prInsertError } = await supabase.from("exercise_prs").insert({
              user_id: profile.id,
              exercise_name: candidate.exercise_name,
              equipment: candidate.equipment || "Strength",
              best_weight_kg: candidateWeight,
              best_reps: candidateReps,
              best_volume: candidateVolume,
              session_id: sessionRow.id,
              set_id: candidate.id,
              achieved_at: completedAt,
              updated_at: completedAt,
            });
            if (prInsertError) throw prInsertError;
          }
        }
      }

      router.push(`/workouts/history?completed=${sessionRow.id}&prs=${newPrCount}`);
    } catch (error) {
      console.error("Complete workout error", error);
      setMessage(error?.message || "Could not save workout session. Did you run the workout history SQL migration?");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <AppHeader active="workouts" />
        <section style={styles.shell}><div style={styles.card}>Loading workout...</div></section>
        <BottomNav unreadCount={unreadCount} />
      </main>
    );
  }

  if (!workout) {
    return (
      <main style={styles.page}>
        <AppHeader active="workouts" />
        <section style={styles.shell}>
          <div style={styles.card}>
            <h1 style={styles.title}>Workout unavailable</h1>
            <p style={styles.muted}>{message || "This workout could not be loaded."}</p>
            <Link href="/workouts" style={styles.secondaryButton}>Back to workouts</Link>
          </div>
        </section>
        <BottomNav unreadCount={unreadCount} />
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <AppHeader active="workouts" />
      <section style={styles.shell}>
        <Link href={`/workouts/${workout.id}`} style={styles.backLink}>← Back to workout</Link>

        <header style={styles.hero}>
          <div style={styles.kicker}>Live workout</div>
          <h1 style={styles.title}>{workout.title}</h1>
          <p style={styles.subtitle}>{getSportLabel(workout.sport_id)} · {totals.completedSets}/{totals.totalSets} sets completed</p>
          <div style={styles.progressTrack}><span style={{ ...styles.progressFill, width: `${totals.percentage}%` }} /></div>
          <div style={styles.progressText}>{totals.percentage}% complete</div>
        </header>

        {message ? <div style={styles.message}>{message}</div> : null}

        <section style={styles.exerciseList}>
          {exercises.map((exercise, exerciseIndex) => {
            const isOpen = activeExerciseId === exercise.id;
            const completed = exercise.sets.filter((set) => set.completed).length;
            return (
              <article key={exercise.id} style={styles.exerciseCard}>
                <button type="button" style={styles.exerciseHead} onClick={() => setActiveExerciseId(isOpen ? null : exercise.id)}>
                  <span style={styles.index}>{exerciseIndex + 1}</span>
                  <span style={styles.exerciseCopy}>
                    <strong>{exercise.name}</strong>
                    <small>{setSummary(exercise.sets)}</small>
                    <em>{getExerciseMeta(exercise)}</em>
                  </span>
                  <span style={styles.setBadge}>{completed}/{exercise.sets.length}</span>
                </button>

                {isOpen ? (
                  <div style={styles.setList}>
                    {exercise.sets.map((set, setIndex) => (
                      <div key={`${exercise.id}-${setIndex}`} style={styles.setRow}>
                        <button type="button" onClick={() => toggleSet(exercise.id, setIndex)} style={{ ...styles.checkButton, ...(set.completed ? styles.checkButtonDone : {}) }}>
                          {set.completed ? "✓" : setIndex + 1}
                        </button>
                        <label style={styles.setField}>
                          <span>Reps</span>
                          <input inputMode="numeric" value={set.reps ?? ""} onChange={(event) => updateSet(exercise.id, setIndex, "reps", event.target.value)} />
                        </label>
                        <label style={styles.setField}>
                          <span>Kg</span>
                          <input inputMode="decimal" value={set.weight_kg ?? ""} onChange={(event) => updateSet(exercise.id, setIndex, "weight_kg", event.target.value)} />
                        </label>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <section style={styles.actions}>
          <button type="button" onClick={completeWorkout} disabled={saving || !totals.totalSets} style={styles.primaryButton}>
            {saving ? "Saving..." : "Complete workout"}
          </button>
          <Link href={`/workouts/${workout.id}`} style={styles.secondaryButton}>Finish later</Link>
        </section>
      </section>
      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#050806", color: "#f6ffe8", paddingBottom: 96 },
  shell: { width: "min(100%, 760px)", margin: "0 auto", padding: "14px 14px 110px" },
  backLink: { display: "inline-flex", margin: "8px 0 14px", color: "#c8ff4d", textDecoration: "none", fontWeight: 800 },
  hero: { border: "1px solid rgba(202,255,77,.22)", background: "radial-gradient(circle at top right, rgba(202,255,77,.15), transparent 38%), rgba(12,18,14,.94)", borderRadius: 28, padding: 20, boxShadow: "0 24px 80px rgba(0,0,0,.35)" },
  kicker: { color: "#c8ff4d", fontSize: 12, textTransform: "uppercase", letterSpacing: ".16em", fontWeight: 900 },
  title: { margin: "8px 0 4px", fontSize: 32, lineHeight: 1.02, letterSpacing: "-.05em" },
  subtitle: { margin: 0, color: "rgba(246,255,232,.72)", fontWeight: 700 },
  progressTrack: { height: 9, background: "rgba(255,255,255,.08)", borderRadius: 999, overflow: "hidden", marginTop: 18 },
  progressFill: { display: "block", height: "100%", background: "linear-gradient(90deg,#d7ff42,#66ff8f)", borderRadius: 999, transition: "width .2s ease" },
  progressText: { marginTop: 8, color: "rgba(246,255,232,.68)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" },
  message: { marginTop: 14, padding: 12, borderRadius: 18, background: "rgba(255,255,255,.07)", color: "#f6ffe8", fontWeight: 800 },
  card: { border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", borderRadius: 24, padding: 18 },
  exerciseList: { display: "grid", gap: 8, marginTop: 14 },
  exerciseCard: { border: "1px solid rgba(255,255,255,.11)", background: "rgba(255,255,255,.055)", borderRadius: 20, overflow: "hidden" },
  exerciseHead: { width: "100%", display: "grid", gridTemplateColumns: "30px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "10px 11px", background: "transparent", border: 0, color: "inherit", textAlign: "left" },
  index: { width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(202,255,77,.12)", color: "#d7ff42", fontSize: 12, fontWeight: 900 },
  exerciseCopy: { display: "grid", gap: 2, minWidth: 0 },
  exerciseCopy: { display: "grid", gap: 2, minWidth: 0 },
  setBadge: { border: "1px solid rgba(202,255,77,.2)", borderRadius: 999, padding: "6px 8px", color: "#d7ff42", fontWeight: 900, fontSize: 12 },
  setList: { borderTop: "1px solid rgba(255,255,255,.08)", padding: "8px 10px 10px", display: "grid", gap: 7 },
  setRow: { display: "grid", gridTemplateColumns: "36px 1fr 1fr", gap: 8, alignItems: "end" },
  checkButton: { height: 36, borderRadius: 12, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.06)", color: "#f6ffe8", fontWeight: 900 },
  checkButtonDone: { background: "linear-gradient(135deg,#d7ff42,#7cff8f)", color: "#071006", borderColor: "transparent" },
  setField: { display: "grid", gap: 3, color: "rgba(246,255,232,.58)", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" },
  actions: { display: "grid", gap: 9, marginTop: 14 },
  primaryButton: { border: 0, borderRadius: 18, padding: "15px 16px", background: "linear-gradient(135deg,#d7ff42,#7cff8f)", color: "#071006", fontWeight: 950, fontSize: 15 },
  secondaryButton: { display: "grid", placeItems: "center", border: "1px solid rgba(255,255,255,.14)", borderRadius: 18, padding: "14px 16px", background: "rgba(255,255,255,.06)", color: "#f6ffe8", textDecoration: "none", fontWeight: 900 },
  muted: { color: "rgba(246,255,232,.68)" },
};
