"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import { supabase } from "../../../lib/supabase";
import { getSportLabel } from "../../../lib/trainingHelpers";
import { uploadTrainingPhoto } from "../../../lib/trainingPhotos";

const sportOptions = [
  { id: "running", label: "Running", route: true, workout: false, metric: "pace" },
  { id: "trail_running", label: "Trail Running", route: true, workout: false, metric: "pace" },
  { id: "road_cycling", label: "Road Cycling", route: true, workout: false, metric: "speed" },
  { id: "gravel_cycling", label: "Gravel Cycling", route: true, workout: false, metric: "speed" },
  { id: "mountain_biking", label: "Mountain Biking", route: true, workout: false, metric: "speed" },
  { id: "walking", label: "Walking", route: true, workout: false, metric: "speed" },
  { id: "kayaking", label: "Kayaking", route: true, workout: false, metric: "speed" },
  { id: "strength_training", label: "Strength Training", route: false, workout: true, metric: "intensity" },
  { id: "crossfit", label: "CrossFit", route: false, workout: true, metric: "intensity" },
  { id: "hyrox", label: "HYROX", route: false, workout: true, metric: "intensity" },
  { id: "bootcamp", label: "Bootcamp", route: false, workout: true, metric: "intensity" },
  { id: "swimming", label: "Swimming", route: false, workout: false, metric: "intensity" },
  { id: "padel", label: "Padel", route: false, workout: false, metric: "intensity" },
];

