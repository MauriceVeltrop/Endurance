"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import BottomNav from "../../../components/BottomNav";
import { supabase } from "../../../lib/supabase";
import { sportOptions } from "../../../lib/sportsConfig";
import { getSportLabel } from "../../../lib/trainingHelpers";
import {
  getExerciseById,
  getMuscleGroupLabel,
  strengthExercises,
  strengthMuscleGroups,
} from "../../../lib/strengthWorkoutConfig";

const FALLBACK_WORKOUT_SPORTS = sportOptions.filter((sport) => sport.workout).map((sport) => sport.id);

const WORKOUT_SPORT_PROFILES = {
  strength_training: {
    focus: "Muscle groups, exercises, sets, reps and load.",
    title: "Strength workout builder",
    status: "Available now",
  },
  crossfit: {
    focus: "WODs, AMRAP, EMOM, rounds, movements and time caps.",
    title: "CrossFit workouts",
    status: "Coming soon",
  },
  hyrox: {
    focus: "Run blocks, race stations, loads, targets and simulations.",
    title: "HYROX workouts",
    status: "Coming soon",
  },
  bootcamp: {
    focus: "Circuits, stations, work/rest blocks and group setup.",
    title: "Bootcamp workouts",
    status: "Coming soon",
  },
};

const emptySet = (index) => ({ set: index + 1, reps: "", weight_kg: "" });

function workoutProfileFor(sportId) {
  return (
    WORKOUT_SPORT_PROFILES[sportId] || {
      focus: "Sport-specific workout structure.",
      title: `${getSportLabel(sportId)} workout builder`,
      status: "Coming soon",
    }
  );
}

