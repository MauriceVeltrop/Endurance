"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import BottomNav from "../../../components/BottomNav";
import { supabase } from "../../../lib/supabase";
import { getSportLabel } from "../../../lib/trainingHelpers";

const workoutSportIds = ["strength_training", "crossfit", "hyrox", "bootcamp"];
const muscleGroups = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core"];
const equipmentOptions = ["Barbell", "Dumbbell", "Cable", "Machine", "Smith Machine", "Bodyweight", "Kettlebell", "Band", "Trap Bar", "Plate Loaded"];

const starterExercises = [
  ["Bench Press (Barbell)", "Chest", "Barbell"],
  ["Bench Press (Dumbbell)", "Chest", "Dumbbell"],
  ["Incline Bench Press (Barbell)", "Chest", "Barbell"],
  ["Incline Bench Press (Dumbbell)", "Chest", "Dumbbell"],
  ["Chest Fly (Dumbbell)", "Chest", "Dumbbell"],
  ["Cable Crossover", "Chest", "Cable"],
  ["Push Up", "Chest", "Bodyweight"],
  ["Chest Dip", "Chest", "Bodyweight"],
  ["Pull Up", "Back", "Bodyweight"],
  ["Chin Up", "Back", "Bodyweight"],
  ["Lat Pulldown (Cable)", "Back", "Cable"],
  ["Seated Row (Cable)", "Back", "Cable"],
  ["Bent Over Row (Barbell)", "Back", "Barbell"],
  ["Bent Over Row (Dumbbell)", "Back", "Dumbbell"],
  ["T Bar Row", "Back", "Machine"],
  ["Rack Pull (Barbell)", "Back", "Barbell"],
  ["Overhead Press (Barbell)", "Shoulders", "Barbell"],
  ["Overhead Press (Dumbbell)", "Shoulders", "Dumbbell"],
  ["Arnold Press (Dumbbell)", "Shoulders", "Dumbbell"],
  ["Lateral Raise (Dumbbell)", "Shoulders", "Dumbbell"],
  ["Lateral Raise (Cable)", "Shoulders", "Cable"],
  ["Front Raise (Dumbbell)", "Shoulders", "Dumbbell"],
  ["Reverse Fly (Dumbbell)", "Shoulders", "Dumbbell"],
  ["Face Pull (Cable)", "Shoulders", "Cable"],
  ["Bicep Curl (Barbell)", "Biceps", "Barbell"],
  ["Bicep Curl (Dumbbell)", "Biceps", "Dumbbell"],
  ["Bicep Curl (Cable)", "Biceps", "Cable"],
  ["Hammer Curl (Dumbbell)", "Biceps", "Dumbbell"],
  ["Preacher Curl (Barbell)", "Biceps", "Barbell"],
  ["Concentration Curl (Dumbbell)", "Biceps", "Dumbbell"],
  ["Triceps Pushdown (Cable - Straight Bar)", "Triceps", "Cable"],
  ["Triceps Extension (Cable)", "Triceps", "Cable"],
  ["Triceps Extension (Dumbbell)", "Triceps", "Dumbbell"],
  ["Skullcrusher (Barbell)", "Triceps", "Barbell"],
  ["Skullcrusher (Dumbbell)", "Triceps", "Dumbbell"],
  ["Bench Dip", "Triceps", "Bodyweight"],
  ["Close Grip Bench Press (Barbell)", "Triceps", "Barbell"],
  ["Squat (Barbell)", "Legs", "Barbell"],
  ["Squat (Dumbbell)", "Legs", "Dumbbell"],
  ["Leg Press", "Legs", "Machine"],
  ["Leg Extension (Machine)", "Legs", "Machine"],
  ["Lying Leg Curl (Machine)", "Legs", "Machine"],
  ["Romanian Deadlift (Dumbbell)", "Legs", "Dumbbell"],
  ["Trap Bar Deadlift", "Legs", "Trap Bar"],
  ["Bulgarian Split Squat", "Legs", "Bodyweight"],
  ["Lunge (Dumbbell)", "Legs", "Dumbbell"],
  ["Hip Thrust (Barbell)", "Legs", "Barbell"],
  ["Standing Calf Raise (Machine)", "Legs", "Machine"],
  ["Plank", "Core", "Bodyweight"],
  ["Side Plank", "Core", "Bodyweight"],
  ["Crunch", "Core", "Bodyweight"],
  ["Cable Crunch", "Core", "Cable"],
  ["Hanging Leg Raise", "Core", "Bodyweight"],
  ["Russian Twist", "Core", "Bodyweight"],
  ["Ab Wheel", "Core", "Bodyweight"],
  ["Toes To Bar", "Core", "Bodyweight"],
].map((item, index) => ({
  id: `starter-${index}`,
  source: "snapshot",
  name: item[0],
  primary_muscle_group: item[1],
  equipment: item[2],
}));