function makeAutomaticTitle(selectedSports) {
  const labels = selectedSports.map((sport) => sport.label);

  if (!labels.length) return "Training";
  if (labels.length === 1) return `${labels[0]} Training`;
  if (labels.length === 2) return `${labels[0]} + ${labels[1]} Training`;

  return `${labels.slice(0, -1).join(", ")} + ${labels[labels.length - 1]} Training`;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export default function CreateTrainingPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowedSportIds, setAllowedSportIds] = useState([]);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [savedWorkouts, setSavedWorkouts] = useState([]);
  const [teamPartners, setTeamPartners] = useState([]);
  const [selectedInviteIds, setSelectedInviteIds] = useState([]);
  const [preselectedRoute, setPreselectedRoute] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  const [form, setForm] = useState({
    sports: [],
    title: "",
    titleEdited: false,
    description: "",
    visibility: "public",
    date: todayString(),
    time_mode: "fixed",
    time: "",
    flexible_start_time: "",
    flexible_end_time: "",
    start_location: "",
    distance_km: "",
    estimated_duration_min: "",
    intensity_label: "easy",
    pace_min: "",
    pace_max: "",
    speed_min: "",
    speed_max: "",
    max_participants: "",
    route_id: "",
    workout_id: "",
    is_outdoor: true,
  });

  const availableSportOptions = useMemo(() => {
    return sportOptions.filter((sport) => allowedSportIds.includes(sport.id));
  }, [allowedSportIds]);

  const selectedSports = useMemo(() => {
    return availableSportOptions.filter((sport) => form.sports.includes(sport.id));
  }, [availableSportOptions, form.sports]);

  const automaticTitle = useMemo(() => makeAutomaticTitle(selectedSports), [selectedSports]);
  const trainingTitle = form.titleEdited ? form.title : automaticTitle;

  const supportsRoutes = selectedSports.some((sport) => sport.route);
  const supportsWorkouts = selectedSports.some((sport) => sport.workout);
  const usesPace = selectedSports.some((sport) => sport.metric === "pace");
  const usesSpeed = selectedSports.some((sport) => sport.metric === "speed");
  const usesIntensity =
    selectedSports.some((sport) => sport.metric === "intensity") && !usesPace && !usesSpeed;

  const compatibleRoutes = useMemo(() => {
    if (!supportsRoutes) return [];
    return savedRoutes.filter((route) => form.sports.includes(route.sport_id));
  }, [savedRoutes, form.sports, supportsRoutes]);

  const compatibleWorkouts = useMemo(() => {
    if (!supportsWorkouts) return [];
    return savedWorkouts.filter((workout) => form.sports.includes(workout.sport_id));
  }, [savedWorkouts, form.sports, supportsWorkouts]);


  async function fillCurrentLocation({ silent = false } = {}) {
    if (typeof window === "undefined" || !navigator?.geolocation) {
      if (!silent) setLocationStatus("Current location is not available on this device.");
      return;
    }

    try {
      if (!silent) setLocationStatus("Finding nearest address...");

      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 9000,
          maximumAge: 60000,
        });
      });

      const { latitude, longitude } = position.coords;

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) throw new Error("Reverse geocoding failed");

      const data = await response.json();
      const address = data?.address || {};

      const parts = [
        address.road,
        address.house_number,
        address.village || address.town || address.city || address.municipality,
      ].filter(Boolean);

      const nearestAddress = parts.length ? parts.join(" ") : data?.display_name;

      if (nearestAddress) {
        setForm((current) => ({
          ...current,
          startLocation: current.startLocation?.trim() ? current.startLocation : nearestAddress,
          start_location: current.start_location?.trim() ? current.start_location : nearestAddress,
        }));
        setLocationStatus("Nearest address added. You can overwrite it.");
      } else if (!silent) {
        setLocationStatus("Could not determine the nearest address.");
      }
    } catch (error) {
      console.warn("Current location skipped", error);
      if (!silent) setLocationStatus("Could not get current location.");
    }
  }

  useEffect(() => {
    loadCreateTrainingData();
  }, []);

  async function loadCreateTrainingData() {
    setCheckingAccess(true);
    setMessage("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      if (profileRow?.blocked) {
        setProfile(profileRow);
        setMessage("Your account is blocked. Contact an administrator.");
        return;
      }

      setProfile(profileRow);

      const { data: sportsRows, error: sportsError } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);

      if (sportsError) throw sportsError;

      const allowedIds = (sportsRows || []).map((row) => row.sport_id).filter(Boolean);
      setAllowedSportIds(allowedIds);

      if (!allowedIds.length) {
        setForm((current) => ({
          ...current,
          sports: [],
          title: "",
          titleEdited: false,
        }));
        setMessage("No preferred sports found. Update your profile before creating a training.");
        return;
      }

      const firstSport = sportOptions.find((sport) => sport.id === allowedIds[0]);

      setForm((current) => ({
        ...current,
        sports: current.sports.length ? current.sports.filter((sportId) => allowedIds.includes(sportId)) : [allowedIds[0]],
        title: current.titleEdited ? current.title : makeAutomaticTitle(firstSport ? [firstSport] : []),
      }));

      let filteredRoutes = [];

      const { data: routeRows, error: routeError } = await supabase
        .from("routes")
        .select("id,title,sport_id,distance_km,elevation_gain_m,visibility,creator_id")
        .or(`visibility.eq.public,creator_id.eq.${user.id}`)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(80);

      if (routeError) {
        console.warn("Routes skipped", routeError);
      } else {
        filteredRoutes = (routeRows || []).filter((route) => allowedIds.includes(route.sport_id) || route.creator_id === user.id);
        setSavedRoutes(filteredRoutes);
      }

      const { data: workoutRows, error: workoutError } = await supabase
        .from("workouts")
        .select("id,title,sport_id,workout_type,level,duration_min,visibility,creator_id")
        .or(`visibility.eq.public,creator_id.eq.${user.id}`)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(80);

      if (workoutError) {
        console.warn("Workouts skipped", workoutError);
      } else {
        setSavedWorkouts(
          (workoutRows || []).filter((workout) => allowedIds.includes(workout.sport_id) || workout.creator_id === user.id)
        );
      }

      const { data: partnerRows, error: partnerError } = await supabase
        .from("training_partners")
        .select("id,requester_id,addressee_id,status")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq("status", "accepted");

      if (partnerError) {
        console.warn("Training partners skipped", partnerError);
      } else {
        const partnerIds = (partnerRows || [])
          .map((relation) => (relation.requester_id === user.id ? relation.addressee_id : relation.requester_id))
          .filter(Boolean);

        if (partnerIds.length) {
          const { data: partnerProfiles, error: partnerProfilesError } = await supabase
            .from("profiles")
            .select("id,name,first_name,last_name,avatar_url,role,location")
            .in("id", partnerIds);

          if (partnerProfilesError) {
            console.warn("Partner profiles skipped", partnerProfilesError);
          } else {
            setTeamPartners(partnerProfiles || []);
          }
        }
      }

      const params = new URLSearchParams(window.location.search);
      const requestedRouteId = params.get("route") || params.get("route_id");
      const requestedRoute = requestedRouteId
        ? filteredRoutes.find((route) => route.id === requestedRouteId)
        : null;

      if (requestedRoute) {
        setPreselectedRoute(requestedRoute);
        setForm((current) => ({
          ...current,
          sports: [requestedRoute.sport_id],
          route_id: requestedRoute.id,
          distance_km: requestedRoute.distance_km || current.distance_km,
          title: current.titleEdited ? current.title : `${getSportLabel(requestedRoute.sport_id)} Training`,
        }));
      }
    } catch (error) {
      console.error("Create training setup error", error);
      setMessage(error?.message || "Could not prepare Create Training.");
    } finally {
      setCheckingAccess(false);
    }
  }

  function update(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function chooseTrainingPhoto(file) {
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview("");
      return;
    }

    if (!file.type?.startsWith("image/")) {
      setMessage("Choose an image file for the training photo.");
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function toggleSport(sportId) {
    setForm((current) => {
      if (!allowedSportIds.includes(sportId)) return current;

      const exists = current.sports.includes(sportId);
      const nextSports = exists
        ? current.sports.filter((item) => item !== sportId)
        : [...current.sports, sportId];

      const safeSports = nextSports.length ? nextSports : current.sports;
      const nextSelectedSports = sportOptions.filter(
        (sport) => safeSports.includes(sport.id) && allowedSportIds.includes(sport.id)
      );

      const routeStillMatches = savedRoutes.some(
        (route) => route.id === current.route_id && safeSports.includes(route.sport_id)
      );

      const workoutStillMatches = savedWorkouts.some(
        (workout) => workout.id === current.workout_id && safeSports.includes(workout.sport_id)
      );

      return {
        ...current,
        sports: safeSports,
        route_id: routeStillMatches ? current.route_id : "",
        workout_id: workoutStillMatches ? current.workout_id : "",
        title: current.titleEdited ? current.title : makeAutomaticTitle(nextSelectedSports),
      };
    });
  }

  function toggleInvite(personId) {
    setSelectedInviteIds((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId]
    );
  }

  function displayPartnerName(person) {
    return person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Training partner";
  }

  async function saveTraining(event) {
    event.preventDefault();
    setMessage("");

    if (!form.sports.length) {
      setMessage("Choose at least one of your preferred sports.");
      return;
    }

    const forbiddenSports = form.sports.filter((sportId) => !allowedSportIds.includes(sportId));
    if (forbiddenSports.length) {
      setMessage("You can only create trainings for your preferred sports.");
      return;
    }

    if (!trainingTitle.trim()) {
      setMessage("Add a clear training name.");
      return;
    }

    if (!form.date) {
      setMessage("Choose a training date.");
      return;
    }

    if (form.time_mode === "fixed" && !form.time) {
      setMessage("Choose a start time, or switch to flexible time.");
      return;
    }

    if (form.time_mode === "flexible" && (!form.flexible_start_time || !form.flexible_end_time)) {
      setMessage("Choose a possible start window.");
      return;
    }

    if (!form.start_location.trim()) {
      setMessage("Add a start location.");
      return;
    }

    if (form.visibility === "selected" && !selectedInviteIds.length) {
      setMessage("Selected visibility requires at least one selected Team Up partner.");
      return;
    }

    try {
      setSaving(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const startsAt =
        form.time_mode === "fixed" && form.date && form.time
          ? new Date(`${form.date}T${form.time}`).toISOString()
          : null;

      const teaserPhotoUrl = photoFile
        ? await uploadTrainingPhoto({ supabase, userId: user.id, file: photoFile })
        : null;

      const payload = {
        creator_id: user.id,
        title: trainingTitle.trim(),
        description: form.description.trim(),
        sports: form.sports,
        visibility: form.visibility,
        planning_type: form.time_mode === "fixed" ? "fixed" : "flexible",
        starts_at: startsAt,
        flexible_date: form.time_mode === "flexible" ? form.date : null,
        flexible_start_time: form.time_mode === "flexible" ? form.flexible_start_time || null : null,
        flexible_end_time: form.time_mode === "flexible" ? form.flexible_end_time || null : null,
        start_location: form.start_location.trim(),
        is_outdoor: Boolean(form.is_outdoor),
        distance_km: form.distance_km ? Number(form.distance_km) : null,
        estimated_duration_min: form.estimated_duration_min ? Number(form.estimated_duration_min) : null,
        intensity_label: usesIntensity ? form.intensity_label || null : null,
        pace_min: usesPace ? form.pace_min || null : null,
        pace_max: usesPace ? form.pace_max || null : null,
        speed_min: usesSpeed && form.speed_min ? Number(form.speed_min) : null,
        speed_max: usesSpeed && form.speed_max ? Number(form.speed_max) : null,
        max_participants: form.max_participants ? Number(form.max_participants) : null,
        route_id: form.route_id || null,
        workout_id: form.workout_id || null,
        teaser_photo_url: teaserPhotoUrl,
      };

      const { data, error } = await supabase
        .from("training_sessions")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      if (selectedInviteIds.length) {
        const inviteRows = selectedInviteIds.map((inviteeId) => ({
          session_id: data.id,
          inviter_id: user.id,
          invitee_id: inviteeId,
        }));

        const { error: inviteError } = await supabase
          .from("training_invites")
          .insert(inviteRows);

        if (inviteError) console.warn("Training invites skipped", inviteError);
      }

      if (form.visibility === "selected" && selectedInviteIds.length) {
        const visibilityRows = selectedInviteIds.map((userId) => ({
          session_id: data.id,
          user_id: userId,
        }));

        const { error: visibilityError } = await supabase
          .from("training_visibility_members")
          .insert(visibilityRows);

        if (visibilityError) console.warn("Selected visibility members skipped", visibilityError);
      }

      setMessage("Training created. Returning to training overview.");
      router.push("/trainings");
    } catch (error) {
      console.error("Create training error", error);
      setMessage(error?.message || "Could not create training.");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAccess) {
    return (
      <main style={styles.page}>
        <section style={styles.shell}>
          <AppHeader profile={profile} compact />
          <section style={styles.stateCard}>
            <div style={styles.stateTitle}>Preparing Create Training...</div>
            <p style={styles.hint}>Checking your profile, preferred sports, routes and workouts.</p>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <Link href="/trainings" style={styles.backLink}>
          ← Back to trainings
        </Link>

        <header style={styles.header}>
          <div style={styles.kicker}>Create Training</div>
          <h1 style={styles.title}>Start with the sport.</h1>
          <p style={styles.subtitle}>
            You can only create trainings for your preferred sports. Routes and workouts appear only when relevant.
          </p>
        </header>

        {message ? <section style={styles.message}>{message}</section> : null}

        <form onSubmit={saveTraining} style={styles.form}>
          <section style={styles.section}>
            <div style={styles.sectionTitle}>1. Sport</div>

            {availableSportOptions.length ? (
              <div style={styles.sportGrid}>
                {availableSportOptions.map((sport) => {
                  const active = form.sports.includes(sport.id);
                  return (
                    <button
                      type="button"
                      key={sport.id}
                      onClick={() => toggleSport(sport.id)}
                      style={active ? styles.sportActive : styles.sportButton}
                    >
                      {sport.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>No preferred sports selected</div>
                <p style={styles.hint}>Go to your profile and choose at least one preferred sport.</p>
                <button type="button" onClick={() => router.push("/profile")} style={styles.secondaryButton}>
                  Open profile
                </button>
              </div>
            )}
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>2. Training details</div>

            <label style={styles.label}>
              Training name
              <input
                value={trainingTitle}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                    titleEdited: true,
                  }))
                }
                style={styles.input}
              />
            </label>

            <button
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  title: automaticTitle,
                  titleEdited: false,
                }))
              }
              style={styles.resetNameButton}
            >
              Use automatic name: {automaticTitle}
            </button>

            <label style={styles.label}>
              Description
              <textarea
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                placeholder="What kind of training is this?"
                style={styles.textarea}
              />
            </label>

            <label style={styles.label}>
              Visibility
              <select value={form.visibility} onChange={(event) => update("visibility", event.target.value)} style={styles.input}>
                <option value="public">Public · all users</option>
                <option value="team">Team · Team Up partners</option>
                <option value="selected">Selected members</option>
                <option value="private">Private · only me</option>
                <option value="group">Group</option>
              </select>
            </label>

            {form.visibility === "team" ? (
              <p style={styles.hint}>Team visibility means accepted Team Up partners can see this training.</p>
            ) : null}
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>3. Training photo</div>
            <p style={styles.hint}>
              Optional. This photo will be shown in the training feed and on the detail page. If you skip it, Endurance uses a sport placeholder.
            </p>

            <label style={styles.photoDrop}>
              {photoPreview ? (
                <img src={photoPreview} alt="Training preview" style={styles.photoPreview} />
              ) : (
                <span style={styles.photoPlaceholder}>Add training photo</span>
              )}

              <input
                type="file"
                accept="image/*"
                onChange={(event) => chooseTrainingPhoto(event.target.files?.[0])}
                style={styles.hiddenFileInput}
              />
            </label>

            {photoPreview ? (
              <button type="button" onClick={() => chooseTrainingPhoto(null)} style={styles.secondaryButton}>
                Remove selected photo
              </button>
            ) : null}
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>4. Date and time</div>

            <label style={styles.label}>
              Date
              <input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} style={styles.input} />
            </label>

            <div style={styles.toggleRow}>
              <button type="button" onClick={() => update("time_mode", "fixed")} style={form.time_mode === "fixed" ? styles.toggleActive : styles.toggleButton}>
                Fixed time
              </button>
              <button type="button" onClick={() => update("time_mode", "flexible")} style={form.time_mode === "flexible" ? styles.toggleActive : styles.toggleButton}>
                Flexible start
              </button>
            </div>

            {form.time_mode === "fixed" ? (
              <label style={styles.label}>
                Start time
                <input type="time" value={form.time} onChange={(event) => update("time", event.target.value)} style={styles.input} />
              </label>
            ) : (
              <div style={styles.twoColumns}>
                <label style={styles.label}>
                  Possible from
                  <input type="time" value={form.flexible_start_time} onChange={(event) => update("flexible_start_time", event.target.value)} style={styles.input} />
                </label>
                <label style={styles.label}>
                  Possible until
                  <input type="time" value={form.flexible_end_time} onChange={(event) => update("flexible_end_time", event.target.value)} style={styles.input} />
                </label>
              </div>
            )}
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>5. Location and metrics</div>

            <label style={styles.label}>
              Start location
              <input
                value={form.start_location}
                onChange={(event) => update("start_location", event.target.value)}
                placeholder="Landgraaf, Brunssum, trailhead..."
                style={styles.input}
              />
              <button type="button" onClick={() => fillCurrentLocation()} style={styles.secondaryButton}>
                Use current location
              </button>
              {locationStatus ? <p style={styles.hint}>{locationStatus}</p> : null}
            </label>

            <div style={styles.twoColumns}>
              <label style={styles.label}>
                Distance km
                <input type="number" min="0" step="0.1" value={form.distance_km} onChange={(event) => update("distance_km", event.target.value)} style={styles.input} />
              </label>
              <label style={styles.label}>
                Duration min
                <input type="number" min="0" value={form.estimated_duration_min} onChange={(event) => update("estimated_duration_min", event.target.value)} style={styles.input} />
              </label>
            </div>

            {usesPace ? (
              <div style={styles.twoColumns}>
                <label style={styles.label}>
                  Pace min
                  <input value={form.pace_min} onChange={(event) => update("pace_min", event.target.value)} placeholder="5:00/km" style={styles.input} />
                </label>
                <label style={styles.label}>
                  Pace max
                  <input value={form.pace_max} onChange={(event) => update("pace_max", event.target.value)} placeholder="5:45/km" style={styles.input} />
                </label>
              </div>
            ) : null}

            {usesSpeed ? (
              <div style={styles.twoColumns}>
                <label style={styles.label}>
                  Speed min
                  <input type="number" min="0" step="0.1" value={form.speed_min} onChange={(event) => update("speed_min", event.target.value)} style={styles.input} />
                </label>
                <label style={styles.label}>
                  Speed max
                  <input type="number" min="0" step="0.1" value={form.speed_max} onChange={(event) => update("speed_max", event.target.value)} style={styles.input} />
                </label>
              </div>
            ) : null}

            {usesIntensity ? (
              <label style={styles.label}>
                Intensity
                <select value={form.intensity_label} onChange={(event) => update("intensity_label", event.target.value)} style={styles.input}>
                  <option value="easy">Easy</option>
                  <option value="moderate">Moderate</option>
                  <option value="hard">Hard</option>
                  <option value="race">Race effort</option>
                </select>
              </label>
            ) : null}

            <label style={styles.label}>
              Max participants
              <input type="number" min="0" value={form.max_participants} onChange={(event) => update("max_participants", event.target.value)} style={styles.input} />
            </label>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>
              {form.visibility === "selected" ? "6. Select members" : "6. Invite training partners"}
            </div>

            {teamPartners.length ? (
              <div style={styles.inviteGrid}>
                {teamPartners.map((person) => {
                  const active = selectedInviteIds.includes(person.id);
                  const name = displayPartnerName(person);
                  const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

                  return (
                    <button
                      type="button"
                      key={person.id}
                      onClick={() => toggleInvite(person.id)}
                      style={active ? styles.inviteActive : styles.inviteButton}
                    >
                      {person.avatar_url ? (
                        <img src={person.avatar_url} alt="" style={styles.inviteAvatar} />
                      ) : (
                        <span style={styles.inviteInitials}>{initials}</span>
                      )}
                      <span>{name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>No Team Up partners yet</div>
                <p style={styles.hint}>
                  You can still create public, private or team trainings. Add partners later through Team Up.
                </p>
                <button type="button" onClick={() => router.push("/team")} style={styles.secondaryButton}>
                  Open Team
                </button>
              </div>
            )}

            {form.visibility === "selected" ? (
              <p style={styles.hint}>
                Only you and selected Team Up partners can access this training.
              </p>
            ) : null}
          </section>

          {supportsRoutes ? (
            <section style={styles.section}>
              <div style={styles.sectionTitle}>7. Route</div>

              {preselectedRoute ? (
                <div style={styles.connectedRouteBox}>
                  <strong>Route selected</strong>
                  <span>
                    {preselectedRoute.title} · {getSportLabel(preselectedRoute.sport_id)}
                    {preselectedRoute.distance_km ? ` · ${preselectedRoute.distance_km} km` : ""}
                  </span>
                </div>
              ) : null}

              {compatibleRoutes.length ? (
                <label style={styles.label}>
                  Use saved route
                  <select
                    value={form.route_id}
                    onChange={(event) => {
                      const routeId = event.target.value;
                      const route = compatibleRoutes.find((item) => item.id === routeId);

                      setPreselectedRoute(route || null);
                      setForm((current) => ({
                        ...current,
                        route_id: routeId,
                        distance_km: route?.distance_km || current.distance_km,
                      }));
                    }}
                    style={styles.input}
                  >
                    <option value="">No route selected</option>
                    {compatibleRoutes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.title} · {getSportLabel(route.sport_id)}
                        {route.distance_km ? ` · ${route.distance_km} km` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div style={styles.infoCard}>
                  <div style={styles.infoTitle}>No saved route yet</div>
                  <p style={styles.hint}>Create or import a route first, then connect it to this training.</p>
                  <button type="button" onClick={() => router.push("/routes/new")} style={styles.secondaryButton}>
                    Create route
                  </button>
                </div>
              )}
            </section>
          ) : null}

          {supportsWorkouts ? (
            <section style={styles.section}>
              <div style={styles.sectionTitle}>Workout</div>

              {compatibleWorkouts.length ? (
                <label style={styles.label}>
                  Use saved workout
                  <select
                    value={form.workout_id}
                    onChange={(event) => update("workout_id", event.target.value)}
                    style={styles.input}
                  >
                    <option value="">No workout selected</option>
                    {compatibleWorkouts.map((workout) => (
                      <option key={workout.id} value={workout.id}>
                        {workout.title} · {getSportLabel(workout.sport_id)}
                        {workout.duration_min ? ` · ${workout.duration_min} min` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div style={styles.infoCard}>
                  <div style={styles.infoTitle}>No saved workout yet</div>
                  <p style={styles.hint}>Create a workout first, then connect it to this training.</p>
                  <button type="button" onClick={() => router.push("/workouts/new")} style={styles.secondaryButton}>
                    Create workout
                  </button>
                </div>
              )}
            </section>
          ) : null}

          <button type="submit" disabled={saving || !availableSportOptions.length} style={styles.submitButton}>
            {saving ? "Creating..." : "Create training"}
          </button>
        </form>
      </section>
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
    padding: "18px 16px 56px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: {
    width: "min(860px, 100%)",
    margin: "0 auto",
    display: "grid",
    gap: 18,
  },
  logo: {
    width: "min(280px, 72vw)",
    height: "auto",
    justifySelf: "center",
  },
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
  header: {
    display: "grid",
    gap: 8,
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(38px, 10vw, 66px)",
    lineHeight: 0.96,
    letterSpacing: "-0.065em",
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
    maxWidth: 620,
  },
  form: {
    display: "grid",
    gap: 16,
  },
  section: {
    borderRadius: 30,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
  },
  sectionTitle: {
    color: "#e4ef16",
    fontWeight: 950,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontSize: 13,
  },
  sportGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  sportButton: {
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.76)",
    padding: "11px 13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  sportActive: {
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.40)",
    background: "rgba(228,239,22,0.14)",
    color: "#e4ef16",
    padding: "11px 13px",
    fontWeight: 950,
    cursor: "pointer",
  },
  label: {
    display: "grid",
    gap: 7,
    color: "rgba(255,255,255,0.72)",
    fontWeight: 850,
    fontSize: 13,
  },
  input: {
    width: "100%",
    minHeight: 48,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.24)",
    color: "white",
    padding: "0 12px",
    boxSizing: "border-box",
    outline: "none",
    fontSize: 15,
  },
  textarea: {
    width: "100%",
    minHeight: 100,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.24)",
    color: "white",
    padding: 12,
    boxSizing: "border-box",
    outline: "none",
    fontSize: 15,
    resize: "vertical",
  },
  resetNameButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.24)",
    background: "rgba(228,239,22,0.08)",
    color: "#e4ef16",
    fontWeight: 900,
    padding: "0 14px",
    cursor: "pointer",
    textAlign: "left",
  },
  toggleRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  toggleButton: {
    minHeight: 48,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.74)",
    fontWeight: 900,
    cursor: "pointer",
  },
  toggleActive: {
    minHeight: 48,
    borderRadius: 18,
    border: "1px solid rgba(228,239,22,0.40)",
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    cursor: "pointer",
  },
  twoColumns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  hint: {
    color: "rgba(255,255,255,0.62)",
    lineHeight: 1.5,
    margin: 0,
  },
  infoCard: {
    borderRadius: 22,
    padding: 16,
    background: "rgba(228,239,22,0.075)",
    border: "1px solid rgba(228,239,22,0.18)",
    display: "grid",
    gap: 8,
  },
  infoTitle: {
    color: "#e4ef16",
    fontWeight: 950,
  },
  message: {
    borderRadius: 18,
    padding: 14,
    background: "rgba(228,239,22,0.08)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "rgba(255,255,255,0.82)",
    lineHeight: 1.45,
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.07)",
    color: "white",
    fontWeight: 950,
    padding: "0 16px",
    cursor: "pointer",
    width: "fit-content",
  },
  inviteGrid: {
    display: "grid",
    gap: 10,
  },
  inviteButton: {
    minHeight: 58,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.055)",
    color: "rgba(255,255,255,0.78)",
    display: "grid",
    gridTemplateColumns: "38px minmax(0, 1fr)",
    alignItems: "center",
    gap: 10,
    padding: 10,
    textAlign: "left",
    fontWeight: 900,
    cursor: "pointer",
  },
  inviteActive: {
    minHeight: 58,
    borderRadius: 22,
    border: "1px solid rgba(228,239,22,0.32)",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    display: "grid",
    gridTemplateColumns: "38px minmax(0, 1fr)",
    alignItems: "center",
    gap: 10,
    padding: 10,
    textAlign: "left",
    fontWeight: 950,
    cursor: "pointer",
  },
  inviteAvatar: {
    width: 38,
    height: 38,
    borderRadius: 999,
    objectFit: "cover",
    border: "1px solid rgba(228,239,22,0.25)",
  },
  inviteInitials: {
    width: 38,
    height: 38,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    border: "1px solid rgba(228,239,22,0.22)",
    fontWeight: 950,
  },
  connectedRouteBox: {
    borderRadius: 22,
    padding: 15,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.22)",
    color: "rgba(255,255,255,0.84)",
    display: "grid",
    gap: 5,
  },
  submitButton: {
    width: "100%",
    minHeight: 58,
    borderRadius: 22,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    fontSize: 17,
    cursor: "pointer",
    boxShadow: "0 18px 38px rgba(228,239,22,0.16)",
  },
  photoDrop: {
    position: "relative",
    minHeight: 170,
    borderRadius: 24,
    overflow: "hidden",
    border: "1px dashed rgba(228,239,22,0.34)",
    background:
      "radial-gradient(circle at 80% 20%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035))",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
  },
  photoPreview: {
    width: "100%",
    height: 220,
    objectFit: "cover",
    display: "block",
  },
  photoPlaceholder: {
    color: "#e4ef16",
    fontWeight: 950,
  },
  hiddenFileInput: {
    position: "absolute",
    inset: 0,
    opacity: 0,
    cursor: "pointer",
  },
  stateCard: {
    borderRadius: 28,
    padding: 22,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  stateTitle: {
    fontSize: 22,
    fontWeight: 950,
  },
};
