// NOTIFICATIONS_V1_PATCH: invite notification helpers available for create-training flow.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import ImageCropperModal from "../../../components/ImageCropperModal";
import { supabase } from "../../../lib/supabase";
import { getSportLabel } from "../../../lib/trainingHelpers";
import { fetchPrivacySettings, fetchPrivacySettingsMap, privacyAllowsTrainingInvite } from "../../../lib/privacy";
import { uploadTrainingPhoto } from "../../../lib/trainingPhotos";
import { createNotificationsForUsers, NOTIFICATION_TYPES, trainingUrl } from "../../../lib/notifications";

const sportOptions = [
  { id: "running", metric: "pace", distance: true, routes: true, workouts: false },
  { id: "trail_running", metric: "pace", distance: true, routes: true, workouts: false },
  { id: "road_cycling", metric: "speed", distance: true, routes: true, workouts: false },
  { id: "gravel_cycling", metric: "speed", distance: true, routes: true, workouts: false },
  { id: "mountain_biking", metric: "speed", distance: true, routes: true, workouts: false },
  { id: "walking", metric: "speed", distance: true, routes: true, workouts: false },
  { id: "kayaking", metric: "speed", distance: true, routes: true, workouts: false },
  { id: "strength_training", metric: "intensity", distance: false, routes: false, workouts: true },
  { id: "crossfit", metric: "intensity", distance: false, routes: false, workouts: true },
  { id: "hyrox", metric: "intensity", distance: false, routes: false, workouts: true },
  { id: "bootcamp", metric: "intensity", distance: false, routes: false, workouts: true },
  { id: "swimming", metric: "intensity", distance: false, routes: false, workouts: false },
  { id: "padel", metric: "intensity", distance: false, routes: false, workouts: false },
];

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function nextHourString() {
  const date = new Date();
  date.setHours(date.getHours() + 1);
  date.setMinutes(0, 0, 0);
  return date.toTimeString().slice(0, 5);
}

function timeAfter(time, minutes) {
  const [hours, mins] = String(time || "18:00").split(":").map(Number);
  const date = new Date();
  date.setHours(Number.isFinite(hours) ? hours : 18, Number.isFinite(mins) ? mins : 0, 0, 0);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toTimeString().slice(0, 5);
}

