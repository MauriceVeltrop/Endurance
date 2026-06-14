"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import BottomNav from "../../../components/BottomNav";
import { supabase } from "../../../lib/supabase";

const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core"];
const EQUIPMENT_OPTIONS = ["Barbell", "Dumbbell", "Cable", "Machine", "Smith Machine", "Bodyweight", "Kettlebell", "Band", "Trap Bar", "Plate Loaded"];

const STARTER_EXERCISES = [
  ["Bench Press (Barbell)", "Chest", "Barbell"],
  ["Bench Press (Dumbbell)", "Chest", "Dumbbell"],
  ["Incline Bench Press (Dumbbell)", "Chest", "Dumbbell"],
  ["Cable Crossover", "Chest", "Cable"],
  ["Push Up", "Chest", "Bodyweight"],
  ["Pull Up", "Back", "Bodyweight"],
  ["Lat Pulldown (Cable)", "Back", "Cable"],
  ["Seated Row (Cable)", "Back", "Cable"],
  ["Bent Over Row (Barbell)", "Back", "Barbell"],
  ["T Bar Row", "Back", "Machine"],
  ["Overhead Press (Barbell)", "Shoulders", "Barbell"],
  ["Overhead Press (Dumbbell)", "Shoulders", "Dumbbell"],
  ["Lateral Raise (Dumbbell)", "Shoulders", "Dumbbell"],
  ["Face Pull (Cable)", "Shoulders", "Cable"],
  ["Bicep Curl (Barbell)", "Biceps", "Barbell"],
  ["Bicep Curl (Dumbbell)", "Biceps", "Dumbbell"],
  ["Hammer Curl (Dumbbell)", "Biceps", "Dumbbell"],
  ["Preacher Curl (Barbell)", "Biceps", "Barbell"],
  ["Triceps Pushdown (Cable)", "Triceps", "Cable"],
  ["Skullcrusher (Barbell)", "Triceps", "Barbell"],
  ["Close Grip Bench Press (Barbell)", "Triceps", "Barbell"],
  ["Bench Dip", "Triceps", "Bodyweight"],
  ["Squat (Barbell)", "Legs", "Barbell"],
  ["Leg Press", "Legs", "Machine"],
  ["Leg Extension (Machine)", "Legs", "Machine"],
  ["Lying Leg Curl (Machine)", "Legs", "Machine"],
  ["Romanian Deadlift (Dumbbell)", "Legs", "Dumbbell"],
  ["Trap Bar Deadlift", "Legs", "Trap Bar"],
  ["Bulgarian Split Squat", "Legs", "Bodyweight"],
  ["Hip Thrust (Barbell)", "Legs", "Barbell"],
  ["Plank", "Core", "Bodyweight"],
  ["Cable Crunch", "Core", "Cable"],
  ["Hanging Leg Raise", "Core", "Bodyweight"],
  ["Ab Wheel", "Core", "Bodyweight"],
].map((item, index) => ({
  id: `starter-${index}`,
  source: "snapshot",
  name: item[0],
  primary_muscle_group: item[1],
  equipment: item[2],
  image_url: "",
}));

function makeId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstName(profile) {
  return profile?.first_name || String(profile?.name || "").split(" ")[0] || "Maurice";
}

function normalizeExercise(row, source) {
  return {
    id: row.id,
    source,
    name: row.name,
    primary_muscle_group: row.primary_muscle_group,
    equipment: row.equipment || "",
    image_url: row.image_url || "",
  };
}

function defaultSets(goal = "hypertrophy") {
  const prescription =
    goal === "strength"
      ? { reps: "5", rest_seconds: "150" }
      : goal === "endurance"
        ? { reps: "15", rest_seconds: "45" }
        : { reps: "10", rest_seconds: "90" };

  return [1, 2, 3].map((setNumber) => ({
    id: makeId("set"),
    set_number: setNumber,
    reps: prescription.reps,
    weight_kg: "",
    rest_seconds: prescription.rest_seconds,
  }));
}

function muscleIcon(group) {
  return `/illustrations/workout-builder/${String(group || "muscle").toLowerCase()}.svg`;
}

function exerciseKey(exercise) {
  return `${exercise.source}-${exercise.id}`;
}

function summarizeSets(sets = []) {
  if (!sets.length) return "No sets yet";
  const first = sets[0];
  const reps = first.reps || "?";
  const weight = first.weight_kg ? `${first.weight_kg} kg` : "open";
  return `${sets.length} sets • ${reps} reps • ${weight}`;
}

