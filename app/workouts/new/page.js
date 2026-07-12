"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import BottomNav from "../../../components/BottomNav";
import { supabase } from "../../../lib/supabase";

const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core"];
const EQUIPMENT_OPTIONS = ["Barbell", "Dumbbell", "Cable", "Machine", "Smith Machine", "Bodyweight", "Kettlebell", "Band", "Trap Bar", "Plate Loaded"];

const WORKOUT_SPORTS = [
  {
    id: "strength_training",
    label: "Strength Training",
    image: "/training-images/workout-hero-deadlift.png",
    description: "Build exercises, sets, reps, weight and rest.",
    step3: "Muscle Groups",
    heading: "Select muscle groups",
    structures: [],
  },
  {
    id: "hyrox",
    label: "HYROX",
    image: "/training-images/workout-hero-deadlift.png",
    description: "Combine running blocks with functional stations.",
    step3: "Structure",
    heading: "Choose HYROX structure",
    structures: ["Full HYROX", "Half HYROX", "Running + Stations", "Custom HYROX"],
  },
  {
    id: "crossfit",
    label: "CrossFit",
    image: "/training-images/workout-hero-deadlift.png",
    description: "Create an AMRAP, EMOM, For Time or Chipper workout.",
    step3: "Workout Type",
    heading: "Choose CrossFit format",
    structures: ["AMRAP", "EMOM", "For Time", "Chipper"],
  },
  {
    id: "bootcamp",
    label: "Bootcamp",
    image: "/training-images/workout-hero-deadlift.png",
    description: "Build circuits, intervals, stations or team sessions.",
    step3: "Structure",
    heading: "Choose Bootcamp structure",
    structures: ["Circuit", "Intervals", "Stations", "Team Workout"],
  },
];