function sportIconFor(sportId) {
  const map = {
    strength_training: "/training-images/strength.svg",
    crossfit: "/training-images/crossfit.svg",
    hyrox: "/training-images/hyrox.svg",
    bootcamp: "/training-images/bootcamp.svg",
    running: "/training-images/running.svg",
    trail_running: "/training-images/trail-running.svg",
    road_cycling: "/training-images/road-cycling.svg",
    gravel_cycling: "/training-images/gravel-cycling.svg",
    mountain_biking: "/training-images/mountain-biking.svg",
    walking: "/training-images/walking.svg",
  };

  return map[sportId] || "/training-images/training.svg";
}

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
  const [availableSports, setAvailableSports] = useState([]);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
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
        .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      if (profileData?.blocked) {
        setMessage("Your account is blocked. Contact an administrator.");
        return;
      }

      setProfile(profileData);

      const [{ data: preferredRows, error: preferredError }, { data: sportRows, error: sportError }] =
        await Promise.all([
          supabase.from("user_sports").select("sport_id").eq("user_id", user.id),
          supabase
            .from("sports")
            .select("id,name,category,supports_workouts,sort_order")
            .eq("supports_workouts", true)
            .order("sort_order", { ascending: true }),
        ]);

      if (preferredError) throw preferredError;
      if (sportError) throw sportError;

      const preferredIds = (preferredRows || []).map((row) => row.sport_id).filter(Boolean);
      const workoutSports = (sportRows || []).filter(
        (sport) => preferredIds.includes(sport.id) || FALLBACK_WORKOUT_SPORTS.includes(sport.id)
      );
      const allowed = workoutSports.filter((sport) => preferredIds.includes(sport.id));

      setAvailableSports(allowed);

      if (allowed.length) {
        const first = allowed[0];
        setSelectedSportId(first.id);
        setTitle(`${getSportLabel(first.id)} Workout`);
      }
    } catch (error) {
      console.error("Create workout access error", error);
      setMessage(error?.message || "Could not load workout creator.");
    } finally {
      setChecking(false);
    }
  }

  const selectedSport = availableSports.find((sport) => sport.id === selectedSportId);
  const selectedProfile = workoutProfileFor(selectedSportId);
  const isStrength = selectedSportId === "strength_training";

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

  function chooseSport(sportId) {
    setSelectedSportId(sportId);
    setTitle(`${getSportLabel(sportId)} Workout`);
    setDescription("");
    setSelectedGroups([]);
    setSelectedExercises([]);
    setCurrentStep(2);
  }

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

    if (!selectedSportId) {
      setMessage("Choose a workout sport first.");
      setCurrentStep(1);
      return;
    }

    if (!isStrength) {
      setMessage(`${getSportLabel(selectedSportId)} workout builder is coming soon.`);
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

      const { data, error } = await supabase
        .from("workouts")
        .insert({
          creator_id: profile.id,
          sport_id: selectedSportId,
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
        })
        .select("id")
        .single();

      if (error) throw error;
      router.push(data?.id ? `/workouts/${data.id}` : "/workouts");
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
    <main className="endurance-page create-route-v2-page create-workout-page route-step-page">
      <AppHeader active="workouts" />

      <section className="endurance-shell training-hero endurance-card create-route-v2-hero route-step-hero">
        <div>
          <p className="eyebrow">Create workout</p>
          <h1>
            Build a workout
            <br />
            for your sport<span>.</span>
          </h1>
          <p>Choose a preferred sport first, then build the workout structure for that sport.</p>
        </div>
      </section>

      <section className="endurance-shell route-stepper workout-stepper">
        {[1, 2].map((step) => (
          <button
            key={step}
            type="button"
            className={currentStep === step ? "active" : ""}
            onClick={() => {
              if (step === 1) setCurrentStep(1);
              if (step === 2 && selectedSportId) setCurrentStep(2);
            }}
          >
            <span>{step}</span>
            {step === 1 ? "Sport" : "Workout"}
          </button>
        ))}
      </section>

      {message ? <section className="endurance-shell create-route-v2-message">{message}</section> : null}

      {checking ? (
        <section className="endurance-shell endurance-card notification-empty">Loading workout creator...</section>
      ) : null}

      {!checking && !availableSports.length ? (
        <section className="endurance-shell endurance-card notification-empty">
          <h2>No workout sports available</h2>
          <p>Add a workout-relevant sport to your preferred sports first.</p>
          <Link href="/onboarding" className="primary-action">Update preferred sports</Link>
        </section>
      ) : null}

      {!checking && availableSports.length ? (
        <>
          {currentStep === 1 ? (
            <section className="endurance-shell create-route-v2-section route-step-section">
              <div className="route-builder-step compact">
                <span>1</span>
                <div>
                  <p className="eyebrow">Sport first</p>
                  <h2>Choose workout sport</h2>
                </div>
              </div>

              <div className="create-route-sport-grid compact sport-button-list workout-sport-list">
                {availableSports.map((sport) => {
                  const profileForSport = workoutProfileFor(sport.id);
                  return (
                    <button
                      key={sport.id}
                      type="button"
                      className={selectedSportId === sport.id ? "route-sport-button active" : "route-sport-button"}
                      onClick={() => chooseSport(sport.id)}
                    >
                      <span className="route-sport-icon" aria-hidden="true">
                        <img src={sportIconFor(sport.id)} alt="" />
                      </span>
                      <span className="route-sport-copy">
                        <strong>{getSportLabel(sport.id)}</strong>
                        <small>{profileForSport.focus}</small>
                      </span>
                      <span className="route-sport-arrow" aria-hidden="true">›</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {currentStep === 2 && selectedSport ? (
            <section className="endurance-shell create-route-v2-section route-step-section workout-builder-section">
              <div className="route-builder-step compact">
                <span>2</span>
                <div>
                  <p className="eyebrow">{selectedProfile.title}</p>
                  <h2>{isStrength ? "Build strength workout" : "Workout builder"}</h2>
                </div>
              </div>

              <div className="route-method-premium-head workout-selected-head">
                <div className="route-method-selected-sport">
                  <span className="route-sport-icon" aria-hidden="true">
                    <img src={sportIconFor(selectedSport.id)} alt="" />
                  </span>
                  <div>
                    <strong>{getSportLabel(selectedSport.id)}</strong>
                    <small>{selectedProfile.focus}</small>
                  </div>
                </div>
                <button type="button" onClick={() => setCurrentStep(1)}>Change sport</button>
              </div>

              {!isStrength ? (
                <div className="endurance-card notification-empty workout-coming-soon-card">
                  <h2>{selectedProfile.status}</h2>
                  <p>{getSportLabel(selectedSport.id)} workouts will get their own sport-specific builder later.</p>
                  <button type="button" className="primary-action" onClick={() => setCurrentStep(1)}>
                    Choose another sport
                  </button>
                </div>
              ) : (
                <form onSubmit={saveWorkout} className="strength-builder-form compact-strength-builder">
                  <section className="endurance-card strength-builder-card compact">
                    <div className="strength-builder-fields">
                      <label>
                        <span>Workout name</span>
                        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Strength Workout" />
                      </label>
                      <label>
                        <span>Visibility</span>
                        <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
                          <option value="public">Public</option>
                          <option value="team">Team</option>
                          <option value="private">Private</option>
                        </select>
                      </label>
                      <label className="full">
                        <span>Description</span>
                        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional notes for this workout." />
                      </label>
                    </div>
                  </section>

                  <section className="endurance-card strength-builder-card compact">
                    <div className="section-heading-row">
                      <div>
                        <p className="eyebrow">Step 1</p>
                        <h3>Choose muscle groups</h3>
                      </div>
                      <small>{selectedGroups.length} selected</small>
                    </div>
                    <div className="strength-chip-grid">
                      {strengthMuscleGroups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          className={selectedGroups.includes(group.id) ? "active" : ""}
                          onClick={() => toggleGroup(group.id)}
                        >
                          {group.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="endurance-card strength-builder-card compact">
                    <div className="section-heading-row">
                      <div>
                        <p className="eyebrow">Step 2</p>
                        <h3>Add exercises</h3>
                      </div>
                      <small>{filteredExercises.length} available</small>
                    </div>
                    {!selectedGroups.length ? (
                      <p className="muted-copy">Choose at least one muscle group first.</p>
                    ) : (
                      <div className="strength-exercise-grid">
                        {filteredExercises.map((exercise) => {
                          const added = selectedExerciseIds.has(exercise.id);
                          return (
                            <button
                              key={exercise.id}
                              type="button"
                              disabled={added}
                              className={added ? "added" : ""}
                              onClick={() => addExercise(exercise.id)}
                            >
                              <strong>{added ? "✓ " : "+ "}{exercise.name}</strong>
                              <span>{exercise.muscleGroups.map(getMuscleGroupLabel).join(" · ")}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="endurance-card strength-builder-card compact">
                    <div className="section-heading-row">
                      <div>
                        <p className="eyebrow">Step 3</p>
                        <h3>Sets, reps and load</h3>
                      </div>
                      <small>{exerciseCount} exercises · {setCount} sets</small>
                    </div>

                    {!selectedExercises.length ? (
                      <p className="muted-copy">Added exercises will appear here.</p>
                    ) : (
                      <div className="strength-selected-stack compact">
                        {selectedExercises.map((exercise) => (
                          <article key={exercise.id} className="strength-selected-exercise">
                            <div className="strength-selected-top">
                              <div>
                                <h4>{exercise.name}</h4>
                                <p>{exercise.muscle_groups.map(getMuscleGroupLabel).join(" · ")}</p>
                              </div>
                              <button type="button" onClick={() => removeExercise(exercise.id)}>Remove</button>
                            </div>

                            <div className="strength-set-table">
                              <div className="set-table-head">
                                <span>Set</span><span>Reps</span><span>Kg</span><span></span>
                              </div>
                              {exercise.sets.map((set, setIndex) => (
                                <div key={`${exercise.id}-${setIndex}`} className="set-table-row">
                                  <strong>{setIndex + 1}</strong>
                                  <input
                                    type="number"
                                    min="0"
                                    inputMode="numeric"
                                    value={set.reps}
                                    onChange={(event) => updateSet(exercise.id, setIndex, "reps", event.target.value)}
                                    placeholder="8"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    inputMode="decimal"
                                    value={set.weight_kg}
                                    onChange={(event) => updateSet(exercise.id, setIndex, "weight_kg", event.target.value)}
                                    placeholder="80"
                                  />
                                  <button type="button" onClick={() => removeSet(exercise.id, setIndex)}>×</button>
                                </div>
                              ))}
                            </div>
                            <button type="button" className="add-set-pill" onClick={() => addSet(exercise.id)}>+ Add set</button>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>

                  <button type="submit" disabled={saving} className="primary-action workout-save-action">
                    {saving ? "Saving..." : "Save strength workout"}
                  </button>
                </form>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      <BottomNav />
    </main>
  );
}
