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
  ["Bench Press (Barbell)", "Chest", "Barbell"], ["Bench Press (Dumbbell)", "Chest", "Dumbbell"], ["Incline Bench Press (Dumbbell)", "Chest", "Dumbbell"], ["Cable Crossover", "Chest", "Cable"], ["Push Up", "Chest", "Bodyweight"],
  ["Pull Up", "Back", "Bodyweight"], ["Lat Pulldown (Cable)", "Back", "Cable"], ["Seated Row (Cable)", "Back", "Cable"], ["Bent Over Row (Barbell)", "Back", "Barbell"], ["T Bar Row", "Back", "Machine"],
  ["Overhead Press (Barbell)", "Shoulders", "Barbell"], ["Overhead Press (Dumbbell)", "Shoulders", "Dumbbell"], ["Lateral Raise (Dumbbell)", "Shoulders", "Dumbbell"], ["Face Pull (Cable)", "Shoulders", "Cable"],
  ["Bicep Curl (Barbell)", "Biceps", "Barbell"], ["Bicep Curl (Dumbbell)", "Biceps", "Dumbbell"], ["Hammer Curl (Dumbbell)", "Biceps", "Dumbbell"], ["Preacher Curl (Barbell)", "Biceps", "Barbell"],
  ["Triceps Pushdown (Cable)", "Triceps", "Cable"], ["Skullcrusher (Barbell)", "Triceps", "Barbell"], ["Close Grip Bench Press (Barbell)", "Triceps", "Barbell"], ["Bench Dip", "Triceps", "Bodyweight"],
  ["Squat (Barbell)", "Legs", "Barbell"], ["Leg Press", "Legs", "Machine"], ["Leg Extension (Machine)", "Legs", "Machine"], ["Romanian Deadlift (Dumbbell)", "Legs", "Dumbbell"], ["Trap Bar Deadlift", "Legs", "Trap Bar"],
  ["Plank", "Core", "Bodyweight"], ["Cable Crunch", "Core", "Cable"], ["Hanging Leg Raise", "Core", "Bodyweight"], ["Ab Wheel", "Core", "Bodyweight"],
].map((item, index) => ({ id: `starter-${index}`, source: "snapshot", name: item[0], primary_muscle_group: item[1], equipment: item[2], image_url: "" }));