function makeId(prefix = "item") { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function cleanNumber(value) { if (value === "" || value === null || value === undefined) return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function firstName(profile) { return profile?.first_name || String(profile?.name || "").split(" ")[0] || "Maurice"; }
function normalizeMuscleGroup(value) { const normalized = String(value || "").trim().toLowerCase(); return MUSCLE_GROUPS.find((group) => group.toLowerCase() === normalized) || String(value || "").trim(); }
function normalizeExercise(row, source) { return { id: row.id, source, name: String(row.name || "").trim(), primary_muscle_group: normalizeMuscleGroup(row.primary_muscle_group), equipment: String(row.equipment || "").trim(), image_url: row.image_url || "" }; }
function catalogDedupKey(exercise) { return `${String(exercise?.name || "").trim().toLowerCase()}::${String(exercise?.primary_muscle_group || "").trim().toLowerCase()}::${String(exercise?.equipment || "").trim().toLowerCase()}`; }
function buildExerciseCatalog(globalExercises = [], customExercises = []) {
  const rows = [...globalExercises.map((row) => normalizeExercise(row, "global")), ...customExercises.map((row) => normalizeExercise(row, "custom"))].filter((exercise) => exercise?.name);
  const seen = new Set();
  return rows.filter((exercise) => { const key = catalogDedupKey(exercise); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
function defaultSets() { return [1, 2, 3].map((setNumber) => ({ id: makeId("set"), set_number: setNumber, reps: "10", weight_kg: "", rest_seconds: "90" })); }
function muscleIcon(group) { return `/illustrations/workout-builder/${String(group || "chest").toLowerCase()}.png`; }
function exerciseKey(exercise) { return `${exercise.source}-${exercise.id}`; }
function summarizeSets(sets = []) { if (!sets.length) return "No sets"; const first = sets[0]; return `${sets.length} sets • ${first.reps || "?"} reps • ${first.weight_kg ? `${first.weight_kg} kg` : "open"}`; }

export default function NewWorkoutPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [step, setStep] = useState("sport");
  const [sportId, setSportId] = useState("");
  const [method, setMethod] = useState("");
  const [selectedStructure, setSelectedStructure] = useState("");
  const [selectedMuscles, setSelectedMuscles] = useState([]);
  const [exerciseCatalog, setExerciseCatalog] = useState([]);
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", primary_muscle_group: "Chest", equipment: "", notes: "" });
  const [form, setForm] = useState({ title: "", description: "", visibility: "team", level: "intermediate", duration_min: "60" });

  const sport = WORKOUT_SPORTS.find((item) => item.id === sportId) || null;
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
      const [exerciseResponse, customResult, notificationResult, inviteResult] = await Promise.all([
        fetch("/api/workouts/strength-exercises", { cache: "no-store" }),
        supabase.from("user_strength_exercises").select("id,name,primary_muscle_group,equipment,image_url,active").eq("user_id", user.id).eq("active", true).order("name", { ascending: true }),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
      ]);
      if (!exerciseResponse.ok) throw new Error("Could not load exercises from the database.");
      const payload = await exerciseResponse.json();
      setExerciseCatalog(buildExerciseCatalog(Array.isArray(payload?.exercises) ? payload.exercises : [], customResult.error ? [] : customResult.data || []));
      setUnreadCount((notificationResult.count || 0) + (inviteResult.count || 0));
    } catch (error) { console.error(error); setMessage(error?.message || "Could not load the workout creator."); }
    finally { setChecking(false); }
  }

  const groupedExercises = useMemo(() => {
    const result = {}; MUSCLE_GROUPS.forEach((group) => { result[group] = exerciseCatalog.filter((exercise) => normalizeMuscleGroup(exercise.primary_muscle_group) === group); }); return result;
  }, [exerciseCatalog]);
  const visibleExercises = useMemo(() => isStrength ? exerciseCatalog.filter((exercise) => selectedMuscles.includes(normalizeMuscleGroup(exercise.primary_muscle_group))) : exerciseCatalog, [exerciseCatalog, isStrength, selectedMuscles]);
  const selectedMuscleSummary = selectedMuscles.length ? selectedMuscles.join(", ") : "No muscle groups selected";
  const selectedSetCount = selectedExercises.reduce((sum, item) => sum + item.sets.length, 0);

  function chooseSport(nextSportId) {
    const nextSport = WORKOUT_SPORTS.find((item) => item.id === nextSportId);
    setSportId(nextSportId); setMethod(""); setSelectedStructure(""); setSelectedMuscles([]); setSelectedExercises([]);
    setForm((current) => ({ ...current, title: `${firstName(profile)} ${nextSport?.label || "Workout"}`, description: "" }));
    setStep("method"); setMessage("");
  }
  function chooseMethod(nextMethod) {
    setMethod(nextMethod);
    if (nextMethod === "wizard") {
      if (isStrength) setSelectedMuscles(["Chest", "Back", "Legs"]);
      else setSelectedStructure(sport?.structures?.[0] || "");
    }
    setStep("structure");
  }
  function toggleMuscle(group) { setSelectedMuscles((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group]); }
  function addExercise(exercise) { setSelectedExercises((current) => current.some((item) => exerciseKey(item.exercise) === exerciseKey(exercise)) ? current : [...current, { id: makeId("selected"), exercise, notes: "", sets: defaultSets() }]); }
  function removeExercise(localId) { setSelectedExercises((current) => current.filter((item) => item.id !== localId)); }
  function toggleExercise(exercise) { const existing = selectedExercises.find((item) => exerciseKey(item.exercise) === exerciseKey(exercise)); if (existing) removeExercise(existing.id); else addExercise(exercise); }
  function updateSet(exerciseId, setId, key, value) { setSelectedExercises((current) => current.map((item) => item.id === exerciseId ? { ...item, sets: item.sets.map((set) => set.id === setId ? { ...set, [key]: value } : set) } : item)); }
  function addSet(exerciseId) { setSelectedExercises((current) => current.map((item) => item.id !== exerciseId ? item : { ...item, sets: [...item.sets, { id: makeId("set"), set_number: item.sets.length + 1, reps: "10", weight_kg: "", rest_seconds: "90" }] })); }
  function removeSet(exerciseId, setId) { setSelectedExercises((current) => current.map((item) => item.id !== exerciseId || item.sets.length <= 1 ? item : { ...item, sets: item.sets.filter((set) => set.id !== setId).map((set, index) => ({ ...set, set_number: index + 1 })) })); }

  function continueFromStructure() {
    if (isStrength && !selectedMuscles.length) return setMessage("Choose at least one muscle group.");
    if (!isStrength && !selectedStructure) return setMessage(`Choose a ${sport?.label || "workout"} structure.`);
    setMessage("");
    if (method === "wizard") {
      const proposal = (isStrength ? visibleExercises : exerciseCatalog).slice(0, Number(form.duration_min) <= 45 ? 5 : 8);
      setSelectedExercises(proposal.map((exercise) => ({ id: makeId("selected"), exercise, notes: "", sets: defaultSets() })));
    }
    setStep("exercises");
  }
  function continueFromExercises() { if (!selectedExercises.length) return setMessage("Choose at least one exercise."); setMessage(""); setStep("finish"); }

  async function addCustomExercise() {
    const name = customForm.name.trim(); if (!name || !profile?.id) return setMessage("Add a custom exercise name.");
    const localExercise = { id: makeId("custom-local"), source: "custom", name, primary_muscle_group: customForm.primary_muscle_group, equipment: customForm.equipment.trim(), image_url: "" };
    try {
      const { data, error } = await supabase.from("user_strength_exercises").insert({ user_id: profile.id, name, primary_muscle_group: customForm.primary_muscle_group, equipment: customForm.equipment.trim() || null, notes: customForm.notes.trim() || null }).select("id,name,primary_muscle_group,equipment,image_url").single();
      if (error) throw error; const savedExercise = normalizeExercise(data, "custom"); setExerciseCatalog((current) => [...current, savedExercise]); addExercise(savedExercise);
    } catch { addExercise(localExercise); }
    finally { setCustomForm({ name: "", primary_muscle_group: customForm.primary_muscle_group, equipment: "", notes: "" }); setCustomOpen(false); }
  }

  async function saveWorkout(event) {
    event.preventDefault(); setMessage("");
    if (!profile?.id) return router.replace("/login");
    if (!sportId) return setMessage("Choose a sport.");
    if (!method) return setMessage("Choose Manual Builder or Workout Wizard.");
    if (isStrength && !selectedMuscles.length) return setMessage("Choose at least one muscle group.");
    if (!isStrength && !selectedStructure) return setMessage("Choose a workout structure.");
    if (!selectedExercises.length) return setMessage("Choose at least one exercise.");
    if (!form.title.trim()) return setMessage("Add a workout title.");

    const normalizedExercises = selectedExercises.map((item, index) => ({ position: index, source: item.exercise.source, id: item.exercise.id, name: item.exercise.name, primary_muscle_group: item.exercise.primary_muscle_group, equipment: item.exercise.equipment || null, notes: item.notes || null, sets: item.sets.map((set, setIndex) => ({ set_number: setIndex + 1, reps: cleanNumber(set.reps), weight_kg: cleanNumber(set.weight_kg), rest_seconds: cleanNumber(set.rest_seconds) })) }));
    try {
      setSaving(true);
      const { data: workout, error: workoutError } = await supabase.from("workouts").insert({ creator_id: profile.id, sport_id: sportId, title: form.title.trim(), description: form.description.trim(), workout_type: selectedStructure || (method === "wizard" ? "wizard" : "strength"), level: form.level, duration_min: cleanNumber(form.duration_min), visibility: form.visibility, structure: { builder_version: 5, sport_id: sportId, sport_label: sport?.label, method, format: selectedStructure || null, muscle_groups: selectedMuscles, exercises: normalizedExercises } }).select("id").single();
      if (workoutError) throw workoutError;
      try {
        for (const item of normalizedExercises) {
          const { data: workoutExercise, error: exerciseError } = await supabase.from("workout_exercises").insert({ workout_id: workout.id, position: item.position, exercise_source: item.source === "global" ? "global" : item.source === "custom" && !String(item.id).startsWith("custom-local") ? "custom" : "snapshot", strength_exercise_id: item.source === "global" ? item.id : null, user_strength_exercise_id: item.source === "custom" && !String(item.id).startsWith("custom-local") ? item.id : null, exercise_name_snapshot: item.name, primary_muscle_group_snapshot: item.primary_muscle_group, equipment_snapshot: item.equipment, notes: item.notes }).select("id").single();
          if (exerciseError) throw exerciseError;
          const setRows = item.sets.map((set) => ({ workout_exercise_id: workoutExercise.id, set_number: set.set_number, reps: set.reps, weight_kg: set.weight_kg, rest_seconds: set.rest_seconds }));
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

        <nav className="workout-builder-stepbar workout-builder-stepbar-five" aria-label="Workout builder steps">
          {stepLabels.map((label, index) => { const number = index + 1; const active = stepIndex === number; const done = stepIndex > number; return <button key={`${number}-${label}`} type="button" className={`builder-step ${active ? "active" : ""} ${done ? "done" : ""}`} onClick={() => { if (number === 1) setStep("sport"); if (number === 2 && sportId) setStep("method"); if (number === 3 && method) setStep("structure"); if (number === 4 && (selectedMuscles.length || selectedStructure)) setStep("exercises"); if (number === 5 && selectedExercises.length) setStep("finish"); }}><b>{done ? "✓" : number}</b>{label}</button>; })}
        </nav>

        {message ? <section className="workout-builder-message">{message}</section> : null}
        {checking ? <section className="workout-builder-card">Checking profile...</section> : (
          <form onSubmit={saveWorkout} className="workout-builder-form">
            {step === "sport" && <section className="workout-builder-card workout-sport-step"><p className="builder-kicker">Step 1</p><h2>Choose sport</h2><div className="workout-sport-grid">{WORKOUT_SPORTS.map((item) => <button key={item.id} type="button" className="workout-sport-card" style={{ "--workout-sport-image": `url(${item.image})` }} onClick={() => chooseSport(item.id)}><span><b>{item.label}</b><small>{item.description}</small></span></button>)}</div></section>}

            {step === "method" && <section className="workout-builder-card"><p className="builder-kicker">Step 2</p><h2>How do you want to build?</h2><span className="builder-intro">{sport?.label}</span><button type="button" className="builder-choice-card" onClick={() => chooseMethod("manual")}><img src="/illustrations/workout-builder/manual.svg" alt="" /><span><b>Manual Builder</b><small>Choose the content yourself.</small></span></button><button type="button" className="builder-choice-card recommended" onClick={() => chooseMethod("wizard")}><img src="/illustrations/workout-builder/wizard.svg" alt="" /><span><b>Workout Wizard</b><small>Let Endurance create a first proposal.</small></span></button></section>}

            {step === "structure" && <section className="workout-builder-card"><p className="builder-kicker">Step 3</p><h2>{sport?.heading}</h2>{isStrength ? <><span className="builder-intro">Choose the muscle groups you want to train.</span><div className="muscle-picker-grid">{MUSCLE_GROUPS.map((group) => { const active = selectedMuscles.includes(group); return <button key={group} type="button" className={`muscle-picker-card ${active ? "selected" : ""}`} onClick={() => toggleMuscle(group)}><img src={muscleIcon(group)} alt="" /><span>{group}</span>{active ? <b>✓</b> : null}</button>; })}</div></> : <><span className="builder-intro">{sport?.description}</span><div className="workout-structure-grid">{sport?.structures.map((option) => <button key={option} type="button" className={`workout-structure-card ${selectedStructure === option ? "selected" : ""}`} onClick={() => setSelectedStructure(option)}><b>{option}</b><small>{sport.label} workout</small></button>)}</div></>}<div className="builder-actions"><button type="button" className="builder-secondary" onClick={() => setStep("method")}>Back</button><button type="button" className="builder-primary" onClick={continueFromStructure}>Continue</button></div></section>}

            {step === "exercises" && <section className="workout-builder-card"><p className="builder-kicker">Step 4</p><h2>Choose exercises</h2><span className="builder-intro">{isStrength ? selectedMuscleSummary : selectedStructure}</span><div className="builder-two-fields"><label>Workout name<input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} placeholder={`${firstName(profile)} ${sport?.label || "Workout"}`} /></label><label>Duration<input type="number" value={form.duration_min} onChange={(e) => setForm((current) => ({ ...current, duration_min: e.target.value }))} placeholder="60" /></label></div><div className="exercise-group-block">{visibleExercises.map((exercise) => { const active = selectedExercises.some((item) => exerciseKey(item.exercise) === exerciseKey(exercise)); return <button key={exerciseKey(exercise)} type="button" className={`exercise-select-row ${active ? "selected" : ""}`} onClick={() => toggleExercise(exercise)}><img src={muscleIcon(exercise.primary_muscle_group)} alt="" /><span><b>{exercise.name}</b><small>{exercise.equipment || exercise.primary_muscle_group || "Equipment optional"}</small></span><i>{active ? "✓" : "+"}</i></button>; })}</div><button type="button" className="builder-dashed" onClick={() => setCustomOpen((value) => !value)}>+ Add custom exercise</button>{customOpen ? <div className="custom-exercise-box"><label>Exercise name<input value={customForm.name} onChange={(e) => setCustomForm((current) => ({ ...current, name: e.target.value }))} /></label><label>Muscle group<select value={customForm.primary_muscle_group} onChange={(e) => setCustomForm((current) => ({ ...current, primary_muscle_group: e.target.value }))}>{MUSCLE_GROUPS.map((group) => <option key={group}>{group}</option>)}</select></label><label>Equipment<select value={customForm.equipment} onChange={(e) => setCustomForm((current) => ({ ...current, equipment: e.target.value }))}><option value="">Choose equipment</option>{EQUIPMENT_OPTIONS.map((equipment) => <option key={equipment}>{equipment}</option>)}</select></label><button type="button" className="builder-primary full" onClick={addCustomExercise}>Add exercise</button></div> : null}<div className="builder-actions"><button type="button" className="builder-secondary" onClick={() => setStep("structure")}>Back</button><button type="button" className="builder-primary" onClick={continueFromExercises}>Continue</button></div></section>}

            {step === "finish" && <section className="workout-builder-card"><p className="builder-kicker">Step 5</p><h2>Finish {sport?.label}</h2><span className="builder-intro">{selectedExercises.length} exercises • {selectedSetCount} sets</span><div className="builder-finish-fields"><label>Description<textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></label><label>Visibility<select value={form.visibility} onChange={(e) => setForm((current) => ({ ...current, visibility: e.target.value }))}><option value="team">Team</option><option value="private">Private</option><option value="public">Public</option></select></label><label>Level<select value={form.level} onChange={(e) => setForm((current) => ({ ...current, level: e.target.value }))}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label></div><div className="selected-exercise-stack">{selectedExercises.map((item) => <article key={item.id} className="selected-exercise-card"><header><span><b>{item.exercise.name}</b><small>{item.exercise.primary_muscle_group} • {summarizeSets(item.sets)}</small></span><button type="button" onClick={() => removeExercise(item.id)}>Remove</button></header><div className="sets-table">{item.sets.map((set) => <div key={set.id} className="set-row"><span>Set {set.set_number}</span><input value={set.reps} onChange={(e) => updateSet(item.id, set.id, "reps", e.target.value)} placeholder="Reps" /><input value={set.weight_kg} onChange={(e) => updateSet(item.id, set.id, "weight_kg", e.target.value)} placeholder="kg" /><input value={set.rest_seconds} onChange={(e) => updateSet(item.id, set.id, "rest_seconds", e.target.value)} placeholder="Rest" /><button type="button" onClick={() => removeSet(item.id, set.id)}>−</button></div>)}</div><button type="button" className="builder-dashed small" onClick={() => addSet(item.id)}>+ Add set</button></article>)}</div><div className="builder-actions"><button type="button" className="builder-secondary" onClick={() => setStep("exercises")}>Back</button><button type="submit" className="builder-primary" disabled={saving}>{saving ? "Saving..." : "Save workout"}</button></div></section>}
          </form>
        )}
      </section>
      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