export default function NewWorkoutPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const [step, setStep] = useState("method");
  const [method, setMethod] = useState("");
  const [goal, setGoal] = useState("hypertrophy");
  const [selectedMuscles, setSelectedMuscles] = useState([]);
  const [exerciseCatalog, setExerciseCatalog] = useState(STARTER_EXERCISES);
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({
    name: "",
    primary_muscle_group: "Chest",
    equipment: "",
    notes: "",
  });

  const [form, setForm] = useState({
    sport_id: "strength_training",
    title: "",
    description: "",
    visibility: "team",
    level: "intermediate",
    duration_min: "60",
    workout_type: "strength",
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setChecking(true);
    setMessage("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id,name,first_name,last_name,email,avatar_url,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (profileRow?.blocked) {
        await supabase.auth.signOut();
        router.replace("/login?blocked=1");
        return;
      }

      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      setProfile(profileRow || null);

      const [{ data: globalExercises }, { data: customExercises }, { count: notificationCount }, { count: inviteCount }] =
        await Promise.all([
          supabase
            .from("strength_exercises")
            .select("id,name,primary_muscle_group,equipment,image_url,active")
            .eq("active", true)
            .order("primary_muscle_group", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .from("user_strength_exercises")
            .select("id,name,primary_muscle_group,equipment,image_url,active")
            .eq("user_id", user.id)
            .eq("active", true)
            .order("primary_muscle_group", { ascending: true })
            .order("name", { ascending: true }),
          supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
          supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
        ]);

      const normalized = [
        ...(Array.isArray(globalExercises) && globalExercises.length ? globalExercises.map((row) => normalizeExercise(row, "global")) : []),
        ...(Array.isArray(customExercises) ? customExercises.map((row) => normalizeExercise(row, "custom")) : []),
      ];

      setExerciseCatalog(normalized.length ? normalized : STARTER_EXERCISES);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    } catch (error) {
      console.error("Workout builder load error", error);
      setExerciseCatalog(STARTER_EXERCISES);
      setMessage(error?.message || "Could not load workout builder.");
    } finally {
      setChecking(false);
    }
  }

  const filteredExercises = useMemo(() => {
    const groups = selectedMuscles.length ? selectedMuscles : MUSCLE_GROUPS;
    return exerciseCatalog.filter((exercise) => groups.includes(exercise.primary_muscle_group));
  }, [exerciseCatalog, selectedMuscles]);

  const groupedExercises = useMemo(() => {
    const result = {};
    MUSCLE_GROUPS.forEach((group) => {
      result[group] = filteredExercises.filter((exercise) => exercise.primary_muscle_group === group);
    });
    return result;
  }, [filteredExercises]);

  const selectedMuscleSummary = selectedMuscles.length ? selectedMuscles.join(", ") : "No muscle groups selected";
  const selectedSetCount = selectedExercises.reduce((sum, item) => sum + item.sets.length, 0);
  const builderSteps = ["Method", "Muscle Groups", "Exercises", "Finish"];
  const stepIndex = step === "method" ? 1 : step === "muscles" ? 2 : step === "exercises" ? 3 : 4;

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseMethod(nextMethod) {
    setMethod(nextMethod);
    if (nextMethod === "wizard") {
      setGoal("hypertrophy");
      setSelectedMuscles(["Chest", "Back", "Legs"]);
      setForm((current) => ({
        ...current,
        title: current.title || `${firstName(profile)} Strength Training Workout`,
        description: current.description || "Generated first proposal. Adjust exercises, sets and weights before saving.",
      }));
    } else {
      setForm((current) => ({
        ...current,
        title: current.title || `${firstName(profile)} Strength Training Workout`,
      }));
    }
    setStep("muscles");
  }

  function toggleMuscle(group) {
    setSelectedMuscles((current) =>
      current.includes(group)
        ? current.filter((item) => item !== group)
        : [...current, group]
    );
  }

  function addExercise(exercise) {
    if (!exercise) return;

    setSelectedExercises((current) => {
      if (current.some((item) => exerciseKey(item.exercise) === exerciseKey(exercise))) return current;
      return [
        ...current,
        {
          id: makeId("selected"),
          exercise,
          notes: "",
          sets: defaultSets(goal),
        },
      ];
    });
  }

  function removeExercise(localId) {
    setSelectedExercises((current) => current.filter((item) => item.id !== localId));
  }

  function toggleExercise(exercise) {
    const existing = selectedExercises.find((item) => exerciseKey(item.exercise) === exerciseKey(exercise));
    if (existing) removeExercise(existing.id);
    else addExercise(exercise);
  }

  function updateSet(exerciseId, setId, key, value) {
    setSelectedExercises((current) =>
      current.map((item) =>
        item.id === exerciseId
          ? {
              ...item,
              sets: item.sets.map((set) => (set.id === setId ? { ...set, [key]: value } : set)),
            }
          : item
      )
    );
  }

  function updateExerciseNotes(exerciseId, value) {
    setSelectedExercises((current) =>
      current.map((item) => (item.id === exerciseId ? { ...item, notes: value } : item))
    );
  }

  function addSet(exerciseId) {
    setSelectedExercises((current) =>
      current.map((item) => {
        if (item.id !== exerciseId) return item;
        const last = item.sets[item.sets.length - 1] || defaultSets(goal)[0];
        return {
          ...item,
          sets: [
            ...item.sets,
            {
              id: makeId("set"),
              set_number: item.sets.length + 1,
              reps: last.reps || "10",
              weight_kg: last.weight_kg || "",
              rest_seconds: last.rest_seconds || "90",
            },
          ],
        };
      })
    );
  }

  function removeSet(exerciseId, setId) {
    setSelectedExercises((current) =>
      current.map((item) => {
        if (item.id !== exerciseId) return item;
        if (item.sets.length <= 1) return item;

        return {
          ...item,
          sets: item.sets
            .filter((set) => set.id !== setId)
            .map((set, index) => ({ ...set, set_number: index + 1 })),
        };
      })
    );
  }

  function generateWizardProposal() {
    const groups = selectedMuscles.length ? selectedMuscles : ["Chest", "Back", "Legs"];
    const maxExercises = Number(form.duration_min) <= 45 ? 5 : Number(form.duration_min) <= 60 ? 7 : 9;
    const perGroup = Math.max(1, Math.ceil(maxExercises / groups.length));
    const proposal = [];

    groups.forEach((group) => {
      const candidates = exerciseCatalog.filter((exercise) => exercise.primary_muscle_group === group);
      candidates.slice(0, perGroup).forEach((exercise) => {
        if (!proposal.some((item) => exerciseKey(item) === exerciseKey(exercise))) proposal.push(exercise);
      });
    });

    setSelectedExercises(
      proposal.slice(0, maxExercises).map((exercise) => ({
        id: makeId("selected"),
        exercise,
        notes: "",
        sets: defaultSets(goal),
      }))
    );

    setStep("exercises");
  }

  async function addCustomExercise() {
    const name = customForm.name.trim();
    if (!name) return setMessage("Add a custom exercise name.");
    if (!profile?.id) return;

    const localExercise = {
      id: makeId("custom-local"),
      source: "custom",
      name,
      primary_muscle_group: customForm.primary_muscle_group,
      equipment: customForm.equipment.trim(),
      image_url: "",
    };

    try {
      const { data, error } = await supabase
        .from("user_strength_exercises")
        .insert({
          user_id: profile.id,
          name,
          primary_muscle_group: customForm.primary_muscle_group,
          equipment: customForm.equipment.trim() || null,
          notes: customForm.notes.trim() || null,
        })
        .select("id,name,primary_muscle_group,equipment,image_url")
        .single();

      if (error) throw error;

      const savedExercise = normalizeExercise(data, "custom");
      setExerciseCatalog((current) => [...current, savedExercise]);
      addExercise(savedExercise);
    } catch (error) {
      console.warn("Custom exercise table not available; adding local snapshot.", error);
      addExercise(localExercise);
    } finally {
      setCustomForm({ name: "", primary_muscle_group: customForm.primary_muscle_group, equipment: "", notes: "" });
      setCustomOpen(false);
    }
  }

  function validateBeforeFinish() {
    if (!selectedMuscles.length) {
      setMessage("Choose at least one muscle group.");
      return false;
    }

    if (method === "wizard" && !selectedExercises.length) {
      generateWizardProposal();
      return false;
    }

    if (!selectedExercises.length) {
      setMessage("Choose at least one exercise.");
      return false;
    }

    setMessage("");
    setStep("finish");
    return true;
  }

  async function saveWorkout(event) {
    event.preventDefault();
    setMessage("");

    if (!profile?.id) return router.replace("/login");
    if (!method) return setMessage("Choose Manual Builder or Workout Wizard.");
    if (!selectedMuscles.length) return setMessage("Choose at least one muscle group.");
    if (!selectedExercises.length) return setMessage("Choose at least one exercise.");
    if (!form.title.trim()) return setMessage("Add a workout title.");

    const normalizedExercises = selectedExercises.map((item, index) => ({
      position: index,
      source: item.exercise.source,
      id: item.exercise.id,
      name: item.exercise.name,
      primary_muscle_group: item.exercise.primary_muscle_group,
      equipment: item.exercise.equipment || null,
      notes: item.notes || null,
      sets: item.sets.map((set, setIndex) => ({
        set_number: setIndex + 1,
        reps: cleanNumber(set.reps),
        weight_kg: cleanNumber(set.weight_kg),
        rest_seconds: cleanNumber(set.rest_seconds),
      })),
    }));

    try {
      setSaving(true);

      const { data: workout, error: workoutError } = await supabase
        .from("workouts")
        .insert({
          creator_id: profile.id,
          sport_id: "strength_training",
          title: form.title.trim(),
          description: form.description.trim(),
          workout_type: method === "wizard" ? "wizard" : "strength",
          level: form.level,
          duration_min: cleanNumber(form.duration_min),
          visibility: form.visibility,
          structure: {
            builder_version: 3,
            method,
            goal,
            muscle_groups: selectedMuscles,
            exercises: normalizedExercises,
          },
        })
        .select("id")
        .single();

      if (workoutError) throw workoutError;

      try {
        for (const item of normalizedExercises) {
          const { data: workoutExercise, error: exerciseError } = await supabase
            .from("workout_exercises")
            .insert({
              workout_id: workout.id,
              position: item.position,
              exercise_source:
                item.source === "global"
                  ? "global"
                  : item.source === "custom" && !String(item.id).startsWith("custom-local")
                    ? "custom"
                    : "snapshot",
              strength_exercise_id: item.source === "global" ? item.id : null,
              user_strength_exercise_id:
                item.source === "custom" && !String(item.id).startsWith("custom-local") ? item.id : null,
              exercise_name_snapshot: item.name,
              primary_muscle_group_snapshot: item.primary_muscle_group,
              equipment_snapshot: item.equipment,
              notes: item.notes,
            })
            .select("id")
            .single();

          if (exerciseError) throw exerciseError;

          const setRows = item.sets.map((set) => ({
            workout_exercise_id: workoutExercise.id,
            set_number: set.set_number,
            reps: set.reps,
            weight_kg: set.weight_kg,
            rest_seconds: set.rest_seconds,
          }));

          if (setRows.length) {
            const { error: setsError } = await supabase.from("workout_exercise_sets").insert(setRows);
            if (setsError) throw setsError;
          }
        }
      } catch (normalizedError) {
        console.warn("Normalized workout tables failed; JSON structure was saved.", normalizedError);
      }

      const queryParams = new URLSearchParams(window.location.search);
      const returnTo = queryParams.get("returnTo");

      if (returnTo) {
        const params = new URLSearchParams({
          workout_id: workout.id,
          step: queryParams.get("step") || "workout",
        });
        router.push(`${returnTo}?${params.toString()}`);
      } else {
        router.push("/workouts");
      }
    } catch (error) {
      console.error("Could not save workout", error);
      setMessage(error?.message || "Could not save workout.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <div style={styles.topRow}>
          <Link href="/workouts" style={styles.backLink}>← Back to workouts</Link>
        </div>

        <header style={styles.header}>
          <div style={styles.kicker}>Workout Builder</div>
          <h1 style={styles.title}>Create your strength workout</h1>
          <p style={styles.subtitle}>
            Choose how you want to build, then select muscle groups, exercises and set details.
          </p>
        </header>

        <nav style={styles.stepBar} aria-label="Workout builder steps">
          {builderSteps.map((label, index) => {
            const current = index + 1;
            const active = stepIndex === current;
            const complete = stepIndex > current;
            return (
              <button
                key={label}
                type="button"
                style={{
                  ...styles.stepPill,
                  ...(active ? styles.stepPillActive : {}),
                  ...(complete ? styles.stepPillComplete : {}),
                }}
                onClick={() => {
                  if (current === 1) setStep("method");
                  if (current === 2 && method) setStep("muscles");
                  if (current === 3 && selectedMuscles.length) setStep("exercises");
                  if (current === 4 && selectedExercises.length) setStep("finish");
                }}
              >
                <span>{complete ? "✓" : current}</span>
                {label}
              </button>
            );
          })}
        </nav>

        {message ? <section style={styles.message}>{message}</section> : null}

        {checking ? (
          <section style={styles.card}>Checking profile...</section>
        ) : (
          <form onSubmit={saveWorkout} style={styles.formShell}>
            {step === "method" ? (
              <section style={styles.card}>
                <div style={styles.cardKicker}>Step 1</div>
                <h2 style={styles.cardTitle}>How do you want to build?</h2>
                <p style={styles.cardIntro}>Manual Builder gives full control. The Wizard creates a first proposal you can adjust.</p>

                <button type="button" style={styles.choiceCard} onClick={() => chooseMethod("manual")}>
                  <img src="/illustrations/workout-builder/manual.svg" alt="" style={styles.choiceIcon} />
                  <span style={styles.choiceCopy}>
                    <b>Manual Builder</b>
                    <small>Build from scratch. Choose muscle groups, exercises, sets and weights.</small>
                  </span>
                  <span style={styles.choiceArrow}>→</span>
                </button>

                <button type="button" style={{ ...styles.choiceCard, ...styles.choiceRecommended }} onClick={() => chooseMethod("wizard")}>
                  <img src="/illustrations/workout-builder/wizard.svg" alt="" style={styles.choiceIconLarge} />
                  <span style={styles.choiceCopy}>
                    <span style={styles.recommendedLine}>
                      <b>Workout Wizard</b>
                      <em>Recommended</em>
                    </span>
                    <small>Let Endurance create a first strength workout proposal for you.</small>
                  </span>
                  <span style={styles.choiceArrow}>→</span>
                </button>
              </section>
            ) : null}

            {step === "muscles" ? (
              <section style={styles.card}>
                <div style={styles.cardKicker}>Step 2</div>
                <h2 style={styles.cardTitle}>Select muscle groups</h2>
                <p style={styles.cardIntro}>
                  Choose what you want to train. You can change exercises and set details later.
                </p>

                {method === "wizard" ? (
                  <div style={styles.wizardStrip}>
                    <img src="/illustrations/workout-builder/wizard.svg" alt="" />
                    <div>
                      <b>Wizard mode</b>
                      <span>Choose a goal and Endurance will suggest exercises.</span>
                    </div>
                  </div>
                ) : null}

                <div style={styles.goalGrid}>
                  {[
                    ["hypertrophy", "Muscle growth", "8–12 reps"],
                    ["strength", "Strength", "4–6 reps"],
                    ["endurance", "Endurance", "12–20 reps"],
                  ].map(([id, label, meta]) => (
                    <button
                      key={id}
                      type="button"
                      style={{ ...styles.goalButton, ...(goal === id ? styles.goalButtonActive : {}) }}
                      onClick={() => setGoal(id)}
                    >
                      <b>{label}</b>
                      <span>{meta}</span>
                    </button>
                  ))}
                </div>

                <div style={styles.muscleGrid}>
                  {MUSCLE_GROUPS.map((group) => {
                    const active = selectedMuscles.includes(group);
                    return (
                      <button
                        key={group}
                        type="button"
                        style={{ ...styles.muscleCard, ...(active ? styles.muscleCardActive : {}) }}
                        onClick={() => toggleMuscle(group)}
                      >
                        <img src={muscleIcon(group)} alt="" />
                        <span>{group}</span>
                        {active ? <b>✓</b> : null}
                      </button>
                    );
                  })}
                </div>

                <div style={styles.bottomHelp}>
                  <img src="/illustrations/workout-builder/wizard.svg" alt="" />
                  <span>Need help? Let the Workout Wizard suggest muscle groups for you.</span>
                </div>

                <div style={styles.actions}>
                  <button type="button" style={styles.secondaryButton} onClick={() => setStep("method")}>Back</button>
                  <button
                    type="button"
                    style={styles.primaryButton}
                    onClick={() => {
                      if (!selectedMuscles.length) return setMessage("Choose at least one muscle group.");
                      if (method === "wizard") generateWizardProposal();
                      else setStep("exercises");
                    }}
                  >
                    Continue →
                  </button>
                </div>
              </section>
            ) : null}

            {step === "exercises" ? (
              <section style={styles.card}>
                <div style={styles.cardKicker}>Step 3</div>
                <h2 style={styles.cardTitle}>Choose exercises</h2>
                <p style={styles.cardIntro}>{selectedMuscleSummary}</p>

                <div style={styles.quickForm}>
                  <label>
                    Workout name
                    <input
                      value={form.title}
                      onChange={(event) => updateForm("title", event.target.value)}
                      placeholder="Maurice Strength Training Workout"
                    />
                  </label>
                  <label>
                    Duration
                    <input
                      type="number"
                      value={form.duration_min}
                      onChange={(event) => updateForm("duration_min", event.target.value)}
                      placeholder="60"
                    />
                  </label>
                </div>

                {MUSCLE_GROUPS.filter((group) => selectedMuscles.includes(group)).map((group) => (
                  <div key={group} style={styles.exerciseGroup}>
                    <h3>{group}</h3>
                    <div style={styles.exerciseList}>
                      {(groupedExercises[group] || []).slice(0, 14).map((exercise) => {
                        const active = selectedExercises.some((item) => exerciseKey(item.exercise) === exerciseKey(exercise));
                        return (
                          <button
                            key={exerciseKey(exercise)}
                            type="button"
                            style={{ ...styles.exerciseRow, ...(active ? styles.exerciseRowActive : {}) }}
                            onClick={() => toggleExercise(exercise)}
                          >
                            <span style={styles.exerciseThumb}>
                              <img src={muscleIcon(exercise.primary_muscle_group)} alt="" />
                            </span>
                            <span>
                              <b>{exercise.name}</b>
                              <small>{exercise.equipment || "Equipment optional"}</small>
                            </span>
                            <em>{active ? "✓" : "+"}</em>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <button type="button" style={styles.addCustomButton} onClick={() => setCustomOpen((value) => !value)}>
                  + Add custom exercise
                </button>

                {customOpen ? (
                  <div style={styles.customBox}>
                    <label>
                      Exercise name
                      <input
                        value={customForm.name}
                        onChange={(event) => setCustomForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Exercise name"
                      />
                    </label>
                    <label>
                      Muscle group
                      <select
                        value={customForm.primary_muscle_group}
                        onChange={(event) => setCustomForm((current) => ({ ...current, primary_muscle_group: event.target.value }))}
                      >
                        {MUSCLE_GROUPS.map((group) => <option key={group}>{group}</option>)}
                      </select>
                    </label>
                    <label>
                      Equipment
                      <select
                        value={customForm.equipment}
                        onChange={(event) => setCustomForm((current) => ({ ...current, equipment: event.target.value }))}
                      >
                        <option value="">Choose equipment</option>
                        {EQUIPMENT_OPTIONS.map((equipment) => <option key={equipment}>{equipment}</option>)}
                      </select>
                    </label>
                    <button type="button" style={styles.primaryButton} onClick={addCustomExercise}>Add exercise</button>
                  </div>
                ) : null}

                <div style={styles.actions}>
                  <button type="button" style={styles.secondaryButton} onClick={() => setStep("muscles")}>Back</button>
                  <button type="button" style={styles.primaryButton} onClick={validateBeforeFinish}>Continue →</button>
                </div>
              </section>
            ) : null}

            {step === "finish" ? (
              <section style={styles.card}>
                <div style={styles.cardKicker}>Step 4</div>
                <h2 style={styles.cardTitle}>Set details</h2>
                <p style={styles.cardIntro}>
                  {selectedExercises.length} exercises • {selectedSetCount} sets • {selectedMuscleSummary}
                </p>

                <div style={styles.finishGrid}>
                  <label>
                    Description
                    <textarea
                      value={form.description}
                      onChange={(event) => updateForm("description", event.target.value)}
                      placeholder="Optional. Add coaching notes or focus points."
                    />
                  </label>
                  <label>
                    Visibility
                    <select value={form.visibility} onChange={(event) => updateForm("visibility", event.target.value)}>
                      <option value="team">Team</option>
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                  <label>
                    Level
                    <select value={form.level} onChange={(event) => updateForm("level", event.target.value)}>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </label>
                </div>

                <div style={styles.selectedList}>
                  {selectedExercises.map((item) => (
                    <article key={item.id} style={styles.selectedCard}>
                      <header>
                        <span>
                          <b>{item.exercise.name}</b>
                          <small>{item.exercise.primary_muscle_group} • {summarizeSets(item.sets)}</small>
                        </span>
                        <button type="button" onClick={() => removeExercise(item.id)}>Remove</button>
                      </header>

                      <div style={styles.setTable}>
                        {item.sets.map((set) => (
                          <div key={set.id} style={styles.setRow}>
                            <span>Set {set.set_number}</span>
                            <input value={set.reps} onChange={(event) => updateSet(item.id, set.id, "reps", event.target.value)} placeholder="Reps" />
                            <input value={set.weight_kg} onChange={(event) => updateSet(item.id, set.id, "weight_kg", event.target.value)} placeholder="kg" />
                            <input value={set.rest_seconds} onChange={(event) => updateSet(item.id, set.id, "rest_seconds", event.target.value)} placeholder="Rest" />
                            <button type="button" onClick={() => removeSet(item.id, set.id)}>−</button>
                          </div>
                        ))}
                      </div>

                      <div style={styles.setActions}>
                        <button type="button" onClick={() => addSet(item.id)}>+ Add set</button>
                      </div>

                      <textarea
                        value={item.notes}
                        onChange={(event) => updateExerciseNotes(item.id, event.target.value)}
                        placeholder="Exercise notes"
                        style={styles.notesInput}
                      />
                    </article>
                  ))}
                </div>

                <div style={styles.actions}>
                  <button type="button" style={styles.secondaryButton} onClick={() => setStep("exercises")}>Back</button>
                  <button type="submit" style={styles.primaryButton} disabled={saving}>
                    {saving ? "Saving..." : "Save workout ✓"}
                  </button>
                </div>
              </section>
            ) : null}
          </form>
        )}

        <section style={styles.whyBox}>
          <div>
            <b>Waarom dit beter werkt</b>
            <span>Gerichte flow zonder overbelasting.</span>
          </div>
          <div>
            <b>Wizard als aanrader</b>
            <span>Snelle start voor nieuwe gebruikers.</span>
          </div>
          <div>
            <b>100% mobile-first</b>
            <span>Groot, duidelijk en met één hand te bedienen.</span>
          </div>
        </section>
      </section>

      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}

const baseInput = {
  width: "100%",
  minHeight: 52,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.055)",
  color: "#fff",
  padding: "0 16px",
  fontSize: 16,
  fontWeight: 800,
  outline: "none",
};

const styles = {
  page: {
    minHeight: "100svh",
    color: "#fff",
    background:
      "radial-gradient(circle at 18% 18%, rgba(228,239,22,.12), transparent 28%), linear-gradient(180deg, #07100b 0%, #020304 62%, #000 100%)",
    paddingBottom: 112,
  },
  shell: {
    width: "min(760px, 100%)",
    margin: "0 auto",
    padding: "0 20px 36px",
    display: "grid",
    gap: 18,
  },
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backLink: {
    width: "fit-content",
    minHeight: 52,
    display: "inline-flex",
    alignItems: "center",
    padding: "0 22px",
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,.22)",
    background: "rgba(255,255,255,.055)",
    color: "#e4ef16",
    textDecoration: "none",
    fontWeight: 1000,
  },
  header: {
    display: "grid",
    gap: 10,
    paddingTop: 6,
  },
  kicker: {
    color: "#e4ef16",
    textTransform: "uppercase",
    letterSpacing: ".22em",
    fontSize: 13,
    fontWeight: 1000,
  },
  title: {
    margin: 0,
    fontSize: "clamp(42px, 12vw, 74px)",
    lineHeight: .88,
    letterSpacing: "-.085em",
    fontWeight: 1000,
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,.68)",
    fontSize: 18,
    lineHeight: 1.35,
    fontWeight: 800,
  },
  stepBar: {
    display: "flex",
    gap: 10,
    overflowX: "auto",
    paddingBottom: 2,
    scrollbarWidth: "none",
  },
  stepPill: {
    flex: "0 0 auto",
    minHeight: 44,
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 999,
    background: "rgba(255,255,255,.06)",
    color: "rgba(255,255,255,.70)",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "0 16px",
    fontWeight: 1000,
    cursor: "pointer",
  },
  stepPillActive: {
    background: "#e4ef16",
    color: "#071003",
    borderColor: "#e4ef16",
  },
  stepPillComplete: {
    color: "#e4ef16",
    borderColor: "rgba(228,239,22,.32)",
  },
  card: {
    borderRadius: 30,
    border: "1px solid rgba(255,255,255,.12)",
    background:
      "radial-gradient(circle at 80% 0%, rgba(228,239,22,.10), transparent 30%), linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.035))",
    boxShadow: "0 28px 80px rgba(0,0,0,.38)",
    padding: 24,
    display: "grid",
    gap: 16,
  },
  cardKicker: {
    color: "#e4ef16",
    textTransform: "uppercase",
    letterSpacing: ".22em",
    fontSize: 12,
    fontWeight: 1000,
  },
  cardTitle: {
    margin: 0,
    fontSize: "clamp(34px, 9vw, 54px)",
    lineHeight: .92,
    letterSpacing: "-.075em",
    fontWeight: 1000,
  },
  cardIntro: {
    margin: 0,
    color: "rgba(255,255,255,.66)",
    fontWeight: 800,
    lineHeight: 1.45,
  },
  choiceCard: {
    width: "100%",
    minHeight: 118,
    display: "grid",
    gridTemplateColumns: "82px 1fr 42px",
    alignItems: "center",
    gap: 16,
    borderRadius: 26,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.36)",
    color: "#fff",
    padding: 16,
    textAlign: "left",
    cursor: "pointer",
  },
  choiceRecommended: {
    borderColor: "rgba(228,239,22,.75)",
    background:
      "radial-gradient(circle at 12% 40%, rgba(228,239,22,.16), transparent 34%), rgba(228,239,22,.055)",
  },
  choiceIcon: {
    width: 70,
    height: 70,
    borderRadius: 22,
  },
  choiceIconLarge: {
    width: 78,
    height: 78,
    borderRadius: 26,
  },
  choiceCopy: {
    minWidth: 0,
    display: "grid",
    gap: 6,
  },
  recommendedLine: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  choiceArrow: {
    width: 42,
    height: 42,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,.08)",
    color: "#e4ef16",
    fontWeight: 1000,
  },
  message: {
    borderRadius: 18,
    border: "1px solid rgba(228,239,22,.26)",
    background: "rgba(228,239,22,.08)",
    color: "#e4ef16",
    padding: 14,
    fontWeight: 900,
  },
  formShell: {
    display: "grid",
    gap: 18,
  },
  wizardStrip: {
    display: "grid",
    gridTemplateColumns: "52px 1fr",
    gap: 12,
    alignItems: "center",
    padding: 14,
    borderRadius: 22,
    background: "rgba(228,239,22,.08)",
    border: "1px solid rgba(228,239,22,.22)",
  },
  goalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  goalButton: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.06)",
    color: "#fff",
    padding: 12,
    display: "grid",
    gap: 4,
    textAlign: "left",
    cursor: "pointer",
  },
  goalButtonActive: {
    borderColor: "rgba(228,239,22,.75)",
    background: "rgba(228,239,22,.12)",
    color: "#e4ef16",
  },
  muscleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  muscleCard: {
    minHeight: 92,
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.28)",
    color: "#fff",
    padding: 12,
    display: "grid",
    gridTemplateColumns: "44px 1fr 24px",
    alignItems: "center",
    gap: 10,
    textAlign: "left",
    fontWeight: 1000,
    cursor: "pointer",
  },
  muscleCardActive: {
    borderColor: "#e4ef16",
    background: "rgba(228,239,22,.10)",
  },
  bottomHelp: {
    display: "grid",
    gridTemplateColumns: "42px 1fr",
    gap: 12,
    alignItems: "center",
    color: "rgba(255,255,255,.72)",
    fontWeight: 800,
    borderRadius: 18,
    padding: 12,
    background: "rgba(255,255,255,.045)",
  },
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1.3fr",
    gap: 12,
    marginTop: 4,
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.075)",
    color: "#fff",
    fontWeight: 1000,
    cursor: "pointer",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#071003",
    fontWeight: 1000,
    cursor: "pointer",
    padding: "0 18px",
  },
  quickForm: {
    display: "grid",
    gridTemplateColumns: "1fr 110px",
    gap: 10,
  },
  exerciseGroup: {
    display: "grid",
    gap: 10,
  },
  exerciseList: {
    display: "grid",
    gap: 8,
  },
  exerciseRow: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "48px 1fr 34px",
    gap: 12,
    alignItems: "center",
    padding: 10,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,.10)",
    background: "rgba(0,0,0,.24)",
    color: "#fff",
    textAlign: "left",
    cursor: "pointer",
  },
  exerciseRowActive: {
    borderColor: "rgba(228,239,22,.68)",
    background: "rgba(228,239,22,.09)",
  },
  exerciseThumb: {
    width: 48,
    height: 48,
    borderRadius: 16,
    overflow: "hidden",
  },
  addCustomButton: {
    minHeight: 48,
    border: "1px dashed rgba(228,239,22,.44)",
    background: "rgba(228,239,22,.06)",
    color: "#e4ef16",
    borderRadius: 18,
    fontWeight: 1000,
    cursor: "pointer",
  },
  customBox: {
    display: "grid",
    gap: 10,
    padding: 14,
    borderRadius: 20,
    background: "rgba(0,0,0,.30)",
    border: "1px solid rgba(255,255,255,.10)",
  },
  finishGrid: {
    display: "grid",
    gap: 10,
  },
  selectedList: {
    display: "grid",
    gap: 12,
  },
  selectedCard: {
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.28)",
    padding: 14,
    display: "grid",
    gap: 12,
  },
  setTable: {
    display: "grid",
    gap: 8,
  },
  setRow: {
    display: "grid",
    gridTemplateColumns: "56px 1fr 1fr 1fr 34px",
    gap: 7,
    alignItems: "center",
  },
  setActions: {
    display: "flex",
    justifyContent: "flex-start",
  },
  notesInput: {
    minHeight: 78,
  },
  whyBox: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    padding: 14,
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,.10)",
    background: "rgba(255,255,255,.035)",
  },
};

styles.choiceCopy.small = {};
styles.goalButton.span = {};
