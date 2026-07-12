"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import BottomNav from "../../../components/BottomNav";
import { supabase } from "../../../lib/supabase";

const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core"];
const EQUIPMENT_OPTIONS = ["Barbell", "Dumbbell", "Cable", "Machine", "Smith Machine", "Bodyweight", "Kettlebell", "Band", "Trap Bar", "Plate Loaded", "Sled", "SkiErg", "RowErg", "Sandbag", "Wall ball", "Plyo box", "Jump rope", "Air bike", "Battle ropes"];

const WORKOUT_SPORTS = [
  { id: "strength_training", label: "Strength Training", image: "/training-images/workout-hero-deadlift.png", description: "Strength, hypertrophy and resistance training.", step3: "Structure", heading: "Choose strength structure" },
  { id: "hyrox", label: "HYROX", image: "/training-images/workout-hero-deadlift.png", description: "Running blocks combined with HYROX stations.", step3: "Structure", heading: "Choose HYROX structure" },
  { id: "crossfit", label: "CrossFit", image: "/training-images/workout-hero-deadlift.png", description: "AMRAP, EMOM, For Time and mixed modal workouts.", step3: "Workout Type", heading: "Choose CrossFit format" },
  { id: "bootcamp", label: "Bootcamp", image: "/training-images/workout-hero-deadlift.png", description: "Circuits, intervals, stations and team sessions.", step3: "Structure", heading: "Choose Bootcamp structure" },
];