function makeId(prefix = "item") { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function cleanNumber(value) { if (value === "" || value === null || value === undefined) return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function firstName(profile) { return profile?.first_name || String(profile?.name || "").split(" ")[0] || "Maurice"; }
function normalizeExercise(row, source) { return { id: row.id, source, name: row.name, primary_muscle_group: row.primary_muscle_group, equipment: row.equipment || "", image_url: row.image_url || "" }; }
function defaultSets() { return [1,2,3].map((setNumber) => ({ id: makeId("set"), set_number: setNumber, reps: "10", weight_kg: "", rest_seconds: "90" })); }
function muscleIcon(group) {
  return `/illustrations/workout-builder/${String(group || "chest").toLowerCase()}.png`;
}
function exerciseKey(exercise) { return `${exercise.source}-${exercise.id}`; }
function summarizeSets(sets = []) { if (!sets.length) return "No sets"; const first = sets[0]; return `${sets.length} sets • ${first.reps || "?"} reps • ${first.weight_kg ? `${first.weight_kg} kg` : "open"}`; }

export default function NewWorkoutPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [step, setStep] = useState("method");
  const [method, setMethod] = useState("");
  const [selectedMuscles, setSelectedMuscles] = useState([]);
  const [exerciseCatalog, setExerciseCatalog] = useState(STARTER_EXERCISES);
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", primary_muscle_group: "Chest", equipment: "", notes: "" });
  const [form, setForm] = useState({ sport_id: "strength_training", title: "", description: "", visibility: "team", level: "intermediate", duration_min: "60", workout_type: "strength" });

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
      const [{ data: globalExercises }, { data: customExercises }, { count: notificationCount }, { count: inviteCount }] = await Promise.all([
        supabase.from("strength_exercises").select("id,name,primary_muscle_group,equipment,image_url,active").eq("active", true).order("primary_muscle_group").order("name"),
        supabase.from("user_strength_exercises").select("id,name,primary_muscle_group,equipment,image_url,active").eq("user_id", user.id).eq("active", true).order("primary_muscle_group").order("name"),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
      ]);
      const normalized = [...(Array.isArray(globalExercises) && globalExercises.length ? globalExercises.map((row) => normalizeExercise(row, "global")) : []), ...(Array.isArray(customExercises) ? customExercises.map((row) => normalizeExercise(row, "custom")) : [])];
      setExerciseCatalog(normalized.length ? normalized : STARTER_EXERCISES);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    } catch (error) {
      console.error(error); setExerciseCatalog(STARTER_EXERCISES); setMessage(error?.message || "Could not load workout builder.");
    } finally { setChecking(false); }
  }

  const groupedExercises = useMemo(() => {
    const result = {}; MUSCLE_GROUPS.forEach((group) => { result[group] = exerciseCatalog.filter((exercise) => exercise.primary_muscle_group === group); }); return result;
  }, [exerciseCatalog]);
  const selectedMuscleSummary = selectedMuscles.length ? selectedMuscles.join(", ") : "No muscle groups selected";
  const selectedSetCount = selectedExercises.reduce((sum, item) => sum + item.sets.length, 0);
  const stepIndex = step === "method" ? 1 : step === "muscles" ? 2 : step === "exercises" ? 3 : 4;

  function updateForm(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  function chooseMethod(nextMethod) {
    setMethod(nextMethod);
    setForm((current) => ({ ...current, title: current.title || `${firstName(profile)} Strength Training Workout`, description: current.description || (nextMethod === "wizard" ? "Generated first proposal. Adjust exercises, sets and weights before saving." : "") }));
    if (nextMethod === "wizard" && !selectedMuscles.length) setSelectedMuscles(["Chest", "Back", "Legs"]);
    setStep("muscles");
  }
  function toggleMuscle(group) { setSelectedMuscles((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group]); }
  function addExercise(exercise) { setSelectedExercises((current) => current.some((item) => exerciseKey(item.exercise) === exerciseKey(exercise)) ? current : [...current, { id: makeId("selected"), exercise, notes: "", sets: defaultSets() }]); }
  function removeExercise(localId) { setSelectedExercises((current) => current.filter((item) => item.id !== localId)); }
  function toggleExercise(exercise) { const existing = selectedExercises.find((item) => exerciseKey(item.exercise) === exerciseKey(exercise)); if (existing) removeExercise(existing.id); else addExercise(exercise); }
  function updateSet(exerciseId, setId, key, value) { setSelectedExercises((current) => current.map((item) => item.id === exerciseId ? { ...item, sets: item.sets.map((set) => set.id === setId ? { ...set, [key]: value } : set) } : item)); }
  function addSet(exerciseId) { setSelectedExercises((current) => current.map((item) => { if (item.id !== exerciseId) return item; const last = item.sets[item.sets.length - 1] || defaultSets()[0]; return { ...item, sets: [...item.sets, { id: makeId("set"), set_number: item.sets.length + 1, reps: last.reps || "10", weight_kg: last.weight_kg || "", rest_seconds: last.rest_seconds || "90" }] }; })); }
  function removeSet(exerciseId, setId) { setSelectedExercises((current) => current.map((item) => item.id !== exerciseId || item.sets.length <= 1 ? item : { ...item, sets: item.sets.filter((set) => set.id !== setId).map((set, index) => ({ ...set, set_number: index + 1 })) })); }
  function generateWizardProposal() { const groups = selectedMuscles.length ? selectedMuscles : ["Chest", "Back", "Legs"]; const maxExercises = Number(form.duration_min) <= 45 ? 5 : Number(form.duration_min) <= 60 ? 7 : 9; const perGroup = Math.max(1, Math.ceil(maxExercises / groups.length)); const proposal = []; groups.forEach((group) => groupedExercises[group]?.slice(0, perGroup).forEach((exercise) => { if (!proposal.some((item) => exerciseKey(item) === exerciseKey(exercise))) proposal.push(exercise); })); setSelectedExercises(proposal.slice(0, maxExercises).map((exercise) => ({ id: makeId("selected"), exercise, notes: "", sets: defaultSets() }))); setStep("exercises"); }

  async function addCustomExercise() {
    const name = customForm.name.trim(); if (!name) return setMessage("Add a custom exercise name."); if (!profile?.id) return;
    const localExercise = { id: makeId("custom-local"), source: "custom", name, primary_muscle_group: customForm.primary_muscle_group, equipment: customForm.equipment.trim(), image_url: "" };
    try {
      const { data, error } = await supabase.from("user_strength_exercises").insert({ user_id: profile.id, name, primary_muscle_group: customForm.primary_muscle_group, equipment: customForm.equipment.trim() || null, notes: customForm.notes.trim() || null }).select("id,name,primary_muscle_group,equipment,image_url").single();
      if (error) throw error; const savedExercise = normalizeExercise(data, "custom"); setExerciseCatalog((current) => [...current, savedExercise]); addExercise(savedExercise);
    } catch { addExercise(localExercise); }
    finally { setCustomForm({ name: "", primary_muscle_group: customForm.primary_muscle_group, equipment: "", notes: "" }); setCustomOpen(false); }
  }

  function continueFromMuscles() { if (!selectedMuscles.length) return setMessage("Choose at least one muscle group."); setMessage(""); if (method === "wizard") generateWizardProposal(); else setStep("exercises"); }
  function continueFromExercises() { if (!selectedExercises.length) return setMessage("Choose at least one exercise."); setMessage(""); setStep("finish"); }

  async function saveWorkout(event) {
    event.preventDefault(); setMessage("");
    if (!profile?.id) return router.replace("/login");
    if (!method) return setMessage("Choose Manual Builder or Workout Wizard.");
    if (!selectedMuscles.length) return setMessage("Choose at least one muscle group.");
    if (!selectedExercises.length) return setMessage("Choose at least one exercise.");
    if (!form.title.trim()) return setMessage("Add a workout title.");
    const normalizedExercises = selectedExercises.map((item, index) => ({ position: index, source: item.exercise.source, id: item.exercise.id, name: item.exercise.name, primary_muscle_group: item.exercise.primary_muscle_group, equipment: item.exercise.equipment || null, notes: item.notes || null, sets: item.sets.map((set, setIndex) => ({ set_number: setIndex + 1, reps: cleanNumber(set.reps), weight_kg: cleanNumber(set.weight_kg), rest_seconds: cleanNumber(set.rest_seconds) })) }));
    try {
      setSaving(true);
      const { data: workout, error: workoutError } = await supabase.from("workouts").insert({ creator_id: profile.id, sport_id: "strength_training", title: form.title.trim(), description: form.description.trim(), workout_type: method === "wizard" ? "wizard" : "strength", level: form.level, duration_min: cleanNumber(form.duration_min), visibility: form.visibility, structure: { builder_version: 4, method, muscle_groups: selectedMuscles, exercises: normalizedExercises } }).select("id").single();
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
    } catch (error) { console.error(error); setMessage(error?.message || "Could not save workout."); } finally { setSaving(false); }
  }

  return (
    <main className="workout-builder-page">
      <section className="workout-builder-shell">
        <AppHeader profile={profile} compact />
        <div className="workout-builder-top-actions"><Link href="/workouts" className="workout-builder-back">← Back</Link><Link href="/workouts" className="workout-builder-close" aria-label="Close">×</Link></div>
        <header className="workout-builder-header"><p>Workout Builder</p><h1>Create your strength workout</h1><span>Choose how you want to build. Then select muscle groups, exercises and set details.</span></header>
        <nav className="workout-builder-stepbar" aria-label="Workout builder steps">{["Method","Muscle Groups","Exercises","Finish"].map((label, index) => { const number=index+1; const active=stepIndex===number; const done=stepIndex>number; return <button key={label} type="button" className={`builder-step ${active ? "active" : ""} ${done ? "done" : ""}`} onClick={() => { if(number===1)setStep("method"); if(number===2&&method)setStep("muscles"); if(number===3&&selectedMuscles.length)setStep("exercises"); if(number===4&&selectedExercises.length)setStep("finish"); }}><b>{done ? "✓" : number}</b>{label}</button>; })}</nav>
        {message ? <section className="workout-builder-message">{message}</section> : null}
        {checking ? <section className="workout-builder-card">Checking profile...</section> : (
          <form onSubmit={saveWorkout} className="workout-builder-form">
            {step === "method" && <section className="workout-builder-card"><p className="builder-kicker">Step 1</p><h2>How do you want to build?</h2><span className="builder-intro">Choose between full manual control or a smart first proposal.</span><button type="button" className="builder-choice-card" onClick={() => chooseMethod("manual")}><img src="/illustrations/workout-builder/manual.svg" alt="" /><span><b>Manual Builder</b><small>Choose exercises yourself.</small></span><i>→</i></button><button type="button" className="builder-choice-card recommended" onClick={() => chooseMethod("wizard")}><img src="/illustrations/workout-builder/wizard.svg" alt="" /><span><b>Workout Wizard <em>Recommended</em></b><small>Let Endurance create a first proposal.</small></span><i>→</i></button></section>}
            {step === "muscles" && <section className="workout-builder-card"><p className="builder-kicker">Step 2</p><h2>Select muscle groups</h2><span className="builder-intro">Choose the muscle groups you want to train in this workout.</span><div className="muscle-picker-grid">{MUSCLE_GROUPS.map((group) => { const active=selectedMuscles.includes(group); return <button key={group} type="button" className={`muscle-picker-card ${active ? "selected" : ""}`} onClick={() => toggleMuscle(group)}><img src={muscleIcon(group)} alt="" /><span>{group}</span>{active ? <b>✓</b> : null}</button>; })}</div><button type="button" className="builder-primary full" onClick={continueFromMuscles}>Continue <span>→</span></button><button type="button" className="wizard-help-card" onClick={() => chooseMethod("wizard")}><img src="/illustrations/workout-builder/wizard.svg" alt="" /><span>Need help? Let the <b>Workout Wizard</b> suggest muscle groups and exercises.</span><i>›</i></button></section>}
            {step === "exercises" && <section className="workout-builder-card"><p className="builder-kicker">Step 3</p><h2>Choose exercises</h2><span className="builder-intro">{selectedMuscleSummary}</span><div className="builder-two-fields"><label>Workout name<input value={form.title} onChange={(e)=>updateForm("title",e.target.value)} placeholder="Maurice Strength Training Workout" /></label><label>Duration<input type="number" value={form.duration_min} onChange={(e)=>updateForm("duration_min",e.target.value)} placeholder="60" /></label></div>{MUSCLE_GROUPS.filter((group)=>selectedMuscles.includes(group)).map((group)=><div key={group} className="exercise-group-block"><h3>{group}</h3>{(groupedExercises[group]||[]).slice(0,12).map((exercise)=>{const active=selectedExercises.some((item)=>exerciseKey(item.exercise)===exerciseKey(exercise)); return <button key={exerciseKey(exercise)} type="button" className={`exercise-select-row ${active ? "selected" : ""}`} onClick={()=>toggleExercise(exercise)}><img src={muscleIcon(exercise.primary_muscle_group)} alt="" /><span><b>{exercise.name}</b><small>{exercise.equipment || "Equipment optional"}</small></span><i>{active ? "✓" : "+"}</i></button>;})}</div>)}<button type="button" className="builder-dashed" onClick={()=>setCustomOpen((v)=>!v)}>+ Add custom exercise</button>{customOpen ? <div className="custom-exercise-box"><label>Exercise name<input value={customForm.name} onChange={(e)=>setCustomForm((c)=>({...c,name:e.target.value}))} placeholder="Exercise name" /></label><label>Muscle group<select value={customForm.primary_muscle_group} onChange={(e)=>setCustomForm((c)=>({...c,primary_muscle_group:e.target.value}))}>{MUSCLE_GROUPS.map((group)=><option key={group}>{group}</option>)}</select></label><label>Equipment<select value={customForm.equipment} onChange={(e)=>setCustomForm((c)=>({...c,equipment:e.target.value}))}><option value="">Choose equipment</option>{EQUIPMENT_OPTIONS.map((eq)=><option key={eq}>{eq}</option>)}</select></label><button type="button" className="builder-primary full" onClick={addCustomExercise}>Add exercise</button></div> : null}<div className="builder-actions"><button type="button" className="builder-secondary" onClick={()=>setStep("muscles")}>Back</button><button type="button" className="builder-primary" onClick={continueFromExercises}>Continue →</button></div></section>}
            {step === "finish" && <section className="workout-builder-card"><p className="builder-kicker">Step 4</p><h2>Set details</h2><span className="builder-intro">{selectedExercises.length} exercises • {selectedSetCount} sets • {selectedMuscleSummary}</span><div className="builder-finish-fields"><label>Description<textarea value={form.description} onChange={(e)=>updateForm("description",e.target.value)} placeholder="Optional. Add coaching notes or focus points." /></label><label>Visibility<select value={form.visibility} onChange={(e)=>updateForm("visibility",e.target.value)}><option value="team">Team</option><option value="private">Private</option><option value="public">Public</option></select></label><label>Level<select value={form.level} onChange={(e)=>updateForm("level",e.target.value)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label></div><div className="selected-exercise-stack">{selectedExercises.map((item)=><article key={item.id} className="selected-exercise-card"><header><span><b>{item.exercise.name}</b><small>{item.exercise.primary_muscle_group} • {summarizeSets(item.sets)}</small></span><button type="button" onClick={()=>removeExercise(item.id)}>Remove</button></header><div className="sets-table">{item.sets.map((set)=><div key={set.id} className="set-row"><span>Set {set.set_number}</span><input value={set.reps} onChange={(e)=>updateSet(item.id,set.id,"reps",e.target.value)} placeholder="Reps" /><input value={set.weight_kg} onChange={(e)=>updateSet(item.id,set.id,"weight_kg",e.target.value)} placeholder="kg" /><input value={set.rest_seconds} onChange={(e)=>updateSet(item.id,set.id,"rest_seconds",e.target.value)} placeholder="Rest" /><button type="button" onClick={()=>removeSet(item.id,set.id)}>−</button></div>)}</div><button type="button" className="builder-dashed small" onClick={()=>addSet(item.id)}>+ Add set</button></article>)}</div><div className="builder-actions"><button type="button" className="builder-secondary" onClick={()=>setStep("exercises")}>Back</button><button type="submit" className="builder-primary" disabled={saving}>{saving ? "Saving..." : "Save workout ✓"}</button></div></section>}
          </form>
        )}
      </section>
      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
