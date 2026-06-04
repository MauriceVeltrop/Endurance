"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  image_url: "",
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

function cleanNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatLoad(value) {
  if (value === "" || value === null || value === undefined) return "open";
  return `${value}kg`;
}

function setSummary(item) {
  const sets = item.sets || [];
  if (!sets.length) return "No sets";

  const groups = [];
  sets.forEach((set) => {
    const reps = set.reps || "?";
    const load = formatLoad(set.weight_kg);
    const key = `${reps} @ ${load}`;
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.count += 1;
    else groups.push({ key, count: 1 });
  });

  return groups.map((group) => `${group.count}x ${group.key}`).join(" · ");
}

export default function NewWorkoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [allowedSportIds, setAllowedSportIds] = useState([]);
  const [globalExercises, setGlobalExercises] = useState([]);
  const [customExercises, setCustomExercises] = useState([]);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState("sport");
  const [method, setMethod] = useState("");
  const [mode, setMode] = useState("plan");
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("Chest");
  const [selectedEquipment, setSelectedEquipment] = useState("");
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState("muscles");
  const [wizardMuscleGroups, setWizardMuscleGroups] = useState(["Chest"]);
  const [wizardGoal, setWizardGoal] = useState("hypertrophy");
  const [wizardDuration, setWizardDuration] = useState("60");
  const [wizardEquipment, setWizardEquipment] = useState([]);
  const [customForm, setCustomForm] = useState({ name: "", primary_muscle_group: "Chest", equipment: "", notes: "" });
  const [detailsOpen, setDetailsOpen] = useState(false);
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

      const workoutAccessSports = allowed.filter((id) => workoutSportIds.includes(id));
      const requestedSport = searchParams.get("sport");
      const requestedMode = searchParams.get("mode");
      const firstWorkoutSport = workoutAccessSports.includes(requestedSport) ? requestedSport : workoutAccessSports[0];

      if (firstWorkoutSport) {
        setForm((current) => ({
          ...current,
          sport_id: firstWorkoutSport,
          title: current.title || `${firstName(profileRow)} ${getSportLabel(firstWorkoutSport)} Workout`,
        }));
      }

      if (requestedMode === "wizard") {
        setMethod("wizard");
        setWizardStep("muscles");
        setStep("wizard");
      } else if (workoutAccessSports.length === 1) {
        setStep("method");
      } else {
        setStep("sport");
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
      const key = `${exercise.source}-${exercise.id}`;
      if (!map.has(key)) map.set(key, exercise);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [globalExercises, customExercises]);

  const filteredExercises = useMemo(() => {
    const search = query.trim().toLowerCase();
    return exerciseCatalog.filter((exercise) => {
      const groupOk = !selectedGroup || exercise.primary_muscle_group === selectedGroup;
      const equipmentOk = !selectedEquipment || exercise.equipment === selectedEquipment;
      const searchOk = !search || exercise.name.toLowerCase().includes(search);
      return groupOk && equipmentOk && searchOk;
    });
  }, [exerciseCatalog, query, selectedGroup, selectedEquipment]);

  function updateForm(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "sport_id" && (!current.title || current.title.includes("Workout"))) {
        next.title = `${firstName(profile)} ${getSportLabel(value)} Workout`;
      }
      return next;
    });
  }

  const hasWorkoutSports = availableWorkoutSports.length > 0;
  const hasMultipleWorkoutSports = availableWorkoutSports.length > 1;
  const builderSteps = hasMultipleWorkoutSports ? ["Sport", "Method", "Build"] : ["Method", "Build"];

  useEffect(() => {
    if (checking) return;
    if (availableWorkoutSports.length === 1) {
      const onlySport = availableWorkoutSports[0];
      setForm((current) => ({
        ...current,
        sport_id: current.sport_id || onlySport,
        title: current.title || `${firstName(profile)} ${getSportLabel(onlySport)} Workout`,
      }));
      if (step === "sport") setStep("method");
    }
  }, [checking, availableWorkoutSports, profile, step]);

  function addExercise(exercise) {
    const alreadyAdded = selectedExercises.some((item) => item.exercise.source === exercise.source && item.exercise.id === exercise.id);
    if (alreadyAdded) {
      setMode("plan");
      return;
    }
    const localItem = {
      id: makeLocalId("exercise"),
      exercise,
      position: selectedExercises.length,
      notes: "",
      sets: defaultSets(),
    };
    setSelectedExercises((current) => [...current, localItem]);
    setEditingId(localItem.id);
    setMode("plan");
  }

  function removeExercise(localId) {
    setSelectedExercises((current) => current.filter((item) => item.id !== localId).map((item, index) => ({ ...item, position: index })));
    if (editingId === localId) setEditingId(null);
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

  function moveExerciseTo(dragId, targetId) {
    if (!dragId || !targetId || dragId === targetId) return;
    setSelectedExercises((current) => {
      const fromIndex = current.findIndex((item) => item.id === dragId);
      const toIndex = current.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const copy = [...current];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy.map((item, nextIndex) => ({ ...item, position: nextIndex }));
    });
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
        if (item.id !== exerciseId || item.sets.length <= 1) return item;
        return {
          ...item,
          sets: item.sets.filter((set) => set.id !== setId).map((set, index) => ({ ...set, set_number: index + 1 })),
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
    }
  }


  function toggleWizardMuscleGroup(group) {
    setWizardMuscleGroups((current) =>
      current.includes(group)
        ? current.filter((item) => item !== group)
        : [...current, group]
    );
  }

  function toggleWizardEquipment(equipment) {
    setWizardEquipment((current) =>
      current.includes(equipment)
        ? current.filter((item) => item !== equipment)
        : [...current, equipment]
    );
  }

  function getWizardPrescription(group, index) {
    const goal = wizardGoal;
    if (goal === "strength") {
      return {
        reps: index === 0 ? "5" : "6",
        weight_kg: "",
        rest_seconds: "150",
      };
    }
    if (goal === "endurance") {
      return {
        reps: "15",
        weight_kg: "",
        rest_seconds: "45",
      };
    }
    if (goal === "general") {
      return {
        reps: "12",
        weight_kg: "",
        rest_seconds: "75",
      };
    }
    return {
      reps: index === 0 ? "8" : "10",
      weight_kg: "",
      rest_seconds: "90",
    };
  }

  function makeWizardSets(group, exerciseIndex) {
    const prescription = getWizardPrescription(group, exerciseIndex);
    const setTotal = wizardGoal === "strength" ? 4 : 3;
    return Array.from({ length: setTotal }).map((_, index) => ({
      id: makeLocalId("set"),
      set_number: index + 1,
      reps: prescription.reps,
      weight_kg: prescription.weight_kg,
      rest_seconds: prescription.rest_seconds,
    }));
  }

  function generateWizardWorkout() {
    const groups = wizardMuscleGroups.length ? wizardMuscleGroups : ["Chest"];
    const duration = Number(wizardDuration || 60);
    const maxExercises = duration <= 30 ? 4 : duration <= 45 ? 5 : duration <= 60 ? 7 : duration <= 75 ? 8 : 10;
    const perGroupTarget = Math.max(1, Math.ceil(maxExercises / groups.length));
    const selectedEquipment = wizardEquipment.length ? wizardEquipment : equipmentOptions;

    const suggestions = [];

    groups.forEach((group) => {
      const candidates = exerciseCatalog.filter((exercise) => {
        const groupOk = exercise.primary_muscle_group === group;
        const equipmentOk = !exercise.equipment || selectedEquipment.includes(exercise.equipment);
        return groupOk && equipmentOk;
      });

      suggestions.push(...candidates.slice(0, perGroupTarget));
    });

    const deduped = [];
    suggestions.forEach((exercise) => {
      if (!deduped.some((item) => item.source === exercise.source && item.id === exercise.id)) {
        deduped.push(exercise);
      }
    });

    setSelectedExercises(
      deduped.slice(0, maxExercises).map((exercise, index) => ({
        id: makeLocalId("exercise"),
        exercise,
        position: index,
        notes: "",
        sets: makeWizardSets(exercise.primary_muscle_group, index),
      }))
    );

    setMethod("wizard");
    setMode("plan");
    setStep("build");
  }

  function replaceExercise(localExerciseId) {
    setSelectedExercises((currentList) => {
      const currentItem = currentList.find((item) => item.id === localExerciseId);
      if (!currentItem?.exercise) return currentList;

      const selectedEquipment = wizardEquipment.length ? wizardEquipment : equipmentOptions;
      const alternatives = exerciseCatalog.filter((exercise) => {
        const sameGroup = exercise.primary_muscle_group === currentItem.exercise.primary_muscle_group;
        const notSame = `${exercise.source}-${exercise.id}` !== `${currentItem.exercise.source}-${currentItem.exercise.id}`;
        const notAlreadySelected = !currentList.some(
          (selected) => `${selected.exercise.source}-${selected.exercise.id}` === `${exercise.source}-${exercise.id}`
        );
        const equipmentOk = !exercise.equipment || selectedEquipment.includes(exercise.equipment);
        return sameGroup && notSame && notAlreadySelected && equipmentOk;
      });

      if (!alternatives.length) return currentList;

      const replacement = alternatives[0];

      return currentList.map((item) =>
        item.id === localExerciseId
          ? {
              ...item,
              exercise: replacement,
              notes: item.notes || "",
            }
          : item
      );
    });
  }

  function runWizard() {
    setMethod("wizard");
    setWizardStep("muscles");
    setStep("wizard");
  }

  function startManual() {
    setMethod("manual");
    setMode("plan");
    setStep("build");
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
            muscle_groups: Array.from(new Set(selectedExercises.map((item) => item.exercise.primary_muscle_group))),
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

      const returnTo = searchParams.get("returnTo");

      if (returnTo) {
        const params = new URLSearchParams({
          workout_id: workout.id,
          step: searchParams.get("step") || "workout",
        });

        router.push(`${returnTo}?${params.toString()}`);
      } else {
        router.push("/workouts");
      }
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Could not save workout.");
    } finally {
      setSaving(false);
    }
  }

  const stepIndex = hasMultipleWorkoutSports ? (step === "sport" ? 1 : step === "method" || step === "wizard" ? 2 : 3) : (step === "build" ? 2 : 1);

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />
        <Link href="/workouts" style={styles.backLink}>← Back to workouts</Link>

        <header style={styles.header}>
          <div style={styles.kicker}>Workout Builder</div>
          <h1 style={styles.title}>Build your workout.</h1>
          <p style={styles.subtitle}>Compact, mobile-first and focused on the workout you are creating.</p>
        </header>

        <section style={styles.stepBar}>
          {builderSteps.map((label, index) => (
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
            {!hasWorkoutSports ? (
              <section style={styles.card}>
                <div style={styles.cardKicker}>Preferred Sports</div>
                <h2 style={styles.cardTitle}>No workout sports selected</h2>
                <p style={styles.mutedText}>Add Strength Training, HYROX, CrossFit or Bootcamp to your preferred sports to create workouts.</p>
                <Link href="/profile" style={styles.submitButton}>Manage preferred sports</Link>
              </section>
            ) : null}

            {step === "sport" && hasMultipleWorkoutSports ? (
              <section style={styles.card}>
                <div style={styles.cardKicker}>Step 1</div>
                <h2 style={styles.cardTitle}>Choose sport</h2>
                <div style={styles.sportGrid}>
                  {availableWorkoutSports.map((id) => {
                    const active = form.sport_id === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => { updateForm("sport_id", id); setStep("method"); }}
                        style={{ ...styles.choiceButton, ...(active ? styles.choiceButtonActive : {}) }}
                      >
                        <strong>{getSportLabel(id)}</strong>
                        <span>Preferred sport</span>
                      </button>
                    );
                  })}
                </div>
                
              </section>
            ) : null}

            {hasWorkoutSports && step === "method" ? (
              <section style={styles.card}>
                <div style={styles.cardHead}>
                  <div>
                    <div style={styles.cardKicker}>Step {hasMultipleWorkoutSports ? "2" : "1"}</div>
                    <h2 style={styles.cardTitle}>How do you want to build?</h2>
                  </div>
                  {hasMultipleWorkoutSports ? <button type="button" onClick={() => setStep("sport")} style={styles.smallButton}>Back</button> : null}
                </div>
                <button type="button" onClick={startManual} style={styles.methodCard}>
                  <span style={styles.methodIcon}>✍️</span>
                  <span><strong>Manual builder</strong><small>Choose exercises yourself.</small></span>
                </button>
                <button type="button" onClick={runWizard} style={styles.methodCard}>
                  <span style={styles.methodIcon}>⚡</span>
                  <span><strong>Workout Wizard</strong><small>Let Endurance create a first proposal.</small></span>
                </button>
              </section>
            ) : null}

            {hasWorkoutSports && step === "wizard" ? (
              <section style={styles.card}>
                <div style={styles.cardHead}>
                  <div>
                    <div style={styles.cardKicker}>Wizard</div>
                    <h2 style={styles.cardTitle}>
                      {wizardStep === "muscles" ? "Choose muscle groups" : wizardStep === "goal" ? "Choose goal" : wizardStep === "duration" ? "Choose duration" : "Choose equipment"}
                    </h2>
                  </div>
                  <button type="button" onClick={() => setStep("method")} style={styles.smallButton}>Back</button>
                </div>

                {wizardStep === "muscles" ? (
                  <>
                    <div style={styles.sportGrid}>
                      {muscleGroups.map((group) => {
                        const active = wizardMuscleGroups.includes(group);
                        return (
                          <button
                            key={group}
                            type="button"
                            onClick={() => toggleWizardMuscleGroup(group)}
                            style={{ ...styles.choiceButton, ...(active ? styles.choiceButtonActive : {}) }}
                          >
                            <strong>{group}</strong>
                            <span>{active ? "Selected" : "Tap to add"}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={!wizardMuscleGroups.length}
                      onClick={() => setWizardStep("goal")}
                      style={styles.submitButton}
                    >
                      Continue
                    </button>
                  </>
                ) : null}

                {wizardStep === "goal" ? (
                  <>
                    <div style={styles.sportGrid}>
                      {[
                        ["strength", "Strength", "Heavy sets, lower reps"],
                        ["hypertrophy", "Hypertrophy", "Muscle growth focus"],
                        ["endurance", "Endurance", "Higher reps, shorter rest"],
                        ["general", "General Fitness", "Balanced workout"],
                      ].map(([value, label, description]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setWizardGoal(value)}
                          style={{ ...styles.choiceButton, ...(wizardGoal === value ? styles.choiceButtonActive : {}) }}
                        >
                          <strong>{label}</strong>
                          <span>{description}</span>
                        </button>
                      ))}
                    </div>
                    <div style={styles.inlineActions}>
                      <button type="button" onClick={() => setWizardStep("muscles")} style={styles.smallButton}>Back</button>
                      <button type="button" onClick={() => setWizardStep("duration")} style={styles.submitButton}>Continue</button>
                    </div>
                  </>
                ) : null}

                {wizardStep === "duration" ? (
                  <>
                    <div style={styles.sportGrid}>
                      {["30", "45", "60", "75", "90"].map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          onClick={() => setWizardDuration(minutes)}
                          style={{ ...styles.choiceButton, ...(wizardDuration === minutes ? styles.choiceButtonActive : {}) }}
                        >
                          <strong>{minutes} min</strong>
                          <span>Estimated workout time</span>
                        </button>
                      ))}
                    </div>
                    <div style={styles.inlineActions}>
                      <button type="button" onClick={() => setWizardStep("goal")} style={styles.smallButton}>Back</button>
                      <button type="button" onClick={() => setWizardStep("equipment")} style={styles.submitButton}>Continue</button>
                    </div>
                  </>
                ) : null}

                {wizardStep === "equipment" ? (
                  <>
                    <div style={styles.sportGrid}>
                      {equipmentOptions.map((equipment) => {
                        const active = wizardEquipment.includes(equipment);
                        return (
                          <button
                            key={equipment}
                            type="button"
                            onClick={() => toggleWizardEquipment(equipment)}
                            style={{ ...styles.choiceButton, ...(active ? styles.choiceButtonActive : {}) }}
                          >
                            <strong>{equipment}</strong>
                            <span>{active ? "Selected" : "Available"}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p style={styles.mutedText}>Leave equipment empty to allow all available exercises.</p>
                    <div style={styles.inlineActions}>
                      <button type="button" onClick={() => setWizardStep("duration")} style={styles.smallButton}>Back</button>
                      <button type="button" onClick={generateWizardWorkout} style={styles.submitButton}>Generate workout</button>
                    </div>
                  </>
                ) : null}
              </section>
            ) : null}

            {hasWorkoutSports && step === "build" ? (
              <>
                <section style={styles.detailsCard}>
                  <button type="button" style={styles.detailsToggle} onClick={() => setDetailsOpen((value) => !value)}>
                    <span>
                      <b>{form.title || "Untitled workout"}</b>
                      <small>{getSportLabel(form.sport_id)} · {form.visibility}</small>
                    </span>
                    <strong>{detailsOpen ? "−" : "+"}</strong>
                  </button>
                  {detailsOpen ? (
                    <div style={styles.fieldsGrid}>
                      <label style={styles.fieldFull}><span>Title</span><input value={form.title} onChange={(event) => updateForm("title", event.target.value)} style={styles.input} /></label>
                      <label style={styles.field}><span>Level</span><select value={form.level} onChange={(event) => updateForm("level", event.target.value)} style={styles.input}><option value="beginner">Beginner</option><option value="all levels">All levels</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
                      <label style={styles.field}><span>Duration</span><input type="number" min="0" placeholder="min" value={form.duration_min} onChange={(event) => updateForm("duration_min", event.target.value)} style={styles.input} /></label>
                      <label style={styles.field}><span>Visibility</span><select value={form.visibility} onChange={(event) => updateForm("visibility", event.target.value)} style={styles.input}><option value="private">Private</option><option value="team">Team</option><option value="public">Public</option><option value="selected">Selected</option><option value="group">Group</option></select></label>
                      <label style={styles.field}><span>Type</span><input value={form.workout_type} onChange={(event) => updateForm("workout_type", event.target.value)} style={styles.input} /></label>
                      <label style={styles.fieldFull}><span>Description</span><textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} style={styles.textarea} /></label>
                    </div>
                  ) : null}
                </section>

                {mode === "plan" ? (
                  <section style={styles.card}>
                    <div style={styles.cardHead}>
                      <div>
                        <div style={styles.cardKicker}>My workout</div>
                        <h2 style={styles.cardTitle}>{selectedExercises.length} exercises</h2>
                      </div>
                      <button type="button" onClick={() => setMode("library")} style={styles.addButton}>+ Add</button>
                    </div>

                    {!selectedExercises.length ? (
                      <button type="button" onClick={() => setMode("library")} style={styles.emptyState}>
                        <strong>Start with your first exercise</strong>
                        <span>Choose a muscle group, pick an exercise and fill in sets, reps and load.</span>
                      </button>
                    ) : (
                      <div style={styles.selectedList}>
                        {selectedExercises.map((item, index) => {
                          const editing = editingId === item.id;
                          return (
                            <article
                              key={item.id}
                              draggable
                              onDragStart={() => setDraggingId(item.id)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => { moveExerciseTo(draggingId, item.id); setDraggingId(null); }}
                              onDragEnd={() => setDraggingId(null)}
                              style={{ ...styles.selectedExercise, ...(draggingId === item.id ? styles.selectedExerciseDragging : {}) }}
                            >
                              <button type="button" onClick={() => setEditingId(editing ? null : item.id)} style={styles.exerciseSummary}>
                                <span style={styles.orderBadge}>{index + 1}</span>
                                <span style={styles.selectedName}>
                                  <strong>{item.exercise.name}</strong>
                                  <small>{item.exercise.primary_muscle_group}{item.exercise.equipment ? ` · ${item.exercise.equipment}` : ""}</small>
                                  <em style={styles.compactSummary}>{setSummary(item)}</em>
                                </span>
                              </button>
                              {method === "wizard" && !editing ? (
                                <button type="button" onClick={() => replaceExercise(item.id)} style={styles.alternativeButton}>↻ Alternative</button>
                              ) : null}
                              {editing ? (
                                <div style={styles.editorBox}>
                                  <div style={styles.quickActions}>
                                    <span style={styles.dragHint}>Drag the card to reorder</span>
                                    <button type="button" onClick={() => moveExercise(item.id, -1)} style={styles.iconButton}>↑</button>
                                    <button type="button" onClick={() => moveExercise(item.id, 1)} style={styles.iconButton}>↓</button>
                                    {method === "wizard" ? (
                                      <button type="button" onClick={() => replaceExercise(item.id)} style={styles.iconButton}>↻ Alternative</button>
                                    ) : null}
                                    <button type="button" onClick={() => removeExercise(item.id)} style={styles.removeButton}>Remove</button>
                                  </div>
                                  <div style={styles.setHeader}><span>Set</span><span>Reps</span><span>Kg</span><span>Rest</span><span /></div>
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
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}
                    <div style={styles.flowActions}>
                      <button type="button" onClick={() => setMode("library")} style={styles.secondaryFlowButton}>+ Add exercise</button>
                      <button type="submit" disabled={saving || !selectedExercises.length} style={{ ...styles.submitButton, ...(!selectedExercises.length ? styles.submitButtonDisabled : {}) }}>
                        {saving ? "Saving..." : "Save workout"}
                      </button>
                    </div>
                  </section>
                ) : (
                  <section style={styles.card}>
                    <div style={styles.cardHead}>
                      <div>
                        <div style={styles.cardKicker}>Add exercise</div>
                        <h2 style={styles.cardTitle}>{selectedGroup}</h2>
                      </div>
                      <button type="button" onClick={() => setMode("plan")} style={styles.smallButton}>Done</button>
                    </div>

                    <div style={styles.groupGrid}>
                      {muscleGroups.map((group) => (
                        <button key={group} type="button" onClick={() => { setSelectedGroup(group); setSelectedEquipment(""); }} style={{ ...styles.groupButton, ...(selectedGroup === group ? styles.groupButtonActive : {}) }}>{group}</button>
                      ))}
                    </div>

                    <div style={styles.filterLine}>
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercise..." style={styles.searchInput} />
                      <button type="button" onClick={() => setCustomOpen((value) => !value)} style={styles.customButton}>+ Custom</button>
                    </div>

                    <div style={styles.equipmentRow}>
                      <button type="button" onClick={() => setSelectedEquipment("")} style={{ ...styles.equipmentChip, ...(!selectedEquipment ? styles.equipmentChipActive : {}) }}>All</button>
                      {equipmentOptions.map((equipment) => (
                        <button key={equipment} type="button" onClick={() => setSelectedEquipment(equipment)} style={{ ...styles.equipmentChip, ...(selectedEquipment === equipment ? styles.equipmentChipActive : {}) }}>{equipment}</button>
                      ))}
                    </div>

                    {customOpen ? (
                      <section style={styles.customBox}>
                        <input value={customForm.name} onChange={(event) => setCustomForm((current) => ({ ...current, name: event.target.value }))} placeholder="Exercise name" style={styles.input} />
                        <select value={customForm.primary_muscle_group} onChange={(event) => setCustomForm((current) => ({ ...current, primary_muscle_group: event.target.value }))} style={styles.input}>{muscleGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select>
                        <input value={customForm.equipment} onChange={(event) => setCustomForm((current) => ({ ...current, equipment: event.target.value }))} placeholder="Equipment optional" style={styles.input} />
                        <button type="button" onClick={addCustomExercise} style={styles.submitMini}>Add custom exercise</button>
                      </section>
                    ) : null}

                    <div style={styles.exerciseList}>
                      {filteredExercises.slice(0, 80).map((exercise) => (
                        <button key={`${exercise.source}-${exercise.id}`} type="button" onClick={() => addExercise(exercise)} style={styles.exercisePick}>
                          <span style={styles.exerciseAvatar}>{exercise.source === "custom" ? "★" : exercise.primary_muscle_group.slice(0, 1)}</span>
                          <span><strong>{exercise.name}</strong><small>{exercise.primary_muscle_group}{exercise.equipment ? ` · ${exercise.equipment}` : ""}</small></span>
                          <b>+</b>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

              </>
            ) : null}
          </form>
        )}
      </section>
      <BottomNav active="workouts" />
    </main>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";
const darkerGlass = "linear-gradient(145deg, rgba(10,16,20,0.96), rgba(6,8,10,0.90))";
const accent = "#e4ef16";

const styles = {
  page: { minHeight: "100vh", background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)", color: "white", padding: "16px 14px 118px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  shell: { width: "100%", maxWidth: 760, margin: "0 auto", display: "grid", gap: 14 },
  backLink: { width: "fit-content", color: accent, textDecoration: "none", fontWeight: 950, border: "1px solid rgba(228,239,22,0.24)", borderRadius: 999, padding: "10px 14px", background: "rgba(228,239,22,0.08)" },
  header: { display: "grid", gap: 8, marginTop: 4 },
  kicker: { color: accent, fontSize: 12, fontWeight: 950, letterSpacing: "0.16em", textTransform: "uppercase" },
  title: { margin: 0, fontSize: "clamp(38px, 10vw, 58px)", lineHeight: 0.96, letterSpacing: "-0.065em" },
  subtitle: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.45, fontWeight: 760 },
  stepBar: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))", gap: 8, marginTop: 2 },
  stepItem: { borderRadius: 999, padding: "10px 8px", border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.055)", color: "rgba(255,255,255,0.58)", fontWeight: 950, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13 },
  stepItemActive: { color: "#101406", background: accent, borderColor: accent },
  message: { borderRadius: 18, padding: 12, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.18)", color: accent, fontWeight: 850 },
  formShell: { display: "grid", gap: 14 },
  card: { borderRadius: 26, padding: 14, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gap: 12, boxShadow: "0 24px 80px rgba(0,0,0,0.34)", overflow: "hidden" },
  detailsCard: { borderRadius: 24, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", display: "grid", gap: 12 },
  detailsToggle: { border: 0, background: "transparent", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, textAlign: "left", padding: 4, cursor: "pointer" },
  cardHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" },
  cardKicker: { color: accent, fontSize: 11, fontWeight: 950, letterSpacing: "0.18em", textTransform: "uppercase" },
  cardTitle: { margin: "2px 0 0", fontSize: "clamp(26px, 7vw, 38px)", letterSpacing: "-0.06em", lineHeight: 1 },
  sportGrid: { display: "grid", gap: 10 },
  choiceButton: { border: "1px solid rgba(255,255,255,0.12)", background: darkerGlass, color: "white", borderRadius: 22, padding: 16, textAlign: "left", cursor: "pointer", display: "grid", gap: 5 },
  choiceButtonActive: { borderColor: "rgba(228,239,22,0.72)", background: "rgba(228,239,22,0.15)", color: accent },
  choiceButtonDisabled: { opacity: 0.38, cursor: "not-allowed" },
  methodCard: { border: "1px solid rgba(255,255,255,0.13)", background: darkerGlass, color: "white", borderRadius: 24, padding: 16, textAlign: "left", cursor: "pointer", display: "grid", gridTemplateColumns: "48px 1fr", gap: 12, alignItems: "center" },
  methodIcon: { width: 46, height: 46, borderRadius: 18, display: "grid", placeItems: "center", background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.20)", fontSize: 21 },
  fieldsGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 },
  field: { display: "grid", gap: 6, color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 12 },
  fieldFull: { gridColumn: "1 / -1", display: "grid", gap: 6, color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 12 },
  input: { width: "100%", minHeight: 46, borderRadius: 15, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.24)", color: "white", padding: "0 12px", boxSizing: "border-box", outline: "none", fontSize: 15 },
  textarea: { width: "100%", minHeight: 76, borderRadius: 15, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.24)", color: "white", padding: 12, boxSizing: "border-box", outline: "none", fontSize: 15, resize: "vertical" },
  groupGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  groupButton: { minHeight: 46, borderRadius: 18, border: "1px solid rgba(255,255,255,0.11)", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.76)", fontWeight: 950, cursor: "pointer" },
  groupButtonActive: { background: accent, color: "#101406", borderColor: accent },
  filterLine: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 },
  searchInput: { width: "100%", minHeight: 46, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.28)", color: "white", padding: "0 14px", boxSizing: "border-box", outline: "none", fontSize: 15 },
  customButton: { border: "1px solid rgba(228,239,22,0.28)", background: "rgba(228,239,22,0.12)", color: accent, borderRadius: 999, padding: "0 13px", fontWeight: 950, cursor: "pointer" },
  equipmentRow: { display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 },
  equipmentChip: { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.055)", color: "rgba(255,255,255,0.68)", borderRadius: 999, padding: "8px 11px", fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap", fontSize: 12 },
  equipmentChipActive: { background: accent, color: "#101406", borderColor: accent },
  customBox: { display: "grid", gap: 8, padding: 12, borderRadius: 20, background: "rgba(0,0,0,0.24)", border: "1px solid rgba(228,239,22,0.18)" },
  submitMini: { minHeight: 44, borderRadius: 999, border: 0, background: accent, color: "#101406", fontWeight: 950, cursor: "pointer" },
  exerciseList: { display: "grid", gap: 8 },
  exercisePick: { border: "1px solid rgba(255,255,255,0.09)", background: "rgba(0,0,0,0.22)", color: "white", borderRadius: 18, padding: 10, textAlign: "left", display: "grid", gridTemplateColumns: "38px minmax(0, 1fr) 38px", gap: 10, alignItems: "center", cursor: "pointer" },
  exerciseAvatar: { width: 36, height: 36, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.18)", color: accent, fontWeight: 950 },
  emptyState: { minHeight: 190, border: "1px dashed rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.18)", color: "white", borderRadius: 24, padding: 22, display: "grid", placeItems: "center", gap: 8, textAlign: "center", cursor: "pointer" },
  selectedList: { display: "grid", gap: 7 },
  selectedExercise: { borderRadius: 18, background: darkerGlass, border: "1px solid rgba(255,255,255,0.11)", padding: 9, display: "grid", gap: 8, cursor: "grab" },
  selectedExerciseDragging: { opacity: 0.45, transform: "scale(0.985)" },
  exerciseSummary: { border: 0, background: "transparent", color: "white", display: "grid", gridTemplateColumns: "34px minmax(0, 1fr)", gap: 9, alignItems: "center", textAlign: "left", padding: 0, cursor: "pointer" },
  orderBadge: { width: 32, height: 32, borderRadius: 12, display: "grid", placeItems: "center", background: accent, color: "#101406", fontWeight: 950, fontSize: 14 },
  selectedName: { display: "grid", gap: 1, minWidth: 0 },
  compactSummary: { color: accent, fontStyle: "normal", fontWeight: 950, fontSize: 16, letterSpacing: "-0.02em", marginTop: 2 },
  editorBox: { display: "grid", gap: 7, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 },
  quickActions: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  iconButton: { minWidth: 38, height: 36, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.08)", color: "white", fontWeight: 950, cursor: "pointer" },
  removeButton: { height: 36, borderRadius: 12, border: "1px solid rgba(255,90,90,0.26)", background: "rgba(255,60,60,0.14)", color: "#ff9b9b", fontWeight: 950, cursor: "pointer", padding: "0 12px" },
  setHeader: { display: "grid", gridTemplateColumns: "30px repeat(3, minmax(0, 1fr)) 28px", gap: 5, color: "rgba(255,255,255,0.46)", fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" },
  setRow: { display: "grid", gridTemplateColumns: "30px repeat(3, minmax(0, 1fr)) 28px", gap: 5, alignItems: "center" },
  setInput: { minWidth: 0, width: "100%", minHeight: 32, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.26)", color: "white", padding: "0 7px", boxSizing: "border-box", outline: "none", fontWeight: 850 },
  removeSet: { width: 30, height: 30, borderRadius: 10, border: 0, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", fontWeight: 950, cursor: "pointer" },
  addSet: { justifySelf: "start", border: "1px solid rgba(228,239,22,0.22)", background: "rgba(228,239,22,0.10)", color: accent, borderRadius: 999, padding: "8px 12px", fontWeight: 950, cursor: "pointer" },
  flowActions: { display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)", gap: 9, marginTop: 4 },
  secondaryFlowButton: { minHeight: 48, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(9,15,18,0.76)", color: "white", fontWeight: 950, fontSize: 14, cursor: "pointer" },
  dragHint: { color: "rgba(255,255,255,0.46)", fontSize: 12, fontWeight: 850, marginRight: "auto" },
  submitButton: { minHeight: 54, borderRadius: 999, border: 0, background: accent, color: "#101406", fontWeight: 950, fontSize: 16, cursor: "pointer", padding: "0 20px" },
  submitButtonDisabled: { opacity: 0.45, cursor: "not-allowed" },
  smallButton: { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.08)", color: "white", borderRadius: 999, padding: "9px 12px", fontWeight: 950, cursor: "pointer" },
  inlineActions: { display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.2fr)", gap: 8, alignItems: "center" },
  mutedText: { margin: 0, color: "rgba(255,255,255,0.62)", lineHeight: 1.45, fontWeight: 750 },
  alternativeButton: { justifySelf: "start", marginLeft: 43, border: "1px solid rgba(228,239,22,0.26)", background: "rgba(228,239,22,0.10)", color: accent, borderRadius: 999, padding: "7px 10px", fontWeight: 950, cursor: "pointer", fontSize: 12 },
    addButton: { border: 0, background: accent, color: "#101406", borderRadius: 999, padding: "10px 14px", fontWeight: 950, cursor: "pointer" },
};