function makeLocalId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultSets() {
  return [1, 2, 3].map((setNumber) => ({
    id: makeLocalId("set"),
    set_number: setNumber,
    reps: "10",
    weight_kg: "",
    rest_seconds: "90",
  }));
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

function firstName(profile) {
  return profile?.first_name || profile?.name?.split(" ")?.[0] || "My";
}

function exerciseKey(exercise) {
  return `${exercise.source}-${exercise.id}`;
}

export default function NewWorkoutPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [allowedSportIds, setAllowedSportIds] = useState([]);
  const [globalExercises, setGlobalExercises] = useState([]);
  const [customExercises, setCustomExercises] = useState([]);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState("sport");
  const [method, setMethod] = useState("");
  const [activePanel, setActivePanel] = useState("library");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedGroups, setSelectedGroups] = useState(["Chest", "Back"]);
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", primary_muscle_group: "Chest", equipment: "", notes: "" });
  const [form, setForm] = useState({
    sport_id: "",
    title: "",
    description: "",
    workout_type: "strength",
    level: "all levels",
    duration_min: "",
    visibility: "private",
  });

  useEffect(() => {
    loadAccess();
  }, []);

  async function loadAccess() {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,first_name,last_name,email,avatar_url,role,onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }
      setProfile(profileRow);

      const { data: sportsRows, error: sportsError } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);
      if (sportsError) throw sportsError;
      const allowed = (sportsRows || []).map((row) => row.sport_id).filter(Boolean);
      setAllowedSportIds(allowed);
      const firstWorkoutSport = allowed.find((id) => workoutSportIds.includes(id));
      if (firstWorkoutSport) {
        setForm((current) => ({
          ...current,
          sport_id: firstWorkoutSport,
          title: `${firstName(profileRow)} ${getSportLabel(firstWorkoutSport)} Workout`,
        }));
      }

      const { data: globalRows, error: globalError } = await supabase
        .from("strength_exercises")
        .select("id,name,primary_muscle_group,equipment,image_url")
        .eq("active", true)
        .order("name", { ascending: true });
      if (!globalError && Array.isArray(globalRows)) {
        setGlobalExercises(globalRows.map((row) => normalizeExercise(row, "global")));
      }

      const { data: customRows, error: customError } = await supabase
        .from("user_strength_exercises")
        .select("id,name,primary_muscle_group,equipment,image_url")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("name", { ascending: true });
      if (!customError && Array.isArray(customRows)) {
        setCustomExercises(customRows.map((row) => normalizeExercise(row, "custom")));
      }
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Could not prepare workout builder.");
    } finally {
      setChecking(false);
    }
  }

  const availableWorkoutSports = useMemo(
    () => allowedSportIds.filter((id) => workoutSportIds.includes(id)),
    [allowedSportIds]
  );

  const exerciseCatalog = useMemo(() => {
    const map = new Map();
    [...starterExercises, ...globalExercises, ...customExercises].forEach((exercise) => {
      const key = exerciseKey(exercise);
      if (!map.has(key)) map.set(key, exercise);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [globalExercises, customExercises]);

  const filteredExercises = useMemo(() => {
    const search = query.trim().toLowerCase();
    return exerciseCatalog.filter((exercise) => {
      const groupOk = selectedGroups.length === 0 || selectedGroups.includes(exercise.primary_muscle_group);
      const equipmentOk = selectedEquipment.length === 0 || selectedEquipment.includes(exercise.equipment);
      const searchOk = !search || exercise.name.toLowerCase().includes(search);
      return groupOk && equipmentOk && searchOk;
    });
  }, [exerciseCatalog, query, selectedGroups, selectedEquipment]);

  const selectedKeys = useMemo(() => new Set(selectedExercises.map((item) => exerciseKey(item.exercise))), [selectedExercises]);

  function updateForm(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "sport_id" && (!current.title || current.title.includes("Workout"))) {
        next.title = `${firstName(profile)} ${getSportLabel(value)} Workout`;
      }
      return next;
    });
  }

  function toggleGroup(group) {
    setSelectedGroups((current) =>
      current.includes(group) ? current.filter((item) => item !== group) : [...current, group]
    );
  }

  function toggleEquipment(equipment) {
    setSelectedEquipment((current) =>
      current.includes(equipment) ? current.filter((item) => item !== equipment) : [...current, equipment]
    );
  }

  function addExercise(exercise) {
    if (selectedKeys.has(exerciseKey(exercise))) return;
    setSelectedExercises((current) => [
      ...current,
      {
        id: makeLocalId("exercise"),
        exercise,
        position: current.length,
        notes: "",
        collapsed: true,
        sets: defaultSets(),
      },
    ]);
    setMessage(`${exercise.name} added.`);
  }

  function removeExercise(localId) {
    setSelectedExercises((current) => current.filter((item) => item.id !== localId).map((item, index) => ({ ...item, position: index })));
  }

  function moveExercise(localId, direction) {
    setSelectedExercises((current) => {
      const index = current.findIndex((item) => item.id === localId);
      if (index < 0) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy.map((item, nextIndex) => ({ ...item, position: nextIndex }));
    });
  }

  function toggleExerciseOpen(localId) {
    setSelectedExercises((current) => current.map((item) => item.id === localId ? { ...item, collapsed: !item.collapsed } : item));
  }

  function updateSet(exerciseId, setId, key, value) {
    setSelectedExercises((current) =>
      current.map((item) => {
        if (item.id !== exerciseId) return item;
        return {
          ...item,
          sets: item.sets.map((set) => (set.id === setId ? { ...set, [key]: value } : set)),
        };
      })
    );
  }

  function updateAllSets(exerciseId, key, value) {
    setSelectedExercises((current) =>
      current.map((item) => item.id === exerciseId ? { ...item, sets: item.sets.map((set) => ({ ...set, [key]: value })) } : item)
    );
  }

  function addSet(exerciseId) {
    setSelectedExercises((current) =>
      current.map((item) => {
        if (item.id !== exerciseId) return item;
        const last = item.sets[item.sets.length - 1] || { reps: "10", weight_kg: "", rest_seconds: "90" };
        return {
          ...item,
          sets: [
            ...item.sets,
            {
              id: makeLocalId("set"),
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
        return {
          ...item,
          sets: item.sets
            .filter((set) => set.id !== setId)
            .map((set, index) => ({ ...set, set_number: index + 1 })),
        };
      })
    );
  }

  async function addCustomExercise() {
    const name = customForm.name.trim();
    if (!name) return setMessage("Add a custom exercise name.");
    if (!profile?.id) return;
    const localExercise = {
      id: makeLocalId("custom-local"),
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
      setCustomExercises((current) => [...current, savedExercise]);
      addExercise(savedExercise);
    } catch (error) {
      console.warn("Custom exercise table not available yet; adding local snapshot only.", error);
      addExercise(localExercise);
    } finally {
      setCustomForm({ name: "", primary_muscle_group: customForm.primary_muscle_group, equipment: "", notes: "" });
      setCustomOpen(false);
      setActivePanel("plan");
    }
  }

  function runWizard() {
    const groups = selectedGroups.length ? selectedGroups : ["Chest", "Back", "Legs", "Core"];
    const suggestions = [];
    groups.forEach((group) => {
      const candidates = exerciseCatalog.filter((exercise) => {
        const groupOk = exercise.primary_muscle_group === group;
        const equipmentOk = selectedEquipment.length === 0 || selectedEquipment.includes(exercise.equipment);
        return groupOk && equipmentOk;
      });
      suggestions.push(...candidates.slice(0, group === "Core" ? 1 : 2));
    });
    const deduped = [];
    suggestions.forEach((exercise) => {
      if (!deduped.some((item) => exerciseKey(item) === exerciseKey(exercise))) deduped.push(exercise);
    });
    setSelectedExercises(
      deduped.slice(0, 8).map((exercise, index) => ({
        id: makeLocalId("exercise"),
        exercise,
        position: index,
        notes: "",
        collapsed: true,
        sets: defaultSets(),
      }))
    );
    setMethod("wizard");
    setStep("build");
    setActivePanel("plan");
    setDetailsOpen(false);
  }

  function startManual() {
    setMethod("manual");
    setStep("build");
    setActivePanel("library");
  }

  function cleanNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  async function saveWorkout(event) {
    event.preventDefault();
    setMessage("");
    if (!profile?.id) return router.replace("/login");
    if (!form.sport_id) return setMessage("Choose a sport first.");
    if (!method) return setMessage("Choose Manual builder or Workout Wizard.");
    if (!form.title.trim()) return setMessage("Add a workout title.");
    if (!selectedExercises.length) return setMessage("Add at least one exercise.");

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
          sport_id: form.sport_id,
          title: form.title.trim(),
          description: form.description.trim(),
          workout_type: method === "wizard" ? "wizard" : form.workout_type.trim() || "strength",
          level: form.level,
          duration_min: form.duration_min ? Number(form.duration_min) : null,
          visibility: form.visibility,
          structure: {
            builder_version: 2,
            method,
            muscle_groups: selectedGroups,
            equipment: selectedEquipment,
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
              exercise_source: item.source === "global" ? "global" : item.source === "custom" && !String(item.id).startsWith("custom-local") ? "custom" : "snapshot",
              strength_exercise_id: item.source === "global" ? item.id : null,
              user_strength_exercise_id: item.source === "custom" && !String(item.id).startsWith("custom-local") ? item.id : null,
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
        console.warn("Normalized workout tables not available; JSON structure was saved.", normalizedError);
      }

      router.push("/workouts");
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Could not save workout.");
    } finally {
      setSaving(false);
    }
  }

  const stepIndex = step === "sport" ? 1 : step === "method" ? 2 : 3;

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />
        <Link href="/workouts" style={styles.backLink}>← Back to workouts</Link>

        <header style={styles.header}>
          <div style={styles.kicker}>Workout Builder</div>
          <h1 style={styles.title}>Build your workout.</h1>
          <p style={styles.subtitle}>A compact mobile-first builder for strength sessions, custom exercises and ordered workout schemas.</p>
        </header>

        <section style={styles.stepBar}>
          {["Sport", "Method", "Build"].map((label, index) => (
            <div key={label} style={{ ...styles.stepItem, ...(stepIndex === index + 1 ? styles.stepItemActive : {}) }}>
              <span>{index + 1}</span>{label}
            </div>
          ))}
        </section>

        {message ? <section style={styles.message}>{message}</section> : null}

        {checking ? (
          <section style={styles.card}>Checking profile...</section>
        ) : (
          <form onSubmit={saveWorkout} style={styles.formShell}>
            {step === "sport" ? (
              <section style={styles.card}>
                <div style={styles.cardHead}>
                  <div>
                    <div style={styles.cardKicker}>Step 1</div>
                    <h2 style={styles.cardTitle}>Choose workout sport</h2>
                  </div>
                </div>
                <div style={styles.sportGrid}>
                  {workoutSportIds.map((id) => {
                    const allowed = availableWorkoutSports.includes(id);
                    const active = form.sport_id === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!allowed}
                        onClick={() => updateForm("sport_id", id)}
                        style={{
                          ...styles.choiceButton,
                          ...(active ? styles.choiceButtonActive : {}),
                          ...(!allowed ? styles.choiceButtonDisabled : {}),
                        }}
                      >
                        <strong>{getSportLabel(id)}</strong>
                        <span>{allowed ? "Available from preferred sports" : "Add to preferred sports first"}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" disabled={!form.sport_id} onClick={() => setStep("method")} style={styles.submitButton}>Continue</button>
              </section>
            ) : null}

            {step === "method" ? (
              <section style={styles.card}>
                <div style={styles.cardHead}>
                  <div>
                    <div style={styles.cardKicker}>Step 2</div>
                    <h2 style={styles.cardTitle}>Choose builder method</h2>
                  </div>
                  <button type="button" onClick={() => setStep("sport")} style={styles.smallButton}>Back</button>
                </div>
                <div style={styles.methodGrid}>
                  <button type="button" onClick={startManual} style={styles.methodCard}>
                    <span style={styles.methodIcon}>✍️</span>
                    <strong>Manual builder</strong>
                    <p>Pick muscle groups, add exercises and tune every set yourself.</p>
                  </button>
                  <button type="button" onClick={runWizard} style={styles.methodCard}>
                    <span style={styles.methodIcon}>⚡</span>
                    <strong>Workout Wizard</strong>
                    <p>Select groups and equipment; Endurance creates a clean first schema.</p>
                  </button>
                </div>
                <BuilderFilters
                  selectedGroups={selectedGroups}
                  selectedEquipment={selectedEquipment}
                  toggleGroup={toggleGroup}
                  toggleEquipment={toggleEquipment}
                />
              </section>
            ) : null}

            {step === "build" ? (
              <>
                <section style={styles.summaryCard}>
                  <div>
                    <div style={styles.cardKicker}>Workout</div>
                    <h2 style={styles.summaryTitle}>{form.title || "Untitled workout"}</h2>
                    <p style={styles.summaryMeta}>{getSportLabel(form.sport_id)} · {method === "wizard" ? "Wizard" : "Manual"} · {selectedExercises.length} exercises</p>
                  </div>
                  <button type="button" onClick={() => setDetailsOpen((open) => !open)} style={styles.smallButton}>{detailsOpen ? "Hide details" : "Edit details"}</button>
                </section>

                {detailsOpen ? (
                  <section style={styles.card}>
                    <div style={styles.cardHead}>
                      <div>
                        <div style={styles.cardKicker}>Details</div>
                        <h2 style={styles.cardTitle}>Workout settings</h2>
                      </div>
                      <button type="button" onClick={() => setStep("method")} style={styles.smallButton}>Method</button>
                    </div>
                    <div style={styles.fieldsGrid}>
                      <label style={styles.fieldFull}><span>Title</span><input value={form.title} onChange={(event) => updateForm("title", event.target.value)} style={styles.input} /></label>
                      <label style={styles.field}><span>Level</span><select value={form.level} onChange={(event) => updateForm("level", event.target.value)} style={styles.input}><option value="beginner">Beginner</option><option value="all levels">All levels</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
                      <label style={styles.field}><span>Duration</span><input type="number" min="0" placeholder="min" value={form.duration_min} onChange={(event) => updateForm("duration_min", event.target.value)} style={styles.input} /></label>
                      <label style={styles.field}><span>Visibility</span><select value={form.visibility} onChange={(event) => updateForm("visibility", event.target.value)} style={styles.input}><option value="private">Private</option><option value="team">Team</option><option value="public">Public</option><option value="selected">Selected</option><option value="group">Group</option></select></label>
                      <label style={styles.field}><span>Type</span><input value={form.workout_type} onChange={(event) => updateForm("workout_type", event.target.value)} style={styles.input} /></label>
                      <label style={styles.fieldFull}><span>Description</span><textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} style={styles.textarea} /></label>
                    </div>
                  </section>
                ) : null}

                <section style={styles.panelSwitch}>
                  <button type="button" onClick={() => setActivePanel("library")} style={{ ...styles.panelTab, ...(activePanel === "library" ? styles.panelTabActive : {}) }}>Library</button>
                  <button type="button" onClick={() => setActivePanel("plan")} style={{ ...styles.panelTab, ...(activePanel === "plan" ? styles.panelTabActive : {}) }}>Selected ({selectedExercises.length})</button>
                </section>

                {activePanel === "library" ? (
                  <section style={styles.card}>
                    <div style={styles.cardHeadCompact}>
                      <div>
                        <div style={styles.cardKicker}>Exercise library</div>
                        <h3 style={styles.miniTitle}>{filteredExercises.length} exercises</h3>
                      </div>
                      <button type="button" onClick={() => setCustomOpen((value) => !value)} style={styles.addCustomButton}>+ Custom</button>
                    </div>

                    <BuilderFilters
                      selectedGroups={selectedGroups}
                      selectedEquipment={selectedEquipment}
                      toggleGroup={toggleGroup}
                      toggleEquipment={toggleEquipment}
                      compact
                    />

                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercise..." style={styles.searchInput} />

                    {customOpen ? (
                      <section style={styles.customBox}>
                        <div style={styles.cardKicker}>Custom exercise</div>
                        <input value={customForm.name} onChange={(event) => setCustomForm((current) => ({ ...current, name: event.target.value }))} placeholder="Exercise name" style={styles.input} />
                        <select value={customForm.primary_muscle_group} onChange={(event) => setCustomForm((current) => ({ ...current, primary_muscle_group: event.target.value }))} style={styles.input}>{muscleGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select>
                        <input value={customForm.equipment} onChange={(event) => setCustomForm((current) => ({ ...current, equipment: event.target.value }))} placeholder="Equipment optional" style={styles.input} />
                        <button type="button" onClick={addCustomExercise} style={styles.submitMini}>Save and add</button>
                      </section>
                    ) : null}

                    <div style={styles.exerciseList}>
                      {filteredExercises.slice(0, 90).map((exercise) => {
                        const added = selectedKeys.has(exerciseKey(exercise));
                        return (
                          <button key={exerciseKey(exercise)} type="button" onClick={() => addExercise(exercise)} style={{ ...styles.exercisePick, ...(added ? styles.exercisePickAdded : {}) }}>
                            <span style={styles.exerciseAvatar}>{exercise.source === "custom" ? "★" : exercise.primary_muscle_group.slice(0, 1)}</span>
                            <span style={styles.exerciseText}>
                              <strong>{exercise.name}</strong>
                              <small>{exercise.primary_muscle_group}{exercise.equipment ? ` · ${exercise.equipment}` : ""}</small>
                            </span>
                            <b style={styles.addSymbol}>{added ? "✓" : "+"}</b>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : (
                  <section style={styles.card}>
                    <div style={styles.cardHeadCompact}>
                      <div>
                        <div style={styles.cardKicker}>Selected exercises</div>
                        <h3 style={styles.miniTitle}>{selectedExercises.length} exercises</h3>
                      </div>
                      <button type="button" onClick={() => setActivePanel("library")} style={styles.smallButton}>+ Add</button>
                    </div>

                    {!selectedExercises.length ? (
                      <div style={styles.emptyPlan}>No exercises yet. Open the library and add your first exercise.</div>
                    ) : (
                      <div style={styles.selectedList}>
                        {selectedExercises.map((item, index) => {
                          const firstSet = item.sets[0] || { reps: "", weight_kg: "", rest_seconds: "" };
                          return (
                            <article key={item.id} style={styles.selectedExercise}>
                              <div style={styles.selectedTop}>
                                <button type="button" onClick={() => toggleExerciseOpen(item.id)} style={styles.orderBadge}>{index + 1}</button>
                                <button type="button" onClick={() => toggleExerciseOpen(item.id)} style={styles.selectedNameButton}>
                                  <strong>{item.exercise.name}</strong>
                                  <small>{item.sets.length} sets · {firstSet.reps || "-"} reps{firstSet.weight_kg ? ` · ${firstSet.weight_kg} kg` : ""}</small>
                                </button>
                                <div style={styles.reorderButtons}>
                                  <button type="button" onClick={() => moveExercise(item.id, -1)} style={styles.iconButton}>↑</button>
                                  <button type="button" onClick={() => moveExercise(item.id, 1)} style={styles.iconButton}>↓</button>
                                  <button type="button" onClick={() => removeExercise(item.id)} style={styles.removeButton}>×</button>
                                </div>
                              </div>

                              {item.collapsed ? (
                                <div style={styles.quickSetRow}>
                                  <label><span>Sets</span><input value={item.sets.length} readOnly style={styles.quickInput} /></label>
                                  <label><span>Reps</span><input value={firstSet.reps} onChange={(event) => updateAllSets(item.id, "reps", event.target.value)} style={styles.quickInput} inputMode="numeric" /></label>
                                  <label><span>Kg</span><input value={firstSet.weight_kg} onChange={(event) => updateAllSets(item.id, "weight_kg", event.target.value)} style={styles.quickInput} inputMode="decimal" /></label>
                                </div>
                              ) : (
                                <>
                                  <div style={styles.setHeader}><span>Set</span><span>Reps</span><span>Kg</span><span>Rest</span><span></span></div>
                                  {item.sets.map((set) => (
                                    <div key={set.id} style={styles.setRow}>
                                      <b>{set.set_number}</b>
                                      <input value={set.reps} onChange={(event) => updateSet(item.id, set.id, "reps", event.target.value)} style={styles.setInput} inputMode="numeric" />
                                      <input value={set.weight_kg} onChange={(event) => updateSet(item.id, set.id, "weight_kg", event.target.value)} style={styles.setInput} inputMode="decimal" />
                                      <input value={set.rest_seconds} onChange={(event) => updateSet(item.id, set.id, "rest_seconds", event.target.value)} style={styles.setInput} inputMode="numeric" />
                                      <button type="button" onClick={() => removeSet(item.id, set.id)} style={styles.removeSet}>×</button>
                                    </div>
                                  ))}
                                  <button type="button" onClick={() => addSet(item.id)} style={styles.addSet}>+ Set</button>
                                </>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                <section style={styles.saveDock}>
                  <button type="button" onClick={() => setActivePanel(activePanel === "library" ? "plan" : "library")} style={styles.secondaryDockButton}>
                    {activePanel === "library" ? `Selected (${selectedExercises.length})` : "Library"}
                  </button>
                  <button type="submit" disabled={saving || !selectedExercises.length} style={{ ...styles.submitButton, ...(selectedExercises.length ? {} : styles.submitButtonDisabled) }}>{saving ? "Saving..." : "Save workout"}</button>
                </section>
              </>
            ) : null}
          </form>
        )}
      </section>
      <BottomNav />
    </main>
  );
}

function BuilderFilters({ selectedGroups, selectedEquipment, toggleGroup, toggleEquipment, compact = false }) {
  return (
    <div style={compact ? styles.filtersCompact : styles.filters}>
      <div style={styles.filterLabel}>Muscle groups</div>
      <div style={styles.chipRow}>{muscleGroups.map((group) => <button key={group} type="button" onClick={() => toggleGroup(group)} style={{ ...styles.chip, ...(selectedGroups.includes(group) ? styles.chipActive : {}) }}>{group}</button>)}</div>
      <div style={styles.filterLabel}>Equipment</div>
      <div style={styles.chipRow}>{equipmentOptions.map((equipment) => <button key={equipment} type="button" onClick={() => toggleEquipment(equipment)} style={{ ...styles.chipSmall, ...(selectedEquipment.includes(equipment) ? styles.chipActive : {}) }}>{equipment}</button>)}</div>
    </div>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";
const darkerGlass = "linear-gradient(145deg, rgba(10,16,20,0.96), rgba(6,8,10,0.88))";
const styles = {
  page: { minHeight: "100vh", background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)", color: "white", padding: "18px 16px 164px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  shell: { width: "100%", maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 },
  backLink: { width: "fit-content", color: "#e4ef16", textDecoration: "none", fontWeight: 950, border: "1px solid rgba(228,239,22,0.24)", borderRadius: 999, padding: "10px 14px", background: "rgba(228,239,22,0.08)" },
  header: { display: "grid", gap: 8 },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  title: { margin: 0, fontSize: "clamp(36px, 10vw, 58px)", lineHeight: 0.96, letterSpacing: "-0.065em" },
  subtitle: { margin: 0, maxWidth: 680, color: "rgba(255,255,255,0.68)", lineHeight: 1.5, fontWeight: 700 },
  stepBar: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 },
  stepItem: { borderRadius: 999, padding: "10px 8px", border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.055)", color: "rgba(255,255,255,0.62)", fontWeight: 950, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13 },
  stepItemActive: { color: "#101406", background: "#e4ef16", borderColor: "#e4ef16" },
  message: { borderRadius: 22, padding: 14, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.18)", color: "#e4ef16", fontWeight: 850 },
  formShell: { display: "grid", gap: 14 },
  card: { borderRadius: 30, padding: 18, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gap: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.34)", overflow: "hidden" },
  summaryCard: { borderRadius: 28, padding: 16, background: darkerGlass, border: "1px solid rgba(255,255,255,0.12)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  summaryTitle: { margin: "3px 0", fontSize: 25, letterSpacing: "-0.05em", lineHeight: 1.02 },
  summaryMeta: { margin: 0, color: "rgba(255,255,255,0.58)", fontWeight: 800 },
  cardHead: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "start" },
  cardHeadCompact: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  cardKicker: { color: "#e4ef16", fontSize: 12, fontWeight: 950, letterSpacing: "0.18em", textTransform: "uppercase" },
  cardTitle: { margin: "4px 0 0", fontSize: "clamp(28px, 7vw, 40px)", letterSpacing: "-0.06em", lineHeight: 1 },
  miniTitle: { margin: "2px 0 0", fontSize: 24, letterSpacing: "-0.045em", lineHeight: 1 },
  sportGrid: { display: "grid", gridTemplateColumns: "1fr", gap: 10 },
  choiceButton: { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.065)", color: "white", borderRadius: 24, padding: 18, textAlign: "left", cursor: "pointer", display: "grid", gap: 6 },
  choiceButtonActive: { borderColor: "rgba(228,239,22,0.72)", background: "rgba(228,239,22,0.15)", color: "#e4ef16" },
  choiceButtonDisabled: { opacity: 0.38, cursor: "not-allowed" },
  methodGrid: { display: "grid", gridTemplateColumns: "1fr", gap: 12 },
  methodCard: { border: "1px solid rgba(255,255,255,0.13)", background: darkerGlass, color: "white", borderRadius: 28, padding: 18, textAlign: "left", cursor: "pointer", display: "grid", gap: 9 },
  methodIcon: { width: 48, height: 48, borderRadius: 18, display: "grid", placeItems: "center", background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.20)", fontSize: 22 },
  filters: { display: "grid", gap: 9 },
  filtersCompact: { display: "grid", gap: 8 },
  filterLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.12em" },
  chipRow: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" },
  chip: { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.78)", borderRadius: 999, padding: "10px 13px", fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" },
  chipSmall: { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.055)", color: "rgba(255,255,255,0.68)", borderRadius: 999, padding: "8px 11px", fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap", fontSize: 12 },
  chipActive: { background: "#e4ef16", color: "#101406", borderColor: "#e4ef16" },
  panelSwitch: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 5, borderRadius: 999, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" },
  panelTab: { minHeight: 46, borderRadius: 999, border: 0, background: "transparent", color: "rgba(255,255,255,0.62)", fontWeight: 950, cursor: "pointer" },
  panelTabActive: { background: "#e4ef16", color: "#101406" },
  fieldsGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  field: { display: "grid", gap: 7, color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 13 },
  fieldFull: { gridColumn: "1 / -1", display: "grid", gap: 7, color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 13 },
  input: { width: "100%", minHeight: 48, borderRadius: 16, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.24)", color: "white", padding: "0 12px", boxSizing: "border-box", outline: "none", fontSize: 15 },
  textarea: { width: "100%", minHeight: 84, borderRadius: 16, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.24)", color: "white", padding: 12, boxSizing: "border-box", outline: "none", fontSize: 15, resize: "vertical" },
  searchInput: { width: "100%", minHeight: 50, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.28)", color: "white", padding: "0 15px", boxSizing: "border-box", outline: "none", fontSize: 16 },
  exerciseList: { display: "grid", gap: 8 },
  exercisePick: { border: "1px solid rgba(255,255,255,0.09)", background: "rgba(0,0,0,0.22)", color: "white", borderRadius: 20, padding: 12, textAlign: "left", display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) 34px", gap: 11, alignItems: "center", cursor: "pointer" },
  exercisePickAdded: { borderColor: "rgba(228,239,22,0.38)", background: "rgba(228,239,22,0.08)" },
  exerciseAvatar: { width: 38, height: 38, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.18)", color: "#e4ef16", fontWeight: 950 },
  exerciseText: { minWidth: 0, display: "grid", gap: 3 },
  addSymbol: { width: 32, height: 32, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.08)" },
  addCustomButton: { border: "1px solid rgba(228,239,22,0.28)", background: "rgba(228,239,22,0.12)", color: "#e4ef16", borderRadius: 999, padding: "9px 11px", fontWeight: 950, cursor: "pointer" },
  customBox: { display: "grid", gap: 8, padding: 12, borderRadius: 22, background: "rgba(0,0,0,0.24)", border: "1px solid rgba(228,239,22,0.18)" },
  submitMini: { minHeight: 44, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", fontWeight: 950, cursor: "pointer" },
  emptyPlan: { border: "1px dashed rgba(255,255,255,0.16)", borderRadius: 24, minHeight: 180, display: "grid", placeItems: "center", color: "rgba(255,255,255,0.56)", fontWeight: 850, textAlign: "center", padding: 18 },
  selectedList: { display: "grid", gap: 12 },
  selectedExercise: { borderRadius: 24, background: darkerGlass, border: "1px solid rgba(255,255,255,0.12)", padding: 12, display: "grid", gap: 10 },
  selectedTop: { display: "grid", gridTemplateColumns: "42px minmax(0, 1fr) auto", alignItems: "center", gap: 10 },
  orderBadge: { width: 38, height: 38, borderRadius: 14, border: 0, display: "grid", placeItems: "center", background: "#e4ef16", color: "#101406", fontWeight: 950, cursor: "pointer" },
  selectedNameButton: { border: 0, background: "transparent", color: "white", textAlign: "left", display: "grid", gap: 2, minWidth: 0, cursor: "pointer", padding: 0 },
  reorderButtons: { display: "flex", gap: 5 },
  iconButton: { width: 32, height: 32, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.08)", color: "white", fontWeight: 950, cursor: "pointer" },
  removeButton: { width: 32, height: 32, borderRadius: 12, border: "1px solid rgba(255,90,90,0.26)", background: "rgba(255,60,60,0.14)", color: "#ff9b9b", fontWeight: 950, cursor: "pointer" },
  quickSetRow: { display: "grid", gridTemplateColumns: "0.75fr 1fr 1fr", gap: 8 },
  quickInput: { width: "100%", minHeight: 42, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.26)", color: "white", padding: "0 9px", boxSizing: "border-box", outline: "none", fontWeight: 900 },
  setHeader: { display: "grid", gridTemplateColumns: "36px repeat(3, minmax(0, 1fr)) 30px", gap: 6, color: "rgba(255,255,255,0.46)", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" },
  setRow: { display: "grid", gridTemplateColumns: "36px repeat(3, minmax(0, 1fr)) 30px", gap: 6, alignItems: "center" },
  setInput: { minWidth: 0, width: "100%", minHeight: 38, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.26)", color: "white", padding: "0 8px", boxSizing: "border-box", outline: "none", fontWeight: 850 },
  removeSet: { width: 30, height: 30, borderRadius: 10, border: 0, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", fontWeight: 950, cursor: "pointer" },
  addSet: { justifySelf: "start", border: "1px solid rgba(228,239,22,0.22)", background: "rgba(228,239,22,0.10)", color: "#e4ef16", borderRadius: 999, padding: "8px 12px", fontWeight: 950, cursor: "pointer" },
  saveDock: { position: "fixed", left: 16, right: 16, bottom: 84, maxWidth: 720, margin: "0 auto", display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 8, pointerEvents: "none", zIndex: 30 },
  secondaryDockButton: { minHeight: 52, borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(13,18,21,0.96)", color: "white", fontWeight: 950, fontSize: 15, cursor: "pointer", padding: "0 14px", pointerEvents: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.45)" },
  submitButton: { minHeight: 52, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", fontWeight: 950, fontSize: 15, cursor: "pointer", padding: "0 16px", pointerEvents: "auto", boxShadow: "0 20px 60px rgba(228,239,22,0.16)" },
  submitButtonDisabled: { opacity: 0.42, cursor: "not-allowed" },
  smallButton: { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.08)", color: "white", borderRadius: 999, padding: "9px 12px", fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" },
};