function makeId(prefix = "item") { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function cleanNumber(value) { if (value === "" || value === null || value === undefined) return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function firstName(profile) { return profile?.first_name || String(profile?.name || "").split(" ")[0] || "Maurice"; }
function normalizeMuscleGroup(value) { const normalized = String(value || "").trim().toLowerCase(); return MUSCLE_GROUPS.find((group) => group.toLowerCase() === normalized) || String(value || "").trim(); }
function normalizeExercise(row, source = "catalog") {
  return {
    id: row.id,
    source,
    name: String(row.name || "").trim(),
    primary_muscle_group: normalizeMuscleGroup(row.primary_muscle_group),
    equipment: String(row.equipment || "").trim(),
    category: row.category || "movement",
    metric_type: row.metric_type || "reps",
    default_reps: row.default_reps,
    default_distance_m: row.default_distance_m,
    default_duration_seconds: row.default_duration_seconds,
  };
}
function exerciseKey(exercise) { return `${exercise.source}-${exercise.id}`; }
function defaultSets(exercise) {
  const metric = exercise?.metric_type || "reps";
  return [1, 2, 3].map((setNumber) => ({
    id: makeId("set"),
    set_number: setNumber,
    reps: metric === "reps" || metric === "load" ? String(exercise?.default_reps || 10) : "",
    weight_kg: "",
    rest_seconds: "90",
    distance_m: metric === "distance" ? String(exercise?.default_distance_m || 100) : "",
    duration_seconds: metric === "duration" ? String(exercise?.default_duration_seconds || 30) : "",
    calories: metric === "calories" ? String(exercise?.default_reps || 15) : "",
  }));
}
function muscleIcon(group) { return `/illustrations/workout-builder/${String(group || "core").toLowerCase()}.png`; }
function metricSummary(exercise, set) {
  if (exercise.metric_type === "distance") return `${set.distance_m || "?"} m`;
  if (exercise.metric_type === "duration") return `${set.duration_seconds || "?"} sec`;
  if (exercise.metric_type === "calories") return `${set.calories || "?"} cal`;
  return `${set.reps || "?"} reps${set.weight_kg ? ` • ${set.weight_kg} kg` : ""}`;
}
function summarizeSets(item) { const first = item.sets?.[0]; return first ? `${item.sets.length} sets • ${metricSummary(item.exercise, first)}` : "No sets"; }

export default function NewWorkoutPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [step, setStep] = useState("sport");
  const [sportId, setSportId] = useState("");
  const [method, setMethod] = useState("");
  const [structures, setStructures] = useState([]);
  const [selectedStructureCode, setSelectedStructureCode] = useState("");
  const [selectedMuscles, setSelectedMuscles] = useState([]);
  const [exerciseCatalog, setExerciseCatalog] = useState([]);
  const [customExercises, setCustomExercises] = useState([]);
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", primary_muscle_group: "Chest", equipment: "", notes: "" });
  const [form, setForm] = useState({ title: "", description: "", visibility: "team", level: "intermediate", duration_min: "60" });

  const sport = WORKOUT_SPORTS.find((item) => item.id === sportId) || null;
  const selectedStructure = structures.find((item) => item.code === selectedStructureCode) || null;
  const isStrength = sportId === "strength_training";
  const stepOrder = ["sport", "method", "structure", "exercises", "finish"];
  const stepIndex = stepOrder.indexOf(step) + 1;
  const stepLabels = ["Sport", "Method", sport?.step3 || "Structure", "Exercises", "Finish"];

  useEffect(() => { load(); }, []);

  async function load() {
    setChecking(true); setMessage("");
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user?.id) return router.replace("/login");
      const { data: profileRow } = await supabase.from("profiles").select("id,name,first_name,last_name,email,avatar_url,onboarding_completed,blocked").eq("id", user.id).maybeSingle();
      if (profileRow?.blocked) { await supabase.auth.signOut(); return router.replace("/login?blocked=1"); }
      if (!profileRow?.onboarding_completed) return router.replace("/onboarding");
      setProfile(profileRow || null);
      const [customResult, notificationResult, inviteResult] = await Promise.all([
        supabase.from("user_strength_exercises").select("id,name,primary_muscle_group,equipment,active").eq("user_id", user.id).eq("active", true).order("name", { ascending: true }),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
      ]);
      setCustomExercises((customResult.data || []).map((row) => normalizeExercise({ ...row, metric_type: "reps" }, "custom")));
      setUnreadCount((notificationResult.count || 0) + (inviteResult.count || 0));
    } catch (error) { console.error(error); setMessage(error?.message || "Could not load the workout creator."); }
    finally { setChecking(false); }
  }

  const visibleExercises = useMemo(() => {
    const base = isStrength ? [...exerciseCatalog, ...customExercises] : exerciseCatalog;
    if (!isStrength || !selectedMuscles.length) return base;
    return base.filter((exercise) => selectedMuscles.includes(normalizeMuscleGroup(exercise.primary_muscle_group)));
  }, [exerciseCatalog, customExercises, isStrength, selectedMuscles]);

  const selectedSetCount = selectedExercises.reduce((sum, item) => sum + item.sets.length, 0);

  async function chooseSport(nextSportId) {
    const nextSport = WORKOUT_SPORTS.find((item) => item.id === nextSportId);
    setSportId(nextSportId); setMethod(""); setSelectedStructureCode(""); setSelectedMuscles([]); setSelectedExercises([]); setStructures([]); setExerciseCatalog([]); setCatalogLoading(true); setMessage("");
    setForm((current) => ({ ...current, title: `${firstName(profile)} ${nextSport?.label || "Workout"}`, description: "" }));
    try {
      const response = await fetch(`/api/workouts/catalog?sport_id=${encodeURIComponent(nextSportId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load this sport catalog.");
      setExerciseCatalog((payload.exercises || []).map((row) => normalizeExercise(row, "catalog")));
      setStructures(payload.structures || []);
      setStep("method");
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Could not load this sport catalog.");
    } finally { setCatalogLoading(false); }
  }

  function chooseMethod(nextMethod) {
    setMethod(nextMethod);
    const firstStructure = structures[0];
    if (nextMethod === "wizard" && firstStructure) setSelectedStructureCode(firstStructure.code);
    if (nextMethod === "wizard" && isStrength && !selectedMuscles.length) {
      const configured = firstStructure?.config?.muscle_groups;
      setSelectedMuscles(Array.isArray(configured) && configured.length ? configured : ["Chest", "Back", "Legs"]);
    }
    setStep("structure");
  }

  function selectStructure(structure) {
    setSelectedStructureCode(structure.code);
    if (isStrength && Array.isArray(structure.config?.muscle_groups)) setSelectedMuscles(structure.config.muscle_groups);
  }
  function toggleMuscle(group) { setSelectedMuscles((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group]); }
  function addExercise(exercise) { setSelectedExercises((current) => current.some((item) => exerciseKey(item.exercise) === exerciseKey(exercise)) ? current : [...current, { id: makeId("selected"), exercise, notes: "", sets: defaultSets(exercise) }]); }
  function removeExercise(localId) { setSelectedExercises((current) => current.filter((item) => item.id !== localId)); }
  function toggleExercise(exercise) { const existing = selectedExercises.find((item) => exerciseKey(item.exercise) === exerciseKey(exercise)); if (existing) removeExercise(existing.id); else addExercise(exercise); }
  function updateSet(exerciseId, setId, key, value) { setSelectedExercises((current) => current.map((item) => item.id === exerciseId ? { ...item, sets: item.sets.map((set) => set.id === setId ? { ...set, [key]: value } : set) } : item)); }
  function addSet(exerciseId) { setSelectedExercises((current) => current.map((item) => item.id !== exerciseId ? item : { ...item, sets: [...item.sets, { ...defaultSets(item.exercise)[0], id: makeId("set"), set_number: item.sets.length + 1 }] })); }
  function removeSet(exerciseId, setId) { setSelectedExercises((current) => current.map((item) => item.id !== exerciseId || item.sets.length <= 1 ? item : { ...item, sets: item.sets.filter((set) => set.id !== setId).map((set, index) => ({ ...set, set_number: index + 1 })) })); }

  function generateWizardProposal() {
    const stationNames = selectedStructure?.config?.stations;
    let proposal = [];
    if (Array.isArray(stationNames) && stationNames.length) {
      proposal = stationNames.map((name) => visibleExercises.find((exercise) => exercise.name === name)).filter(Boolean);
    }
    if (!proposal.length) proposal = visibleExercises.slice(0, Number(form.duration_min) <= 45 ? 5 : 8);
    setSelectedExercises(proposal.map((exercise) => ({ id: makeId("selected"), exercise, notes: "", sets: defaultSets(exercise) })));
  }

  function continueFromStructure() {
    if (!selectedStructureCode) return setMessage(`Choose a ${sport?.label || "workout"} structure.`);
    if (isStrength && !selectedMuscles.length) return setMessage("Choose at least one muscle group.");
    setMessage("");
    if (method === "wizard") generateWizardProposal();
    setStep("exercises");
  }
  function continueFromExercises() { if (!selectedExercises.length) return setMessage("Choose at least one exercise."); setMessage(""); setStep("finish"); }

  async function addCustomExercise() {
    const name = customForm.name.trim(); if (!name || !profile?.id) return setMessage("Add a custom exercise name.");
    const localExercise = normalizeExercise({ id: makeId("custom-local"), name, primary_muscle_group: customForm.primary_muscle_group, equipment: customForm.equipment, metric_type: "reps" }, "custom");
    try {
      const { data, error } = await supabase.from("user_strength_exercises").insert({ user_id: profile.id, name, primary_muscle_group: customForm.primary_muscle_group, equipment: customForm.equipment.trim() || null, notes: customForm.notes.trim() || null }).select("id,name,primary_muscle_group,equipment").single();
      if (error) throw error;
      const saved = normalizeExercise({ ...data, metric_type: "reps" }, "custom");
      setCustomExercises((current) => [...current, saved]); addExercise(saved);
    } catch { setCustomExercises((current) => [...current, localExercise]); addExercise(localExercise); }
    finally { setCustomForm({ name: "", primary_muscle_group: customForm.primary_muscle_group, equipment: "", notes: "" }); setCustomOpen(false); }
  }

  async function saveWorkout(event) {
    event.preventDefault(); setMessage("");
    if (!profile?.id) return router.replace("/login");
    if (!sportId) return setMessage("Choose a sport.");
    if (!method) return setMessage("Choose Manual Builder or Workout Wizard.");
    if (!selectedStructureCode) return setMessage("Choose a workout structure.");
    if (isStrength && !selectedMuscles.length) return setMessage("Choose at least one muscle group.");
    if (!selectedExercises.length) return setMessage("Choose at least one exercise.");
    if (!form.title.trim()) return setMessage("Add a workout title.");

    const normalizedExercises = selectedExercises.map((item, index) => ({
      position: index,
      source: item.exercise.source,
      id: item.exercise.id,
      name: item.exercise.name,
      category: item.exercise.category,
      metric_type: item.exercise.metric_type,
      primary_muscle_group: item.exercise.primary_muscle_group,
      equipment: item.exercise.equipment || null,
      notes: item.notes || null,
      sets: item.sets.map((set, setIndex) => ({
        set_number: setIndex + 1,
        reps: cleanNumber(set.reps),
        weight_kg: cleanNumber(set.weight_kg),
        rest_seconds: cleanNumber(set.rest_seconds),
        distance_m: cleanNumber(set.distance_m),
        duration_seconds: cleanNumber(set.duration_seconds),
        calories: cleanNumber(set.calories),
      })),
    }));

    try {
      setSaving(true);
      const { data: workout, error: workoutError } = await supabase.from("workouts").insert({
        creator_id: profile.id,
        sport_id: sportId,
        title: form.title.trim(),
        description: form.description.trim(),
        workout_type: selectedStructureCode,
        level: form.level,
        duration_min: cleanNumber(form.duration_min),
        visibility: form.visibility,
        structure: {
          builder_version: 6,
          sport_id: sportId,
          sport_label: sport?.label,
          method,
          format: selectedStructureCode,
          format_name: selectedStructure?.name,
          format_config: selectedStructure?.config || {},
          muscle_groups: selectedMuscles,
          exercises: normalizedExercises,
        },
      }).select("id").single();
      if (workoutError) throw workoutError;

      try {
        for (const item of normalizedExercises) {
          const strengthExerciseId = item.source === "catalog" && sportId === "strength_training" ? item.id : null;
          const userStrengthExerciseId = item.source === "custom" && !String(item.id).startsWith("custom-local") ? item.id : null;
          const { data: workoutExercise, error: exerciseError } = await supabase.from("workout_exercises").insert({
            workout_id: workout.id,
            position: item.position,
            exercise_source: strengthExerciseId ? "global" : userStrengthExerciseId ? "custom" : "snapshot",
            strength_exercise_id: strengthExerciseId,
            user_strength_exercise_id: userStrengthExerciseId,
            exercise_name_snapshot: item.name,
            primary_muscle_group_snapshot: item.primary_muscle_group || item.category || "Conditioning",
            equipment_snapshot: item.equipment,
            notes: item.notes,
          }).select("id").single();
          if (exerciseError) throw exerciseError;
          const setRows = item.sets.map((set) => ({ workout_exercise_id: workoutExercise.id, ...set }));
          if (setRows.length) { const { error: setsError } = await supabase.from("workout_exercise_sets").insert(setRows); if (setsError) throw setsError; }
        }
      } catch (normalizedError) { console.warn("Normalized workout tables failed; JSON structure was saved.", normalizedError); }

      const queryParams = new URLSearchParams(window.location.search); const returnTo = queryParams.get("returnTo");
      if (returnTo) { const params = new URLSearchParams({ workout_id: workout.id, step: queryParams.get("step") || "workout" }); router.push(`${returnTo}?${params.toString()}`); } else router.push("/workouts");
    } catch (error) { console.error(error); setMessage(error?.message || "Could not save workout."); }
    finally { setSaving(false); }
  }

  return (
    <main className="workout-builder-page">
      <section className="workout-builder-shell">
        <AppHeader profile={profile} compact />
        <header className="workout-builder-header"><h1>Create Workouts<span>.</span></h1></header>
        <nav className="workout-builder-stepbar workout-builder-stepbar-five" aria-label="Workout builder steps">{stepLabels.map((label, index) => { const number = index + 1; const active = stepIndex === number; const done = stepIndex > number; return <button key={`${number}-${label}`} type="button" className={`builder-step ${active ? "active" : ""} ${done ? "done" : ""}`} onClick={() => { if (number === 1) setStep("sport"); if (number === 2 && sportId) setStep("method"); if (number === 3 && method) setStep("structure"); if (number === 4 && selectedStructureCode) setStep("exercises"); if (number === 5 && selectedExercises.length) setStep("finish"); }}><b>{done ? "✓" : number}</b>{label}</button>; })}</nav>
        {message ? <section className="workout-builder-message">{message}</section> : null}
        {checking ? <section className="workout-builder-card">Checking profile...</section> : (
          <form onSubmit={saveWorkout} className="workout-builder-form">
            {step === "sport" && <section className="workout-builder-card workout-sport-step"><p className="builder-kicker">Step 1</p><h2>Choose sport</h2><div className="workout-sport-grid">{WORKOUT_SPORTS.map((item) => <button key={item.id} type="button" className="workout-sport-card" disabled={catalogLoading} style={{ "--workout-sport-image": `url(${item.image})` }} onClick={() => chooseSport(item.id)}><span><b>{item.label}</b><small>{item.description}</small></span></button>)}</div></section>}

            {step === "method" && <section className="workout-builder-card"><p className="builder-kicker">Step 2</p><h2>How do you want to build?</h2><span className="builder-intro">{sport?.label} • {exerciseCatalog.length} exercises available</span><button type="button" className="builder-choice-card" onClick={() => chooseMethod("manual")}><img src="/illustrations/workout-builder/manual.svg" alt="" /><span><b>Manual Builder</b><small>Choose the structure and exercises yourself.</small></span></button><button type="button" className="builder-choice-card recommended" onClick={() => chooseMethod("wizard")}><img src="/illustrations/workout-builder/wizard.svg" alt="" /><span><b>Workout Wizard</b><small>Let Endurance create a first sport-specific proposal.</small></span></button></section>}

            {step === "structure" && <section className="workout-builder-card"><p className="builder-kicker">Step 3</p><h2>{sport?.heading}</h2><span className="builder-intro">Structures and exercises are loaded from the {sport?.label} catalog.</span><div className="workout-structure-grid">{structures.map((item) => <button key={item.code} type="button" className={`workout-structure-card ${selectedStructureCode === item.code ? "selected" : ""}`} onClick={() => selectStructure(item)}><b>{item.name}</b><small>{item.description}</small></button>)}</div>{isStrength ? <div className="muscle-picker-grid">{MUSCLE_GROUPS.map((group) => { const active = selectedMuscles.includes(group); return <button key={group} type="button" className={`muscle-picker-card ${active ? "selected" : ""}`} onClick={() => toggleMuscle(group)}><img src={muscleIcon(group)} alt="" /><span>{group}</span>{active ? <b>✓</b> : null}</button>; })}</div> : null}<div className="builder-actions"><button type="button" className="builder-secondary" onClick={() => setStep("method")}>Back</button><button type="button" className="builder-primary" onClick={continueFromStructure}>Continue</button></div></section>}

            {step === "exercises" && <section className="workout-builder-card"><p className="builder-kicker">Step 4</p><h2>Choose {sport?.label} exercises</h2><span className="builder-intro">{selectedStructure?.name} • {visibleExercises.length} relevant exercises</span><div className="builder-two-fields"><label>Workout name<input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} /></label><label>Duration<input type="number" value={form.duration_min} onChange={(e) => setForm((current) => ({ ...current, duration_min: e.target.value }))} /></label></div><div className="exercise-group-block">{visibleExercises.map((exercise) => { const active = selectedExercises.some((item) => exerciseKey(item.exercise) === exerciseKey(exercise)); return <button key={exerciseKey(exercise)} type="button" className={`exercise-select-row ${active ? "selected" : ""}`} onClick={() => toggleExercise(exercise)}><img src={muscleIcon(exercise.primary_muscle_group)} alt="" /><span><b>{exercise.name}</b><small>{exercise.category} • {exercise.equipment || "No equipment"} • {exercise.metric_type}</small></span><i>{active ? "✓" : "+"}</i></button>; })}</div>{isStrength ? <><button type="button" className="builder-dashed" onClick={() => setCustomOpen((value) => !value)}>+ Add custom exercise</button>{customOpen ? <div className="custom-exercise-box"><label>Exercise name<input value={customForm.name} onChange={(e) => setCustomForm((current) => ({ ...current, name: e.target.value }))} /></label><label>Muscle group<select value={customForm.primary_muscle_group} onChange={(e) => setCustomForm((current) => ({ ...current, primary_muscle_group: e.target.value }))}>{MUSCLE_GROUPS.map((group) => <option key={group}>{group}</option>)}</select></label><label>Equipment<select value={customForm.equipment} onChange={(e) => setCustomForm((current) => ({ ...current, equipment: e.target.value }))}><option value="">Choose equipment</option>{EQUIPMENT_OPTIONS.map((equipment) => <option key={equipment}>{equipment}</option>)}</select></label><button type="button" className="builder-primary full" onClick={addCustomExercise}>Add exercise</button></div> : null}</> : null}<div className="builder-actions"><button type="button" className="builder-secondary" onClick={() => setStep("structure")}>Back</button><button type="button" className="builder-primary" onClick={continueFromExercises}>Continue</button></div></section>}

            {step === "finish" && <section className="workout-builder-card"><p className="builder-kicker">Step 5</p><h2>Finish {sport?.label}</h2><span className="builder-intro">{selectedStructure?.name} • {selectedExercises.length} exercises • {selectedSetCount} sets</span><div className="builder-finish-fields"><label>Description<textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></label><label>Visibility<select value={form.visibility} onChange={(e) => setForm((current) => ({ ...current, visibility: e.target.value }))}><option value="team">Team</option><option value="private">Private</option><option value="public">Public</option></select></label><label>Level<select value={form.level} onChange={(e) => setForm((current) => ({ ...current, level: e.target.value }))}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label></div><div className="selected-exercise-stack">{selectedExercises.map((item) => <article key={item.id} className="selected-exercise-card"><header><span><b>{item.exercise.name}</b><small>{summarizeSets(item)}</small></span><button type="button" onClick={() => removeExercise(item.id)}>Remove</button></header><div className="sets-table">{item.sets.map((set) => <div key={set.id} className="set-row"><span>Set {set.set_number}</span>{item.exercise.metric_type === "distance" ? <input value={set.distance_m} onChange={(e) => updateSet(item.id, set.id, "distance_m", e.target.value)} placeholder="Meters" /> : item.exercise.metric_type === "duration" ? <input value={set.duration_seconds} onChange={(e) => updateSet(item.id, set.id, "duration_seconds", e.target.value)} placeholder="Seconds" /> : item.exercise.metric_type === "calories" ? <input value={set.calories} onChange={(e) => updateSet(item.id, set.id, "calories", e.target.value)} placeholder="Calories" /> : <input value={set.reps} onChange={(e) => updateSet(item.id, set.id, "reps", e.target.value)} placeholder="Reps" />}<input value={set.weight_kg} onChange={(e) => updateSet(item.id, set.id, "weight_kg", e.target.value)} placeholder="kg" /><input value={set.rest_seconds} onChange={(e) => updateSet(item.id, set.id, "rest_seconds", e.target.value)} placeholder="Rest" /><button type="button" onClick={() => removeSet(item.id, set.id)}>−</button></div>)}</div><button type="button" className="builder-dashed small" onClick={() => addSet(item.id)}>+ Add set</button></article>)}</div><div className="builder-actions"><button type="button" className="builder-secondary" onClick={() => setStep("exercises")}>Back</button><button type="submit" className="builder-primary" disabled={saving}>{saving ? "Saving..." : "Save workout"}</button></div></section>}
          </form>
        )}
      </section>
      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