function addDaysString(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultTitle(sportId) {
  return `${getSportLabel(sportId)} Training`;
}

function displayName(person) {
  return person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.email || "Endurance user";
}

function initials(person) {
  return displayName(person)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDateLabel(value) {
  if (!value) return "Choose date";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function getInviteProfileId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("invite") || "";
}

function makeTimeOption(overrides = {}) {
  return {
    uid: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    starts_on: overrides.starts_on || todayString(),
    window_start: overrides.window_start || nextHourString(),
    window_end: overrides.window_end || timeAfter(overrides.window_start || nextHourString(), 90),
  };
}

export default function CreateTrainingPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [allowedSportIds, setAllowedSportIds] = useState([]);
  const [partners, setPartners] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [selectedInviteIds, setSelectedInviteIds] = useState([]);
  const [timeOptions, setTimeOptions] = useState([
    makeTimeOption({ starts_on: todayString(), window_start: nextHourString(), window_end: timeAfter(nextHourString(), 90) }),
    makeTimeOption({ starts_on: todayString(), window_start: "18:30", window_end: "21:00" }),
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [trainingPhotoFile, setTrainingPhotoFile] = useState(null);
  const [trainingPhotoPreview, setTrainingPhotoPreview] = useState("");
  const [trainingCropFile, setTrainingCropFile] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  const [form, setForm] = useState({
    sport_id: "",
    title: "",
    description: "",
    planning_type: "fixed",
    date: todayString(),
    start_time: nextHourString(),
    start_location: "",
    latitude: null,
    longitude: null,
    distance_km: "",
    estimated_duration_min: "",
    pace_min: "",
    pace_max: "",
    speed_min: "",
    speed_max: "",
    intensity_label: "Moderate",
    visibility: "team",
    max_participants: "",
    route_id: "",
    workout_id: "",
  });

  const selectedSport = useMemo(() => {
    return sportOptions.find((sport) => sport.id === form.sport_id) || null;
  }, [form.sport_id]);

  const visibleSports = useMemo(() => {
    return sportOptions.filter((sport) => allowedSportIds.includes(sport.id));
  }, [allowedSportIds]);

  const filteredRoutes = useMemo(() => {
    return routes.filter((route) => route.sport_id === form.sport_id);
  }, [routes, form.sport_id]);

  const filteredWorkouts = useMemo(() => {
    return workouts.filter((workout) => workout.sport_id === form.sport_id);
  }, [workouts, form.sport_id]);

  const groupedTimeOptions = useMemo(() => {
    const groups = new Map();
    normalizedTimeOptions(timeOptions).forEach((option) => {
      if (!groups.has(option.starts_on)) groups.set(option.starts_on, []);
      groups.get(option.starts_on).push(option);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, options]) => ({
        date,
        options: options.sort((a, b) => a.window_start.localeCompare(b.window_start)),
      }));
  }, [timeOptions, form.planning_type, form.date]);

  useEffect(() => {
    loadCreateData();
  }, []);

  function formatNearestAddress(address = {}) {
    const street = [address.road, address.house_number].filter(Boolean).join(" ");
    const place =
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.municipality ||
      address.county ||
      "";
    const parts = [street, place].filter(Boolean);
    return parts.length ? parts.join(", ") : "";
  }

  async function reverseGeocodeLocation(latitude, longitude) {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) throw new Error("Could not find your nearest address.");

    const data = await response.json();
    return formatNearestAddress(data?.address) || data?.display_name || "";
  }

  async function geocodeAddress(address) {
    const query = String(address || "").trim();
    if (!query) return null;

    const searchQuery = /netherlands|nederland/i.test(query) ? query : `${query}, Nederland`;
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(searchQuery)}&limit=1&addressdetails=1`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const place = data?.[0];
    if (!place?.lat || !place?.lon) return null;

    return {
      latitude: Number(place.lat),
      longitude: Number(place.lon),
      label: formatNearestAddress(place.address) || place.display_name || query,
    };
  }

  async function useCurrentLocation({ silent = false } = {}) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (!silent) setLocationMessage("Current location is not available on this device.");
      return;
    }

    setLocationLoading(true);
    if (!silent) setLocationMessage("Finding nearest address...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const latitude = position.coords?.latitude;
          const longitude = position.coords?.longitude;

          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new Error("No coordinates found.");
          }

          const address = await reverseGeocodeLocation(latitude, longitude);

          setForm((current) => ({
            ...current,
            start_location: current.start_location?.trim() ? current.start_location : address,
            latitude,
            longitude,
          }));

          setLocationMessage(
            address
              ? "Nearest address filled in. You can still overwrite it."
              : "Coordinates saved. Please enter a recognizable meeting point."
          );
        } catch (error) {
          console.warn("Reverse geocode failed", error);
          setLocationMessage("Could not determine a nearby address. Please enter a start location.");
        } finally {
          setLocationLoading(false);
        }
      },
      (error) => {
        console.warn("Geolocation failed", error);
        setLocationLoading(false);
        setLocationMessage(silent ? "" : "Location permission was denied. Please enter a start location.");
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  }

  async function loadCreateData() {
    setLoading(true);
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
        setMessage("Your account is blocked. Contact an administrator.");
        return;
      }

      setProfile(profileRow);
      useCurrentLocation({ silent: true });

      const ownPrivacy = await fetchPrivacySettings(user.id);
      if (ownPrivacy?.default_training_visibility) {
        setForm((current) => ({
          ...current,
          visibility: current.visibility || ownPrivacy.default_training_visibility,
        }));
      }

      const { data: sportsRows } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);

      const ids = (sportsRows || []).map((row) => row.sport_id).filter(Boolean);
      setAllowedSportIds(ids);

      const firstSport = sportOptions.find((sport) => ids.includes(sport.id));
      if (firstSport) {
        setForm((current) => ({
          ...current,
          sport_id: firstSport.id,
          title: defaultTitle(firstSport.id),
        }));
      }

      const [{ data: routesRows }, { data: workoutRows }] = await Promise.all([
        supabase
          .from("routes")
          .select("id,title,sport_id,distance_km,elevation_gain_m,visibility")
          .eq("creator_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("workouts")
          .select("id,title,sport_id,workout_type,level,duration_min,visibility")
          .eq("creator_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      setRoutes(routesRows || []);
      setWorkouts(workoutRows || []);

      const { data: relationRows } = await supabase
        .from("training_partners")
        .select("id,requester_id,addressee_id,status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      const partnerIds = (relationRows || [])
        .map((relation) =>
          relation.requester_id === user.id ? relation.addressee_id : relation.requester_id
        )
        .filter(Boolean);

      if (partnerIds.length) {
        const { data: partnerRows } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,email,avatar_url,role,location")
          .in("id", partnerIds);

        const loadedPartners = partnerRows || [];
        setPartners(loadedPartners);

        const inviteProfileId = getInviteProfileId();
        const invitedPartner = loadedPartners.find((person) => person.id === inviteProfileId);

        if (invitedPartner) {
          setSelectedInviteIds([invitedPartner.id]);
          setForm((current) => ({
            ...current,
            visibility: "selected",
          }));
          setMessage(`Invite prepared for ${displayName(invitedPartner)}.`);
        }
      } else {
        setPartners([]);
      }
    } catch (error) {
      console.error("Create training load error", error);
      setMessage(error?.message || "Could not load create training.");
    } finally {
      setLoading(false);
    }
  }

  function updateForm(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "sport_id") {
        next.title = defaultTitle(value);
        next.pace_min = "";
        next.pace_max = "";
        next.speed_min = "";
        next.speed_max = "";
        next.intensity_label = "Moderate";
        next.distance_km = "";
        next.route_id = "";
        next.workout_id = "";
      }

      if (key === "visibility" && value !== "selected") {
        setSelectedInviteIds([]);
      }

      return next;
    });
  }

  function toggleInvite(profileId) {
    setSelectedInviteIds((current) => {
      if (current.includes(profileId)) return current.filter((id) => id !== profileId);
      return [...current, profileId];
    });
  }

  function updateTimeOption(uid, key, value) {
    setTimeOptions((current) =>
      current.map((option) => (option.uid === uid ? { ...option, [key]: value } : option))
    );
  }

  function addTimeOptionForDate(date) {
    setTimeOptions((current) => [
      ...current,
      makeTimeOption({
        starts_on: date || current[current.length - 1]?.starts_on || form.date || todayString(),
        window_start: "18:30",
        window_end: "21:00",
      }),
    ]);
  }

  function addNextDayOption() {
    const latestDate = normalizedTimeOptions(timeOptions).reduce(
      (latest, option) => (option.starts_on > latest ? option.starts_on : latest),
      form.date || todayString()
    );

    setTimeOptions((current) => [
      ...current,
      makeTimeOption({
        starts_on: addDaysString(latestDate, 1),
        window_start: "18:30",
        window_end: "21:00",
      }),
    ]);
  }

  function removeTimeOption(uid) {
    setTimeOptions((current) => (current.length > 1 ? current.filter((option) => option.uid !== uid) : current));
  }

  function normalizedTimeOptions(options = timeOptions) {
    if (form.planning_type !== "flexible") return [];

    return options
      .map((option) => ({
        uid: option.uid,
        starts_on: option.starts_on || form.date,
        window_start: option.window_start,
        window_end: option.window_end,
      }))
      .sort((a, b) => `${a.starts_on} ${a.window_start}`.localeCompare(`${b.starts_on} ${b.window_start}`));
  }

  function buildTrainingPayload() {
    const isFixed = form.planning_type === "fixed";
    const options = normalizedTimeOptions();
    const firstOption = options[0] || null;
    const startsAt = isFixed ? new Date(`${form.date}T${form.start_time}:00`).toISOString() : null;

    return {
      creator_id: profile.id,
      title: form.title.trim(),
      description: form.description.trim() || "",
      sports: [form.sport_id],
      visibility: form.visibility,
      planning_type: form.planning_type,
      starts_at: startsAt,
      flexible_date: isFixed ? null : firstOption?.starts_on || form.date,
      flexible_start_time: isFixed ? null : firstOption?.window_start || null,
      flexible_end_time: isFixed ? null : firstOption?.window_end || null,
      start_location: form.start_location.trim(),
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
      distance_km: selectedSport?.distance && form.distance_km ? Number(form.distance_km) : null,
      estimated_duration_min: form.estimated_duration_min ? Number(form.estimated_duration_min) : null,
      pace_min: selectedSport?.metric === "pace" ? form.pace_min || null : null,
      pace_max: selectedSport?.metric === "pace" ? form.pace_max || null : null,
      speed_min: selectedSport?.metric === "speed" && form.speed_min ? Number(form.speed_min) : null,
      speed_max: selectedSport?.metric === "speed" && form.speed_max ? Number(form.speed_max) : null,
      intensity_label: selectedSport?.metric === "intensity" ? form.intensity_label || null : null,
      max_participants: form.max_participants ? Number(form.max_participants) : null,
      route_id: selectedSport?.routes && form.route_id ? form.route_id : null,
      workout_id: selectedSport?.workouts && form.workout_id ? form.workout_id : null,
      updated_at: new Date().toISOString(),
    };
  }

  function validateFlexibleOptions() {
    const options = normalizedTimeOptions();

    if (!options.length) {
      return "Add at least one time option.";
    }

    const invalidOption = options.find(
      (option) => !option.starts_on || !option.window_start || !option.window_end || option.window_start >= option.window_end
    );

    if (invalidOption) {
      return "Every time option needs a date and a valid time window.";
    }

    const exactKeys = new Set();
    const duplicate = options.find((option) => {
      const key = `${option.starts_on}-${option.window_start}-${option.window_end}`;
      if (exactKeys.has(key)) return true;
      exactKeys.add(key);
      return false;
    });

    if (duplicate) {
      return "Remove duplicate time windows before creating the training.";
    }

    return "";
  }


  function chooseTrainingPhoto(file) {
    setMessage("");

    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      setMessage("Choose an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage("Training photo is too large. Use an image under 10 MB.");
      return;
    }

    setTrainingCropFile(file);
  }

  function confirmTrainingPhotoCrop({ file, previewUrl }) {
    setTrainingPhotoFile(file);
    setTrainingPhotoPreview(previewUrl);
    setTrainingCropFile(null);
  }

  function removeTrainingPhoto() {
    setTrainingPhotoFile(null);
    setTrainingPhotoPreview("");
    setTrainingCropFile(null);
  }

  async function createTraining(event) {
    event.preventDefault();

    if (!profile?.id || saving) return;

    setSaving(true);
    setMessage("");

    try {
      if (!form.sport_id) {
        setMessage("Choose a sport first.");
        return;
      }

      if (!form.title.trim()) {
        setMessage("Give the training a name.");
        return;
      }

      if (!form.start_location.trim()) {
        setMessage("Start location is required. Use current location or enter a meeting point.");
        return;
      }

      if (!Number.isFinite(Number(form.latitude)) || !Number.isFinite(Number(form.longitude))) {
        const geocoded = await geocodeAddress(form.start_location);
        if (geocoded?.latitude && geocoded?.longitude) {
          setForm((current) => ({
            ...current,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
          }));
          form.latitude = geocoded.latitude;
          form.longitude = geocoded.longitude;
        }
      }

      if (form.planning_type === "fixed") {
        if (!form.date) {
          setMessage("Choose a date.");
          return;
        }

        if (!form.start_time) {
          setMessage("Choose a start time.");
          return;
        }
      }

      if (form.planning_type === "flexible") {
        const flexibleError = validateFlexibleOptions();
        if (flexibleError) {
          setMessage(flexibleError);
          return;
        }
      }

      let uploadedTrainingPhotoUrl = "";

      if (trainingPhotoFile) {
        uploadedTrainingPhotoUrl = await uploadTrainingPhoto({
          supabase,
          userId: profile.id,
          file: trainingPhotoFile,
        });
      }

      const payload = {
        ...buildTrainingPayload(),
        ...(uploadedTrainingPhotoUrl ? { teaser_photo_url: uploadedTrainingPhotoUrl } : {}),
      };

      const { data: trainingRow, error } = await supabase
        .from("training_sessions")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      const { data: existingCreatorParticipant, error: existingCreatorParticipantError } = await supabase
        .from("session_participants")
        .select("id")
        .eq("session_id", trainingRow.id)
        .eq("user_id", profile.id)
        .maybeSingle();

      if (existingCreatorParticipantError) {
        console.warn("Creator auto-join check skipped", existingCreatorParticipantError);
      } else if (!existingCreatorParticipant?.id) {
        const { error: creatorJoinError } = await supabase
          .from("session_participants")
          .insert({
            session_id: trainingRow.id,
            user_id: profile.id,
          });

        if (creatorJoinError) {
          console.warn("Creator auto-join skipped", creatorJoinError);
        }
      }

      if (form.planning_type === "flexible") {
        const optionRows = normalizedTimeOptions().map((option) => ({
          session_id: trainingRow.id,
          starts_on: option.starts_on,
          window_start: option.window_start,
          window_end: option.window_end,
        }));

        const { error: optionsError } = await supabase
          .from("training_time_options")
          .insert(optionRows);

        if (optionsError) {
          console.warn("Planning poll options skipped", optionsError);
        }
      }

      const rawInviteTargets = [...new Set(selectedInviteIds)].filter((id) => id && id !== profile.id);
      const invitePrivacyMap = await fetchPrivacySettingsMap(rawInviteTargets);
      const inviteTargets = rawInviteTargets.filter((inviteeId) =>
        privacyAllowsTrainingInvite(invitePrivacyMap[inviteeId])
      );

      const blockedInviteCount = rawInviteTargets.length - inviteTargets.length;
      if (blockedInviteCount > 0) {
        console.warn(`${blockedInviteCount} invite(s) skipped due to privacy settings.`);
      }

      let createdInviteTargets = [];

      if (inviteTargets.length) {
        const { data: existingInvites, error: existingInviteError } = await supabase
          .from("training_invites")
          .select("invitee_id,status")
          .eq("session_id", trainingRow.id)
          .in("invitee_id", inviteTargets);

        if (existingInviteError) {
          console.warn("Existing invite check skipped", existingInviteError);
        }

        const existingInviteeIds = new Set((existingInvites || []).map((row) => row.invitee_id));
        const missingInviteTargets = inviteTargets.filter((inviteeId) => !existingInviteeIds.has(inviteeId));

        if (missingInviteTargets.length) {
          const inviteRows = missingInviteTargets.map((inviteeId) => ({
            session_id: trainingRow.id,
            inviter_id: profile.id,
            invitee_id: inviteeId,
            status: "pending",
          }));

          const { error: inviteError } = await supabase
            .from("training_invites")
            .insert(inviteRows);

          if (inviteError) {
            console.warn("Training invites skipped", inviteError);
          } else {
            createdInviteTargets = missingInviteTargets;
          }
        }

        if (createdInviteTargets.length) {
          await createNotificationsForUsers(createdInviteTargets, {
            actorId: profile.id,
            type: NOTIFICATION_TYPES.TRAINING_INVITE,
            title: "New training invite",
            body: `${displayName(profile)} invited you to ${payload.title}.`,
            sessionId: trainingRow.id,
            actionUrl: trainingUrl(trainingRow.id),
            metadata: { source: "training_invites" },
          });
        }
      }

      if (form.visibility === "selected") {
        const visibilityUserIds = [...new Set([profile.id, ...inviteTargets])];
        const { data: existingVisibilityRows, error: existingVisibilityError } = await supabase
          .from("training_visibility_members")
          .select("user_id")
          .eq("session_id", trainingRow.id)
          .in("user_id", visibilityUserIds);

        if (existingVisibilityError) {
          console.warn("Selected visibility check skipped", existingVisibilityError);
        }

        const existingVisibilityIds = new Set((existingVisibilityRows || []).map((row) => row.user_id));
        const visibilityRows = visibilityUserIds
          .filter((userId) => !existingVisibilityIds.has(userId))
          .map((userId) => ({
            session_id: trainingRow.id,
            user_id: userId,
          }));

        if (visibilityRows.length) {
          const { error: visibilityError } = await supabase
            .from("training_visibility_members")
            .insert(visibilityRows);

          if (visibilityError) {
            console.warn("Selected visibility members skipped", visibilityError);
          }
        }
      }

      router.replace(`/trainings/${trainingRow.id}`);
    } catch (error) {
      console.error("Create training error", error);
      setMessage(error?.message || "Could not create training.");
    } finally {
      setSaving(false);
    }
  }

  const progressItems = [
    form.sport_id ? "Sport" : null,
    form.title.trim() ? "Name" : null,
    form.planning_type === "fixed" ? "Fixed time" : `${normalizedTimeOptions().length} windows`,
    form.visibility === "selected" ? `${selectedInviteIds.length} invites` : form.visibility,
  ].filter(Boolean);

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.hero}>
          <div style={styles.heroText}>
            <div style={styles.kicker}>Create training</div>
            <h1 style={styles.title}>Plan the session.</h1>
            <p style={styles.subtitle}>
              Sport first, then time, route or workout, visibility and invites. Flexible windows now support multiple days and multiple time blocks per day.
            </p>
          </div>

          <div style={styles.progressCard}>
            <span style={styles.progressKicker}>Setup</span>
            <strong>{progressItems.length}/4 ready</strong>
            <div style={styles.progressChips}>
              {progressItems.map((item) => (
                <span key={item} style={styles.progressChip}>{item}</span>
              ))}
            </div>
          </div>
        </header>

        {message ? <section style={styles.message}>{message}</section> : null}

        {loading ? (
          <section style={styles.card}>Loading create flow...</section>
        ) : !visibleSports.length ? (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Choose preferred sports first</h2>
            <p style={styles.muted}>Your create screen only shows your own preferred sports.</p>
            <button type="button" onClick={() => router.push("/onboarding")} style={styles.primaryButton}>
              Update profile
            </button>
          </section>
        ) : (
          <form onSubmit={createTraining} style={styles.form}>
            <section style={styles.cardHot}>
              <div style={styles.cardKicker}>Step 1</div>
              <h2 style={styles.cardTitle}>Choose sport</h2>
              <div style={styles.sportGrid}>
                {visibleSports.map((sport) => (
                  <button
                    key={sport.id}
                    type="button"
                    onClick={() => updateForm("sport_id", sport.id)}
                    style={form.sport_id === sport.id ? styles.sportButtonActive : styles.sportButton}
                  >
                    {getSportLabel(sport.id)}
                  </button>
                ))}
              </div>
            </section>

            <section style={styles.card}>
              <div style={styles.sectionHeader}>
                <div>
                  <div style={styles.cardKicker}>Step 2</div>
                  <h2 style={styles.cardTitle}>Basics</h2>
                </div>
                <button type="button" onClick={() => updateForm("title", defaultTitle(form.sport_id))} style={styles.tinyButton}>
                  Auto name
                </button>
              </div>

              <label style={styles.label}>
                Training name
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  style={styles.input}
                />
              </label>

              <label style={styles.label}>
                <span style={styles.labelRow}>
                  <span>Start location <strong style={styles.requiredMark}>*</strong></span>
                  <button
                    type="button"
                    onClick={() => useCurrentLocation()}
                    disabled={locationLoading}
                    style={styles.locationButton}
                  >
                    {locationLoading ? "Finding..." : "Use current location"}
                  </button>
                </span>
                <input
                  value={form.start_location}
                  onChange={(event) => setForm((current) => ({ ...current, start_location: event.target.value, latitude: null, longitude: null }))}
                  placeholder="Nearest address or meeting point"
                  required
                  style={styles.input}
                />
                {locationMessage ? <span style={styles.locationHint}>{locationMessage}</span> : null}
              </label>

              <label style={styles.label}>
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="Optional. What should people know?"
                  style={styles.textarea}
                />
              </label>

              <section style={styles.photoSection}>
                <div>
                  <div style={styles.photoTitle}>Training photo</div>
                  <p style={styles.photoText}>
                    Optional, but recommended. Crop and zoom a hero image for this training.
                  </p>
                </div>

                <label style={styles.photoDrop}>
                  {trainingPhotoPreview ? (
                    <img src={trainingPhotoPreview} alt="Training preview" style={styles.photoPreview} />
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

                {trainingPhotoPreview ? (
                  <button type="button" onClick={removeTrainingPhoto} style={styles.tinyButton}>
                    Remove photo
                  </button>
                ) : null}
              </section>
            </section>

            <section style={styles.card}>
              <div style={styles.sectionHeader}>
                <div>
                  <div style={styles.cardKicker}>Step 3</div>
                  <h2 style={styles.cardTitle}>Time</h2>
                </div>
              </div>

              <div style={styles.segmented}>
                <button
                  type="button"
                  onClick={() => updateForm("planning_type", "fixed")}
                  style={form.planning_type === "fixed" ? styles.segmentActive : styles.segment}
                >
                  Fixed time
                </button>

                <button
                  type="button"
                  onClick={() => updateForm("planning_type", "flexible")}
                  style={form.planning_type === "flexible" ? styles.segmentActive : styles.segment}
                >
                  Flexible window
                </button>
              </div>

              {form.planning_type === "fixed" ? (
                <div style={styles.compactGrid}>
                  <label style={styles.label}>
                    Date
                    <input
                      type="date"
                      value={form.date}
                      onChange={(event) => updateForm("date", event.target.value)}
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.label}>
                    Start time
                    <input
                      type="time"
                      value={form.start_time}
                      onChange={(event) => updateForm("start_time", event.target.value)}
                      style={styles.input}
                    />
                  </label>
                </div>
              ) : (
                <div style={styles.timeOptionsBox}>
                  <p style={styles.muted}>
                    Add several possible windows. You can add multiple windows on the same day, for example Monday 16:00-17:30 and Monday 18:30-21:00.
                  </p>

                  <div style={styles.windowSummary}>
                    <strong>{normalizedTimeOptions().length} windows</strong>
                    <span>{groupedTimeOptions.length} day{groupedTimeOptions.length === 1 ? "" : "s"}</span>
                  </div>

                  {groupedTimeOptions.map((group) => (
                    <div key={group.date} style={styles.dayGroup}>
                      <div style={styles.dayHeader}>
                        <strong>{formatDateLabel(group.date)}</strong>
                        <button type="button" onClick={() => addTimeOptionForDate(group.date)} style={styles.smallGhostButton}>
                          + Add slot
                        </button>
                      </div>

                      <div style={styles.slotList}>
                        {group.options.map((option) => (
                          <div key={option.uid} style={styles.timeOptionCard}>
                            <label style={styles.miniLabel}>
                              Date
                              <input
                                type="date"
                                value={option.starts_on}
                                onChange={(event) => updateTimeOption(option.uid, "starts_on", event.target.value)}
                                style={styles.compactInput}
                              />
                            </label>

                            <label style={styles.miniLabel}>
                              From
                              <input
                                type="time"
                                value={option.window_start}
                                onChange={(event) => updateTimeOption(option.uid, "window_start", event.target.value)}
                                style={styles.compactInput}
                              />
                            </label>

                            <label style={styles.miniLabel}>
                              Until
                              <input
                                type="time"
                                value={option.window_end}
                                onChange={(event) => updateTimeOption(option.uid, "window_end", event.target.value)}
                                style={styles.compactInput}
                              />
                            </label>

                            <button type="button" onClick={() => removeTimeOption(option.uid)} style={styles.iconButton} aria-label="Remove time window">
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div style={styles.buttonRow}>
                    <button type="button" onClick={() => addTimeOptionForDate(groupedTimeOptions[0]?.date || form.date)} style={styles.secondaryButton}>
                      + Add slot today
                    </button>
                    <button type="button" onClick={addNextDayOption} style={styles.secondaryButton}>
                      + Add another day
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section style={styles.card}>
              <div style={styles.cardKicker}>Step 4</div>
              <h2 style={styles.cardTitle}>Training details</h2>

              <div style={styles.compactGrid}>
                {selectedSport?.distance ? (
                  <label style={styles.label}>
                    Distance in km
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.distance_km}
                      onChange={(event) => updateForm("distance_km", event.target.value)}
                      placeholder="Optional"
                      style={styles.input}
                    />
                  </label>
                ) : null}

                <label style={styles.label}>
                  Duration in minutes
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.estimated_duration_min}
                    onChange={(event) => updateForm("estimated_duration_min", event.target.value)}
                    placeholder="Optional"
                    style={styles.input}
                  />
                </label>
              </div>

              {selectedSport?.metric === "pace" ? (
                <div style={styles.compactGrid}>
                  <label style={styles.label}>
                    Pace min
                    <input value={form.pace_min} onChange={(event) => updateForm("pace_min", event.target.value)} placeholder="5:00" style={styles.input} />
                  </label>
                  <label style={styles.label}>
                    Pace max
                    <input value={form.pace_max} onChange={(event) => updateForm("pace_max", event.target.value)} placeholder="5:30" style={styles.input} />
                  </label>
                </div>
              ) : null}

              {selectedSport?.metric === "speed" ? (
                <div style={styles.compactGrid}>
                  <label style={styles.label}>
                    Speed min
                    <input type="number" step="0.1" value={form.speed_min} onChange={(event) => updateForm("speed_min", event.target.value)} placeholder="25" style={styles.input} />
                  </label>
                  <label style={styles.label}>
                    Speed max
                    <input type="number" step="0.1" value={form.speed_max} onChange={(event) => updateForm("speed_max", event.target.value)} placeholder="30" style={styles.input} />
                  </label>
                </div>
              ) : null}

              {selectedSport?.metric === "intensity" ? (
                <label style={styles.label}>
                  Intensity
                  <select value={form.intensity_label} onChange={(event) => updateForm("intensity_label", event.target.value)} style={styles.input}>
                    <option value="Easy">Easy</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Hard">Hard</option>
                    <option value="Race pace">Race pace</option>
                  </select>
                </label>
              ) : null}
            </section>

            {selectedSport?.routes ? (
              <section style={styles.card}>
                <div style={styles.cardKicker}>Route</div>
                <h2 style={styles.cardTitle}>Attach route</h2>
                <p style={styles.muted}>Optional for now. Routes make outdoor sessions feel complete in the detail page.</p>

                {filteredRoutes.length ? (
                  <select value={form.route_id} onChange={(event) => updateForm("route_id", event.target.value)} style={styles.input}>
                    <option value="">No route yet</option>
                    {filteredRoutes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.title} {route.distance_km ? `· ${Number(route.distance_km).toFixed(1)} km` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={styles.softBox}>No saved {getSportLabel(form.sport_id)} routes yet. Create the training now and add a route later.</div>
                )}
              </section>
            ) : null}

            {selectedSport?.workouts ? (
              <section style={styles.card}>
                <div style={styles.cardKicker}>Workout</div>
                <h2 style={styles.cardTitle}>Attach workout</h2>
                <p style={styles.muted}>Optional for strength, HYROX, CrossFit and bootcamp style sessions.</p>

                {filteredWorkouts.length ? (
                  <select value={form.workout_id} onChange={(event) => updateForm("workout_id", event.target.value)} style={styles.input}>
                    <option value="">No workout yet</option>
                    {filteredWorkouts.map((workout) => (
                      <option key={workout.id} value={workout.id}>
                        {workout.title} {workout.duration_min ? `· ${workout.duration_min} min` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={styles.softBox}>No saved {getSportLabel(form.sport_id)} workouts yet. Create the training now and add a workout later.</div>
                )}
              </section>
            ) : null}

            <section style={styles.card}>
              <div style={styles.cardKicker}>Step 5</div>
              <h2 style={styles.cardTitle}>Visibility</h2>

              <div style={styles.visibilityGrid}>
                {[
                  ["public", "Public", "All Endurance users"],
                  ["team", "Team", "Team Up partners"],
                  ["selected", "Selected", "Only invited people"],
                  ["private", "Private", "Only me"],
                ].map(([value, label, description]) => (
                  <button key={value} type="button" onClick={() => updateForm("visibility", value)} style={form.visibility === value ? styles.visibilityActive : styles.visibilityButton}>
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </button>
                ))}
              </div>

              <label style={styles.label}>
                Max participants
                <input type="number" min="0" value={form.max_participants} onChange={(event) => updateForm("max_participants", event.target.value)} placeholder="Optional" style={styles.input} />
              </label>
            </section>

            <section style={styles.card}>
              <div style={styles.sectionHeader}>
                <div>
                  <div style={styles.cardKicker}>Step 6</div>
                  <h2 style={styles.cardTitle}>Invite people</h2>
                </div>
                {selectedInviteIds.length ? <span style={styles.countBadge}>{selectedInviteIds.length} selected</span> : null}
              </div>
              <p style={styles.muted}>Selected people receive an invite in their Inbox. For selected visibility, invitees are also added to the visibility list.</p>

              {partners.length ? (
                <div style={styles.partnerList}>
                  {partners.map((partner) => {
                    const selected = selectedInviteIds.includes(partner.id);
                    return (
                      <button key={partner.id} type="button" onClick={() => toggleInvite(partner.id)} style={selected ? styles.partnerActive : styles.partnerButton}>
                        {partner.avatar_url ? <img src={partner.avatar_url} alt="" style={styles.avatar} /> : <span style={styles.avatarFallback}>{initials(partner)}</span>}
                        <span style={styles.partnerText}>
                          <strong>{displayName(partner)}</strong>
                          <span>{selected ? "Will receive invite" : "Tap to invite"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p style={styles.muted}>No Team Up partners yet. You can invite people later.</p>
              )}
            </section>

            <section style={styles.submitBar}>
              <button type="button" onClick={() => router.push("/trainings")} style={styles.secondaryButton}>
                Cancel
              </button>
              <button type="submit" disabled={saving} style={styles.primaryButton}>
                {saving ? "Creating..." : "Create training"}
              </button>
            </section>
          </form>
        )}
      </section>

      {trainingCropFile ? (
        <ImageCropperModal
          file={trainingCropFile}
          mode="trainingHero"
          title="Crop training photo"
          onCancel={() => setTrainingCropFile(null)}
          onConfirm={confirmTrainingPhotoCrop}
        />
      ) : null}
    </main>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 14px 56px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
  },
  shell: {
    width: "100%",
    maxWidth: 920,
    margin: "0 auto",
    display: "grid",
    gap: 16,
    boxSizing: "border-box",
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 12,
  },
  heroText: { display: "grid", gap: 10, minWidth: 0 },
  kicker: {
    color: "#e4ef16",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(42px, 11vw, 74px)",
    lineHeight: 0.92,
    letterSpacing: "-0.075em",
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
    maxWidth: 720,
  },
  progressCard: {
    borderRadius: 26,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    display: "grid",
    gap: 8,
    minWidth: 0,
  },
  progressKicker: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  progressChips: { display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 },
  progressChip: {
    borderRadius: 999,
    padding: "6px 9px",
    background: "rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: 850,
  },
  message: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  form: { display: "grid", gap: 14, minWidth: 0 },
  card: {
    borderRadius: 30,
    padding: 16,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
    minWidth: 0,
    boxSizing: "border-box",
  },
  cardHot: {
    borderRadius: 30,
    padding: 16,
    background: "linear-gradient(145deg, rgba(228,239,22,0.13), rgba(255,255,255,0.045))",
    border: "1px solid rgba(228,239,22,0.24)",
    display: "grid",
    gap: 14,
    boxShadow: "0 0 34px rgba(228,239,22,0.10)",
    minWidth: 0,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
  },
  cardKicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  cardTitle: {
    margin: 0,
    fontSize: "clamp(28px, 8vw, 44px)",
    lineHeight: 0.96,
    letterSpacing: "-0.065em",
  },
  muted: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.5 },
  sportGrid: { display: "flex", flexWrap: "wrap", gap: 8, minWidth: 0 },
  sportButton: {
    minHeight: 44,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  sportButtonActive: {
    minHeight: 44,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.30)",
    background: "#e4ef16",
    color: "#101406",
    padding: "0 13px",
    fontWeight: 950,
    cursor: "pointer",
  },
  label: {
    display: "grid",
    gap: 8,
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    fontWeight: 850,
    minWidth: 0,
  },
  labelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  requiredMark: {
    color: "#e4ef16",
  },
  locationButton: {
    minHeight: 34,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.22)",
    background: "rgba(228,239,22,0.08)",
    color: "#e4ef16",
    padding: "0 11px",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  locationHint: {
    color: "rgba(255,255,255,0.56)",
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 700,
  },
  miniLabel: {
    display: "grid",
    gap: 5,
    color: "rgba(255,255,255,0.70)",
    fontSize: 11,
    fontWeight: 900,
    minWidth: 0,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  input: {
    width: "100%",
    minHeight: 52,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.045)",
    color: "white",
    padding: "0 14px",
    boxSizing: "border-box",
    fontSize: 16,
    outline: "none",
  },
  compactInput: {
    width: "100%",
    minHeight: 42,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.055)",
    color: "white",
    padding: "0 9px",
    boxSizing: "border-box",
    fontSize: 14,
    outline: "none",
  },
  textarea: {
    width: "100%",
    minHeight: 92,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.045)",
    color: "white",
    padding: 14,
    boxSizing: "border-box",
    fontSize: 16,
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
  },
  compactGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, minWidth: 0 },
  segmented: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, minWidth: 0 },
  segment: {
    minHeight: 46,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.07)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  segmentActive: {
    minHeight: 46,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.30)",
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    cursor: "pointer",
  },
  timeOptionsBox: { display: "grid", gap: 12, minWidth: 0 },
  windowSummary: {
    borderRadius: 18,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.78)",
    flexWrap: "wrap",
  },
  dayGroup: {
    borderRadius: 22,
    padding: 10,
    background: "rgba(0,0,0,0.20)",
    border: "1px solid rgba(255,255,255,0.10)",
    display: "grid",
    gap: 10,
    minWidth: 0,
  },
  dayHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0, flexWrap: "wrap" },
  slotList: { display: "grid", gap: 8, minWidth: 0 },
  timeOptionCard: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    alignItems: "end",
    overflow: "hidden",
    borderRadius: 18,
    padding: 10,
    background: "rgba(255,255,255,0.055)",
    minWidth: 0,
    boxSizing: "border-box",
  },
  buttonRow: { display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0 },
  smallGhostButton: {
    minHeight: 32,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.07)",
    color: "white",
    padding: "0 10px",
    fontWeight: 900,
    cursor: "pointer",
  },
  tinyButton: {
    minHeight: 34,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.07)",
    color: "white",
    padding: "0 10px",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  iconButton: {
    width: 36,
    height: 42,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.07)",
    color: "white",
    fontSize: 22,
    fontWeight: 800,
    cursor: "pointer",
  },
  softBox: {
    borderRadius: 18,
    padding: 13,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.45,
  },
  visibilityGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, minWidth: 0 },
  visibilityButton: {
    minHeight: 76,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.055)",
    color: "white",
    padding: 12,
    display: "grid",
    gap: 4,
    textAlign: "left",
    cursor: "pointer",
  },
  visibilityActive: {
    minHeight: 76,
    borderRadius: 22,
    border: "1px solid rgba(228,239,22,0.30)",
    background: "rgba(228,239,22,0.13)",
    color: "white",
    padding: 12,
    display: "grid",
    gap: 4,
    textAlign: "left",
    cursor: "pointer",
  },
  countBadge: {
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(228,239,22,0.13)",
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  partnerList: { display: "grid", gap: 10, minWidth: 0 },
  partnerButton: {
    width: "100%",
    border: 0,
    borderRadius: 22,
    padding: 10,
    background: "rgba(255,255,255,0.055)",
    color: "white",
    display: "grid",
    gridTemplateColumns: "46px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
  },
  partnerActive: {
    width: "100%",
    border: "1px solid rgba(228,239,22,0.28)",
    borderRadius: 22,
    padding: 10,
    background: "rgba(228,239,22,0.12)",
    color: "white",
    display: "grid",
    gridTemplateColumns: "46px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
  },
  avatar: { width: 46, height: 46, borderRadius: 999, objectFit: "cover" },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.14)",
    color: "#e4ef16",
    fontWeight: 950,
  },
  partnerText: { display: "grid", gap: 3, color: "rgba(255,255,255,0.62)", minWidth: 0 },
  submitBar: {
    position: "sticky",
    bottom: 14,
    zIndex: 5,
    borderRadius: 26,
    padding: 12,
    background: "rgba(9,12,9,0.92)",
    border: "1px solid rgba(255,255,255,0.12)",
    backdropFilter: "blur(18px)",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    minWidth: 0,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "pointer",
  },

  photoSection: {
    display: "grid",
    gap: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    borderRadius: 24,
    padding: 14,
  },
  photoTitle: {
    color: "#fff",
    fontWeight: 950,
    fontSize: 18,
    letterSpacing: "-0.03em",
  },
  photoText: {
    margin: "5px 0 0",
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 650,
  },
  photoDrop: {
    position: "relative",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    minHeight: 160,
    borderRadius: 22,
    border: "1px dashed rgba(215,255,63,0.42)",
    background: "rgba(215,255,63,0.08)",
    cursor: "pointer",
  },
  photoPreview: {
    width: "100%",
    height: "100%",
    minHeight: 160,
    objectFit: "cover",
    display: "block",
  },
  photoPlaceholder: {
    color: "#d7ff3f",
    fontWeight: 950,
  },
  hiddenFileInput: {
    display: "none",
  },
};
