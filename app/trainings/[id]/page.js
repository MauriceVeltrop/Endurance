"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { subscribeToTrainingRealtime, removeRealtimeChannel } from "../../../lib/realtime";
import TrainingLiveStatus from "../../../components/realtime/TrainingLiveStatus";
import PlanningPoll from "../../../components/trainings/PlanningPoll";
import OSMRouteMap from "../../../components/OSMRouteMap";
import { downloadTrainingIcs, getTrainingStart } from "../../../lib/trainingCalendar";
import { createNotification, createNotificationsForUsers, NOTIFICATION_TYPES, trainingUrl } from "../../../lib/notifications";
import BottomNav from "../../../components/BottomNav";
import { getTrainingHeroImage } from "../../../lib/sportImages";

const sportLabels = {
  running: "Running",
  trail_running: "Trail Running",
  road_cycling: "Road Cycling",
  gravel_cycling: "Gravel Cycling",
  mountain_biking: "Mountain Biking",
  walking: "Walking",
  kayaking: "Kayaking",
  strength_training: "Strength Training",
  crossfit: "CrossFit",
  hyrox: "HYROX",
  bootcamp: "Bootcamp",
  swimming: "Swimming",
  padel: "Padel",
};

function getSportLabel(id) {
  return sportLabels[id] || id || "Training";
}

function getPrimarySport(training) {
  const sports = Array.isArray(training?.sports) ? training.sports : [];
  return sports[0] || "";
}

function formatTime(training) {
  if (!training) return "";

  const start = training.final_starts_at || training.starts_at;

  if (start) {
    try {
      return new Date(start).toLocaleString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Time set";
    }
  }

  if (training.flexible_date) {
    const from = training.flexible_start_time?.slice(0, 5) || "?";
    const until = training.flexible_end_time?.slice(0, 5) || "?";
    return `${training.flexible_date} · ${from}–${until}`;
  }

  return "Time not set";
}

function formatEffort(training) {
  if (!training) return "Not set";

  if (training.pace_min || training.pace_max) {
    return [training.pace_min, training.pace_max].filter(Boolean).join(" – ");
  }

  if (training.speed_min || training.speed_max) {
    return `${[training.speed_min, training.speed_max].filter(Boolean).join(" – ")} km/h`;
  }

  return training.intensity_label || "Not set";
}

function mapsUrl(location, latitude, longitude) {
  if (Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  if (!location) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}


function getRoutePointArray(routePoints) {
  if (!routePoints) return [];
  if (Array.isArray(routePoints)) return routePoints;
  if (Array.isArray(routePoints.points)) return routePoints.points;
  return [];
}

function normalizeRoutePoint(point) {
  return {
    lat: Number(point?.lat ?? point?.latitude),
    lon: Number(point?.lon ?? point?.lng ?? point?.longitude),
    ele: point?.ele ?? point?.elevation ?? null,
  };
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildGpxFromRoute(route) {
  const points = getRoutePointArray(route?.route_points)
    .map(normalizeRoutePoint)
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

  if (points.length < 2) return "";

  const name = escapeXml(route?.title || "Endurance route");
  const trkpts = points
    .map((point) => {
      const ele = Number.isFinite(Number(point.ele)) ? `
        <ele>${Number(point.ele).toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${point.lat}" lon="${point.lon}">${ele}
      </trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Endurance" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

function downloadTextFile(filename, text, type = "application/gpx+xml") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function displayName(person) {
  return person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.email || "Endurance athlete";
}


function getWeatherStartDate(training) {
  const start = getTrainingStart(training);
  if (!start) return null;
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isWithinWeatherWindow(date) {
  if (!date) return false;
  const now = new Date();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return date.getTime() - now.getTime() <= sevenDaysMs;
}

function weatherCodeText(code) {
  if (code === 0) return "Clear";
  if ([1, 2].includes(code)) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunder";
  return "Forecast";
}

function isNightHour(date) {
  if (!date) return false;
  const hour = date.getHours();
  return hour >= 21 || hour < 6;
}

function weatherIcon(code, date) {
  if (code === 0) return isNightHour(date) ? "🌙" : "☀️";
  if ([1, 2].includes(code)) return isNightHour(date) ? "🌙" : "⛅";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌤️";
}

function getNearestHourlyIndex(times, targetDate) {
  if (!Array.isArray(times) || !targetDate) return -1;
  let bestIndex = -1;
  let bestDiff = Infinity;

  times.forEach((time, index) => {
    const value = new Date(time).getTime();
    if (Number.isNaN(value)) return;
    const diff = Math.abs(value - targetDate.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });

  return bestIndex;
}


const routeSportIds = new Set(["running", "trail_running", "road_cycling", "gravel_cycling", "mountain_biking", "walking", "kayaking"]);
const workoutSportIds = new Set(["strength_training", "crossfit", "hyrox", "bootcamp"]);

function supportsRoutePreview(training) {
  const sports = Array.isArray(training?.sports) ? training.sports : [];
  return sports.some((sport) => routeSportIds.has(sport));
}

function supportsWorkoutPreview(training) {
  const sports = Array.isArray(training?.sports) ? training.sports : [];
  return sports.some((sport) => workoutSportIds.has(sport));
}

function getWorkoutBlockCount(workout) {
  const exercises = workout?.structure?.exercises;
  if (Array.isArray(exercises)) return exercises.length;
  const blocks = workout?.structure?.blocks;
  if (Array.isArray(blocks)) return blocks.length;
  return 0;
}

function WeatherForecastCard({ training }) {
  const [status, setStatus] = useState("idle");
  const [forecast, setForecast] = useState(null);

  const startDate = getWeatherStartDate(training);
  const location = training?.start_location || "";
  const latitude = Number(training?.latitude);
  const longitude = Number(training?.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const canTryForecast = Boolean(startDate && location && isWithinWeatherWindow(startDate));

  useEffect(() => {
    let cancelled = false;

    async function loadForecast() {
      setForecast(null);

      if (!startDate || !location) {
        setStatus("missing");
        return;
      }

      if (!isWithinWeatherWindow(startDate)) {
        setStatus("too_early");
        return;
      }

      try {
        setStatus("loading");

        const params = new URLSearchParams({
          time: startDate.toISOString(),
          location,
        });

        if (hasCoordinates) {
          params.set("latitude", String(latitude));
          params.set("longitude", String(longitude));
        }

        const response = await fetch(`/api/weather?${params.toString()}`);
        const data = await response.json();

        if (!response.ok || !data?.ok || !data?.forecast) {
          if (!cancelled) setStatus("unavailable");
          return;
        }

        if (!cancelled) {
          setForecast(data.forecast);
          setStatus("ready");
        }
      } catch (error) {
        console.error("Weather forecast error", error);
        if (!cancelled) setStatus("unavailable");
      }
    }

    loadForecast();

    return () => {
      cancelled = true;
    };
  }, [
    training?.id,
    training?.start_location,
    training?.latitude,
    training?.longitude,
    training?.starts_at,
    training?.final_starts_at,
  ]);

  let body = null;

  if (!startDate) {
    body = <span style={styles.weatherMuted}>Available after the final start time is set.</span>;
  } else if (!location) {
    body = <span style={styles.weatherMuted}>Set a start location to show weather.</span>;
  } else if (!canTryForecast) {
    const availableFrom = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    body = (
      <>
        <strong style={styles.weatherSoon}>Available soon</strong>
        <span style={styles.weatherMuted}>
          From {availableFrom.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </>
    );
  } else if (status === "loading") {
    body = <span style={styles.weatherMuted}>Loading forecast...</span>;
  } else if (status === "ready" && forecast) {
    const forecastDate = forecast.forecastTime ? new Date(forecast.forecastTime) : startDate;
    const night = Boolean(forecast.isNight) || isNightHour(forecastDate);

    body = (
      <>
        <div style={styles.weatherMainRow}>
          <span style={styles.weatherIcon}>{forecast.icon || weatherIcon(forecast.code, forecastDate)}</span>
          <span style={styles.weatherTemperature}>{forecast.temperature}°C</span>
        </div>
        <span style={styles.weatherCondition}>{forecast.condition || weatherCodeText(forecast.code)}</span>
        <div style={styles.weatherDetails}>
          <span>☔ {forecast.precipitation ?? "—"}%</span>
          <span>💨 {forecast.wind} km/h</span>
          <span>{night ? "🌙 Night" : `☀️ UV ${forecast.uv ?? "—"}`}</span>
        </div>
        <span style={styles.weatherSource}>
          {forecast.source || "Weather forecast"} · indicative hourly forecast
        </span>
      </>
    );
  } else {
    body = <span style={styles.weatherMuted}>Forecast unavailable. Save this training with current-location coordinates.</span>;
  }

  return (
    <div style={{ ...styles.quickCard, ...styles.weatherCard }}>
      <span>{forecast?.providerLabel ? `${forecast.providerLabel} indication` : "Forecast indication"}</span>
      {body}
    </div>
  );
}

function initials(person) {
  return displayName(person)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function TrainingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [user, setUser] = useState(null);
  const [training, setTraining] = useState(null);
  const [route, setRoute] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantProfiles, setParticipantProfiles] = useState({});
  const [sessionAvailabilityRows, setSessionAvailabilityRows] = useState([]);
  const [sessionAvailabilityForm, setSessionAvailabilityForm] = useState({
    available_from: "",
    available_until: "",
    note: "",
  });
  const [finalStartForm, setFinalStartForm] = useState({
    date: "",
    time: "",
  });
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [teamPartners, setTeamPartners] = useState([]);
  const [trainingInvites, setTrainingInvites] = useState([]);
  const [invitePanelOpen, setInvitePanelOpen] = useState(false);
  const [inviteBusyId, setInviteBusyId] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");

  const primarySport = getPrimarySport(training);
  const sportLabel = getSportLabel(primarySport);
  const participantCount = participants.length;
  const isFull = Boolean(training?.max_participants && participantCount >= Number(training.max_participants));
  const canManage = Boolean(user?.id && training?.creator_id === user.id);
  const heroImage = getTrainingHeroImage(training, primarySport);

  useEffect(() => {
    loadTraining();

    const channel = subscribeToTrainingRealtime(id, () => {
      loadTraining({ silent: true });
    });

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [id]);

  async function loadTraining(options = {}) {
    if (!id) return;

    if (!options.silent) setLoading(true);
    setErrorText("");
    setMessage("");
    setAvailabilityMessage("");
    if (!options.silent) setInviteMessage("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user || null;
      setUser(currentUser);

      if (!currentUser?.id) {
        router.replace("/login");
        return;
      }

      const { data: trainingRow, error: trainingError } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (trainingError) throw trainingError;

      if (!trainingRow) {
        setErrorText("Training not found.");
        setTraining(null);
        return;
      }

      setTraining(trainingRow);

      const finalStart = trainingRow.final_starts_at || trainingRow.starts_at || "";
      if (finalStart) {
        const finalDate = new Date(finalStart);
        if (!Number.isNaN(finalDate.getTime())) {
          setFinalStartForm({
            date: finalDate.toISOString().slice(0, 10),
            time: finalDate.toTimeString().slice(0, 5),
          });
        }
      } else {
        setFinalStartForm({
          date: trainingRow.flexible_date || "",
          time: trainingRow.flexible_start_time?.slice(0, 5) || "",
        });
      }

      if (trainingRow.route_id) {
        const { data: routeRow } = await supabase
          .from("routes")
          .select("id,title,description,sport_id,distance_km,elevation_gain_m,route_points,gpx_file_url,visibility")
          .eq("id", trainingRow.route_id)
          .maybeSingle();

        setRoute(routeRow || null);
      } else {
        setRoute(null);
      }

      if (trainingRow.workout_id) {
        const { data: workoutRow } = await supabase
          .from("workouts")
          .select("id,title,description,sport_id,workout_type,level,duration_min,structure,visibility")
          .eq("id", trainingRow.workout_id)
          .maybeSingle();

        setWorkout(workoutRow || null);
      } else {
        setWorkout(null);
      }

      const { data: participantRows } = await supabase
        .from("session_participants")
        .select("id,user_id,created_at")
        .eq("session_id", id)
        .order("created_at", { ascending: true });

      const rows = participantRows || [];
      setParticipants(rows);
      setJoined(rows.some((row) => row.user_id === currentUser.id));

      const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];

      if (userIds.length) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,email,avatar_url,role,location")
          .in("id", userIds);

        setParticipantProfiles(Object.fromEntries((profileRows || []).map((profile) => [profile.id, profile])));
      } else {
        setParticipantProfiles({});
      }

      const { data: partnerRows } = await supabase
        .from("training_partners")
        .select("requester_id,addressee_id,status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);

      const partnerIds = [
        ...new Set(
          (partnerRows || [])
            .map((row) => (row.requester_id === currentUser.id ? row.addressee_id : row.requester_id))
            .filter(Boolean)
        ),
      ];

      if (partnerIds.length) {
        const { data: partnerProfiles } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,email,avatar_url,location")
          .in("id", partnerIds)
          .order("name", { ascending: true });

        setTeamPartners(partnerProfiles || []);
      } else {
        setTeamPartners([]);
      }

      const { data: inviteRows } = await supabase
        .from("training_invites")
        .select("id,session_id,invitee_id,status,response_note,created_at")
        .eq("session_id", trainingRow.id);

      setTrainingInvites(inviteRows || []);

      if (trainingRow.planning_type === "flexible") {
        const { data: availabilityRows } = await supabase
          .from("session_availability")
          .select("id,session_id,user_id,available_from,available_until,note,created_at")
          .eq("session_id", trainingRow.id)
          .order("created_at", { ascending: true });

        const availability = availabilityRows || [];
        setSessionAvailabilityRows(availability);

        const ownAvailability = availability.find((row) => row.user_id === currentUser.id);

        setSessionAvailabilityForm({
          available_from: ownAvailability?.available_from?.slice(0, 5) || "",
          available_until: ownAvailability?.available_until?.slice(0, 5) || "",
          note: ownAvailability?.note || "",
        });
      } else {
        setSessionAvailabilityRows([]);
        setSessionAvailabilityForm({
          available_from: "",
          available_until: "",
          note: "",
        });
      }
    } catch (error) {
      console.error("Training detail load error", error);
      setErrorText(error?.message || "Could not open training.");
      setTraining(null);
    } finally {
      setLoading(false);
    }
  }

  async function toggleJoin() {
    if (!user?.id || !training?.id) return;

    setBusy(true);
    setMessage("");

    try {
      if (joined) {
        const { error } = await supabase
          .from("session_participants")
          .delete()
          .eq("session_id", training.id)
          .eq("user_id", user.id);

        if (error) throw error;

        if (training.creator_id && training.creator_id !== user.id) {
          await createNotification({
            userId: training.creator_id,
            actorId: user.id,
            type: NOTIFICATION_TYPES.TRAINING_LEFT,
            sessionId: training.id,
            title: "Someone left your training",
            body: `${displayName(participantProfiles[user.id] || user)} left ${training.title}.`,
            actionUrl: trainingUrl(training.id),
            metadata: { source: "leave_training" },
          });
        }

        setMessage("You left this training.");
      } else {
        if (isFull) {
          setMessage("This training is full.");
          return;
        }

        const { data: existingParticipant, error: existingParticipantError } = await supabase
          .from("session_participants")
          .select("id")
          .eq("session_id", training.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (existingParticipantError) throw existingParticipantError;

        if (!existingParticipant?.id) {
          const { error } = await supabase
            .from("session_participants")
            .insert({
              session_id: training.id,
              user_id: user.id,
            });

          if (error) throw error;
        }

        if (training.creator_id && training.creator_id !== user.id) {
          await createNotification({
            userId: training.creator_id,
            actorId: user.id,
            type: NOTIFICATION_TYPES.TRAINING_JOINED,
            sessionId: training.id,
            title: "Someone joined your training",
            body: `${displayName(participantProfiles[user.id] || user)} joined ${training.title}.`,
            actionUrl: trainingUrl(training.id),
            metadata: { source: "join_training" },
          });
        }

        setMessage("You joined this training.");
      }

      await loadTraining();
    } catch (error) {
      console.error("Join error", error);
      setMessage(error?.message || "Could not update participation.");
    } finally {
      setBusy(false);
    }
  }

  async function invitePartner(partner) {
    if (!user?.id || !training?.id || !partner?.id || !canManage) return;

    setInviteBusyId(partner.id);
    setInviteMessage("");

    try {
      const { data: existingInvite, error: existingInviteError } = await supabase
        .from("training_invites")
        .select("id,status")
        .eq("session_id", training.id)
        .eq("invitee_id", partner.id)
        .maybeSingle();

      if (existingInviteError) throw existingInviteError;

      if (existingInvite?.id) {
        setInviteMessage(`${displayName(partner)} already has an invite.`);
        await loadTraining({ silent: true });
        return;
      }

      const { error: inviteError } = await supabase
        .from("training_invites")
        .insert({
          session_id: training.id,
          inviter_id: user.id,
          invitee_id: partner.id,
          status: "pending",
        });

      if (inviteError) throw inviteError;

      if (training.visibility === "selected") {
        const { data: existingVisibilityMember } = await supabase
          .from("training_visibility_members")
          .select("id")
          .eq("session_id", training.id)
          .eq("user_id", partner.id)
          .maybeSingle();

        if (!existingVisibilityMember?.id) {
          const { error: visibilityError } = await supabase
            .from("training_visibility_members")
            .insert({
              session_id: training.id,
              user_id: partner.id,
            });

          if (visibilityError) console.warn("Training visibility member skipped", visibilityError);
        }
      }

      await createNotification({
        userId: partner.id,
        actorId: user.id,
        type: NOTIFICATION_TYPES.TRAINING_INVITE,
        sessionId: training.id,
        title: "New training invite",
        body: `${displayName(user)} invited you to ${training.title}.`,
        actionUrl: trainingUrl(training.id),
        metadata: { source: "training_detail_invite" },
      });

      setInviteMessage(`Invite sent to ${displayName(partner)}.`);
      await loadTraining({ silent: true });
    } catch (error) {
      console.error("Invite error", error);
      setInviteMessage(error?.message || "Could not send invite.");
    } finally {
      setInviteBusyId("");
    }
  }

  async function deleteTraining() {
    if (!canManage || !training?.id) return;

    const confirmed = window.confirm("Delete this training?");
    if (!confirmed) return;

    setBusy(true);

    try {
      await supabase.from("session_participants").delete().eq("session_id", training.id);

      const { error } = await supabase
        .from("training_sessions")
        .delete()
        .eq("id", training.id)
        .eq("creator_id", user.id);

      if (error) throw error;

      router.replace("/trainings");
    } catch (error) {
      console.error("Delete error", error);
      setMessage(error?.message || "Could not delete training.");
    } finally {
      setBusy(false);
    }
  }

  function updateSessionAvailabilityForm(key, value) {
    setSessionAvailabilityForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveSessionAvailability() {
    if (!user?.id || !training?.id || training.planning_type !== "flexible") return;

    setAvailabilityBusy(true);
    setAvailabilityMessage("");

    try {
      if (!sessionAvailabilityForm.available_from || !sessionAvailabilityForm.available_until) {
        setAvailabilityMessage("Choose both a start and end time.");
        return;
      }

      if (sessionAvailabilityForm.available_from >= sessionAvailabilityForm.available_until) {
        setAvailabilityMessage("End time must be after start time.");
        return;
      }

      const existing = sessionAvailabilityRows.find((row) => row.user_id === user.id);

      if (existing?.id) {
        const { error } = await supabase
          .from("session_availability")
          .update({
            available_from: sessionAvailabilityForm.available_from,
            available_until: sessionAvailabilityForm.available_until,
            note: sessionAvailabilityForm.note.trim() || null,
          })
          .eq("id", existing.id)
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("session_availability")
          .insert({
            session_id: training.id,
            user_id: user.id,
            available_from: sessionAvailabilityForm.available_from,
            available_until: sessionAvailabilityForm.available_until,
            note: sessionAvailabilityForm.note.trim() || null,
          });

        if (error) throw error;
      }

      if (training.creator_id && training.creator_id !== user.id) {
        await createNotification({
          userId: training.creator_id,
          actorId: user.id,
          type: NOTIFICATION_TYPES.AVAILABILITY_RESPONSE,
          sessionId: training.id,
          title: "Availability updated",
          body: `${displayName(participantProfiles[user.id] || user)} shared availability for ${training.title}.`,
          actionUrl: trainingUrl(training.id),
          metadata: { source: "session_availability" },
        });
      }

      setAvailabilityMessage("Your time frame has been saved.");
      await loadTraining();
    } catch (error) {
      console.error("Availability error", error);
      setAvailabilityMessage(error?.message || "Could not save your time frame.");
    } finally {
      setAvailabilityBusy(false);
    }
  }

  async function clearSessionAvailability() {
    if (!user?.id || !training?.id) return;

    setAvailabilityBusy(true);
    setAvailabilityMessage("");

    try {
      const existing = sessionAvailabilityRows.find((row) => row.user_id === user.id);

      if (existing?.id) {
        const { error } = await supabase
          .from("session_availability")
          .delete()
          .eq("id", existing.id)
          .eq("user_id", user.id);

        if (error) throw error;
      }

      setSessionAvailabilityForm({
        available_from: "",
        available_until: "",
        note: "",
      });
      setAvailabilityMessage("Your time frame has been cleared.");
      await loadTraining();
    } catch (error) {
      console.error("Clear availability error", error);
      setAvailabilityMessage(error?.message || "Could not clear your time frame.");
    } finally {
      setAvailabilityBusy(false);
    }
  }

  function updateFinalStartForm(key, value) {
    setFinalStartForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveFinalStartTime() {
    if (!canManage || !training?.id || training.planning_type !== "flexible") return;

    setBusy(true);
    setMessage("");

    try {
      if (!finalStartForm.date || !finalStartForm.time) {
        setMessage("Choose a final date and start time.");
        return;
      }

      const finalStartsAt = new Date(`${finalStartForm.date}T${finalStartForm.time}:00`).toISOString();

      const { error } = await supabase
        .from("training_sessions")
        .update({
          final_starts_at: finalStartsAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", training.id)
        .eq("creator_id", user.id);

      if (error) throw error;

      const notifyUserIds = participants
        .map((participant) => participant.user_id)
        .filter((participantUserId) => participantUserId && participantUserId !== user.id);

      await createNotificationsForUsers(notifyUserIds, {
        actorId: user.id,
        type: NOTIFICATION_TYPES.FINAL_TIME_SET,
        sessionId: training.id,
        title: "Final start time selected",
        body: `${training.title} now has a final start time.`,
        actionUrl: trainingUrl(training.id),
        metadata: { final_starts_at: finalStartsAt, source: "final_time" },
      });

      setMessage("Final start time saved.");
      await loadTraining();
    } catch (error) {
      console.error("Final start time error", error);
      setMessage(error?.message || "Could not save final start time.");
    } finally {
      setBusy(false);
    }
  }

  function addToCalendar() {
    if (!training) return;

    try {
      downloadTrainingIcs(training);
      setMessage("Calendar file downloaded.");
    } catch (error) {
      setMessage(error?.message || "Could not create calendar file.");
    }
  }

  async function shareTraining() {
    if (!training) return;

    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = training.title || "Endurance training";
    const text = `${title}${training.start_location ? ` · ${training.start_location}` : ""}`;

    try {
      if (navigator?.share) {
        await navigator.share({ title, text, url });
        return;
      }

      if (navigator?.clipboard && url) {
        await navigator.clipboard.writeText(url);
        setMessage("Training link copied.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        setMessage("Could not share this training.");
      }
    }
  }


  function downloadRouteGpx() {
    if (!route) return;

    if (route.gpx_file_url) {
      window.open(route.gpx_file_url, "_blank", "noopener,noreferrer");
      return;
    }

    const gpx = buildGpxFromRoute(route);

    if (!gpx) {
      setMessage("No GPX data available for this route.");
      return;
    }

    const safeTitle = (route.title || training?.title || "endurance-route")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "endurance-route";

    downloadTextFile(`${safeTitle}.gpx`, gpx);
    setMessage("GPX file downloaded.");
  }

  return (
    <main style={styles.pageV3}>
      <section style={styles.shellV3}>
        {loading ? (
          <section style={styles.stateCard}>
            <h1 style={styles.stateTitle}>Loading training...</h1>
            <p style={styles.muted}>Opening the session.</p>
          </section>
        ) : null}

        {errorText ? (
          <section style={styles.errorCard}>
            <h1 style={styles.stateTitle}>Could not open training</h1>
            <p style={styles.muted}>{errorText}</p>
            <button type="button" onClick={loadTraining} style={styles.secondaryButton}>
              Try again
            </button>
          </section>
        ) : null}

        {!loading && training ? (
          <>
            <article
              style={{
                ...styles.heroImageCard,
                backgroundImage: heroImage?.src
                  ? `linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.50) 42%, rgba(0,0,0,0.92) 100%), url(${heroImage.src})`
                  : styles.heroImageCard.backgroundImage,
                backgroundPosition: heroImage?.position || "center center",
              }}
            >
              <div style={styles.heroTopActionsV3}>
                <Link href="/trainings" style={styles.backLinkV3}>← Back to trainings</Link>
                <div style={styles.topIconActions}>
                  <button type="button" onClick={shareTraining} style={styles.iconButtonV3} aria-label="Share training">⇧</button>
                  {canManage ? <Link href={`/trainings/${training.id}/edit`} style={styles.iconLinkV3} aria-label="Edit training">•••</Link> : null}
                </div>
              </div>

              <div style={styles.heroContentV3}>
                <div style={styles.badgeRow}>
                  <span style={styles.sportBadge}>🥾 {sportLabel}</span>
                  <span style={styles.visibilityBadge}>{training.visibility}</span>
                </div>

                <h1 style={styles.titleV3}>{training.title}</h1>

                {training.description ? <p style={styles.descriptionV3}>{training.description}</p> : null}

                <div style={styles.heroMetaStackV3}>
                  <span>▣ {formatTime(training)}</span>
                  <span>⌖ {training.start_location || "Location not set"}</span>
                </div>

                <div style={styles.liveRowV3}>
                  <span>{participantCount} joined</span>
                  <span style={styles.liveDotV3}>●</span>
                  <TrainingLiveStatus participants={participants} />
                </div>
              </div>
            </article>

            {message ? <div style={styles.message}>{message}</div> : null}

            <PlanningPoll
              training={training}
              user={user}
              canManage={canManage}
              onChanged={loadTraining}
            />

            {route ? (
              <section style={styles.routeHeroCardV3}>
                <div style={styles.mapFrameV3}>
                  <OSMRouteMap
                    routePoints={route.route_points}
                    title={route.title || training.title}
                    height={360}
                    compact={false}
                    interactive={false}
                    showLegend={false}
                    showFullscreen={true}
                    defaultLayer="osm"
                  />
                </div>

                <div style={styles.routeActionsV3}>
                  <Link href={`/routes/${route.id}`} style={styles.routeActionButtonV3}>↗ Open route</Link>
                  <button type="button" onClick={downloadRouteGpx} style={styles.routeActionPrimaryV3}>⇩ Download GPX</button>
                  <button type="button" onClick={shareTraining} style={styles.routeActionButtonV3}>⇧ Share route</button>
                </div>
              </section>
            ) : supportsRoutePreview(training) ? (
              <section style={styles.routeHeroCardV3}>
                <div style={styles.cardKicker}>Route</div>
                <h2 style={styles.routeTitle}>No route added yet</h2>
                <div style={styles.previewEmpty}>
                  <strong>Add a route preview for this training.</strong>
                  <span>Participants can quickly see distance, elevation and the planned course before they join.</span>
                  {canManage ? <Link href={`/trainings/${training.id}/edit`} style={styles.primaryLink}>Add route</Link> : null}
                </div>
              </section>
            ) : null}

            <section style={styles.infoStripV3}>
              <div style={styles.infoItemV3}>
                <span>◷ Time</span>
                <strong>{formatTime(training)}</strong>
              </div>
              <div style={styles.infoItemV3}>
                <span>▥ Distance</span>
                <strong>{route?.distance_km ? `${route.distance_km} km` : training.distance_km ? `${training.distance_km} km` : "—"}</strong>
              </div>
              <div style={styles.infoItemV3}>
                <span>△ Elevation</span>
                <strong>{route?.elevation_gain_m ? `${route.elevation_gain_m} m+` : "—"}</strong>
              </div>
              <div style={styles.infoItemV3}>
                <span>♚ Joined</span>
                <strong>{participantCount}{training.max_participants ? ` / ${training.max_participants}` : ""}</strong>
              </div>
            </section>

            <WeatherForecastCard training={training} />

            <section style={styles.cardV3}>
              <div style={styles.participantsHeader}>
                <div style={styles.cardKicker}>Participants</div>
                <span style={styles.participantsCount}>({participantCount})</span>
              </div>

              {participants.length ? (
                <div style={styles.listCompactV3}>
                  {participants.map((participant) => {
                    const person = participantProfiles[participant.user_id];
                    return (
                      <button
                        key={participant.id}
                        type="button"
                        onClick={() => router.push(`/profile/${participant.user_id}`)}
                        style={styles.personRowV3}
                      >
                        {person?.avatar_url ? (
                          <img src={person.avatar_url} alt="" style={styles.avatar} />
                        ) : (
                          <span style={styles.avatarFallback}>{initials(person)}</span>
                        )}
                        <span style={styles.personText}>
                          <strong>{displayName(person)}</strong>
                          <span>{person?.location || person?.role || "Training participant"}</span>
                        </span>
                        <span style={styles.rowChevron}>›</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p style={styles.muted}>No participants yet.</p>
              )}
            </section>

            {workout ? (
              <section style={styles.cardV3}>
                <div style={styles.previewHeader}>
                  <div>
                    <div style={styles.cardKicker}>Workout</div>
                    <h2 style={styles.previewTitle}>{workout.title}</h2>
                  </div>
                  <span style={styles.readyPill}>Ready</span>
                </div>
                <div style={styles.workoutVisual}>
                  <span style={styles.workoutIcon}>▦</span>
                  <strong>{workout.workout_type || "Workout"}</strong>
                  <span>{workout.level || "Level not set"}</span>
                </div>
                <div style={styles.previewFacts}>
                  <span style={styles.factChip}>{getSportLabel(workout.sport_id)}</span>
                  <span style={styles.factChip}>{workout.duration_min ? `${workout.duration_min} min` : "Duration not set"}</span>
                  <span style={styles.factChip}>{getWorkoutBlockCount(workout) ? `${getWorkoutBlockCount(workout)} blocks` : "Structure not set"}</span>
                </div>
                {workout.description ? <p style={styles.muted}>{workout.description}</p> : null}
              </section>
            ) : null}

            <section style={styles.cardV3}>
              <div style={styles.cardKicker}>Training actions</div>
              <div style={styles.trainingActionsGridV3}>
                {training.start_location ? (
                  <a href={mapsUrl(training.start_location, training.latitude, training.longitude)} target="_blank" rel="noreferrer" style={styles.trainingActionTileV3}>
                    <strong>⌖ Maps</strong>
                    <span>Open in Maps</span>
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={addToCalendar}
                  disabled={!getTrainingStart(training)}
                  style={getTrainingStart(training) ? styles.trainingActionTileV3 : styles.trainingActionTileDisabledV3}
                >
                  <strong>▣ Calendar</strong>
                  <span>Add to calendar</span>
                </button>

                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setInvitePanelOpen((open) => !open)}
                    style={styles.trainingActionTilePrimaryV3}
                  >
                    <strong>☉ Invite</strong>
                    <span>Invite team</span>
                  </button>
                ) : null}

                {canManage ? (
                  <Link href={`/trainings/${training.id}/edit`} style={styles.trainingActionTileV3}>
                    <strong>✎ Edit</strong>
                    <span>Edit training</span>
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={toggleJoin}
                  disabled={busy || (!joined && isFull)}
                  style={joined ? styles.trainingActionTileDangerV3 : styles.trainingActionTilePrimaryV3}
                >
                  <strong>{busy ? "..." : joined ? "↪ Leave" : isFull ? "Full" : "+ Join"}</strong>
                  <span>{joined ? "Leave training" : isFull ? "Training full" : "Join training"}</span>
                </button>
              </div>

              {canManage && invitePanelOpen ? (
                <div style={styles.invitePanelV3}>
                  <div>
                    <strong>Invite training partners</strong>
                    <p>Invite accepted Team Up partners directly to this training.</p>
                  </div>

                  {inviteMessage ? <div style={styles.infoMessage}>{inviteMessage}</div> : null}

                  {teamPartners.length ? (
                    <div style={styles.inviteListV3}>
                      {teamPartners.map((partner) => {
                        const invite = trainingInvites.find((row) => row.invitee_id === partner.id);
                        const alreadyParticipant = participants.some((row) => row.user_id === partner.id);
                        const disabled = Boolean(invite || alreadyParticipant || inviteBusyId === partner.id);

                        return (
                          <div key={partner.id} style={styles.inviteRowV3}>
                            {partner.avatar_url ? (
                              <img src={partner.avatar_url} alt="" style={styles.avatarSmallV3} />
                            ) : (
                              <div style={styles.avatarFallbackV3}>{displayName(partner).slice(0, 1).toUpperCase()}</div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <strong>{displayName(partner)}</strong>
                              <span>{alreadyParticipant ? "Already joined" : invite ? `Invite ${invite.status}` : partner.location || "Training partner"}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => invitePartner(partner)}
                              disabled={disabled}
                              style={disabled ? styles.smallPillDisabledV3 : styles.smallPillPrimaryV3}
                            >
                              {inviteBusyId === partner.id ? "..." : alreadyParticipant ? "Joined" : invite ? "Invited" : "Invite"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={styles.infoMessage}>No accepted Team Up partners yet.</div>
                  )}
                </div>
              ) : null}

              {!getTrainingStart(training) && training.planning_type === "flexible" ? (
                <div style={styles.infoMessage}>
                  Calendar export becomes available after the organizer sets a final start time.
                </div>
              ) : null}
            </section>

            {canManage ? (
              <section style={styles.dangerZoneV3}>
                <div style={styles.cardKicker}>Danger zone</div>
                <button type="button" onClick={deleteTraining} disabled={busy} style={styles.deleteWideButtonV3}>
                  <strong>🗑 Delete training</strong>
                  <span>This action cannot be undone</span>
                </button>
              </section>
            ) : null}
          </>
        ) : null}
      </section>
      <BottomNav />
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
    padding: "18px 16px 60px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: {
    width: "min(920px, 100%)",
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
  stateCard: {
    borderRadius: 28,
    padding: 22,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
  },
  errorCard: {
    borderRadius: 28,
    padding: 22,
    background: "rgba(140,20,20,0.18)",
    border: "1px solid rgba(255,90,90,0.22)",
  },
  stateTitle: {
    margin: 0,
    fontSize: 24,
    letterSpacing: "-0.04em",
  },
  hero: {
    borderRadius: 34,
    padding: 22,
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #121712, #060706)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.34)",
    display: "grid",
    gap: 16,
  },
  badgeRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  sportBadge: {
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.28)",
    color: "#e4ef16",
    fontWeight: 950,
  },
  visibilityBadge: {
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.76)",
    fontWeight: 900,
    textTransform: "capitalize",
  },
  title: {
    margin: 0,
    fontSize: "clamp(38px, 10vw, 72px)",
    lineHeight: 0.92,
    letterSpacing: "-0.075em",
  },
  description: {
    margin: 0,
    color: "rgba(255,255,255,0.70)",
    fontSize: 18,
    lineHeight: 1.45,
  },
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
    gap: 10,
  },
  quickCard: {
    borderRadius: 22,
    padding: 14,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    gap: 6,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
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
  leaveButton: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
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
  secondaryLink: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 18px",
    fontWeight: 950,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },
  dangerButton: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,90,90,0.24)",
    background: "rgba(255,70,70,0.10)",
    color: "#ffb4b4",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "pointer",
  },
  disabledButton: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.38)",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "not-allowed",
  },
  infoMessage: {
    borderRadius: 18,
    padding: 12,
    background: "rgba(255,255,255,0.065)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.68)",
    fontWeight: 800,
    lineHeight: 1.45,
  },
  message: {
    borderRadius: 18,
    padding: 12,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  flexTimeCard: {
    borderRadius: 30,
    padding: 22,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 16,
  },
  card: {
    borderRadius: 30,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
  },
  cardKicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "clamp(28px, 8vw, 44px)",
    lineHeight: 0.96,
    letterSpacing: "-0.065em",
  },
  muted: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
  },
  flexGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 8,
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    fontWeight: 850,
  },
  labelFull: {
    display: "grid",
    gap: 8,
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    fontWeight: 850,
  },
  input: {
    width: "100%",
    minWidth: 0,
    minHeight: 54,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.045)",
    color: "white",
    padding: "0 14px",
    boxSizing: "border-box",
    fontSize: 16,
    outline: "none",
  },
  emptyState: {
    borderRadius: 20,
    padding: 16,
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.70)",
    display: "grid",
    gap: 4,
    lineHeight: 1.45,
  },
  list: {
    display: "grid",
    gap: 10,
  },
  personRow: {
    width: "100%",
    border: 0,
    borderRadius: 22,
    padding: 10,
    background: "rgba(255,255,255,0.055)",
    color: "white",
    display: "grid",
    gridTemplateColumns: "46px minmax(0, 1fr)",
    alignItems: "center",
    gap: 10,
    textAlign: "left",
    cursor: "pointer",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    objectFit: "cover",
    border: "1px solid rgba(228,239,22,0.28)",
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.14)",
    border: "1px solid rgba(228,239,22,0.24)",
    color: "#e4ef16",
    fontWeight: 950,
  },
  personText: {
    minWidth: 0,
    display: "grid",
    gap: 3,
    color: "rgba(255,255,255,0.62)",
  },

  weatherCard: {
    overflow: "hidden",
    minHeight: 150,
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.13), transparent 36%), rgba(255,255,255,0.06)",
  },
  weatherSoon: {
    fontSize: 20,
    lineHeight: 1.05,
    letterSpacing: "-0.04em",
  },
  weatherMuted: {
    color: "rgba(255,255,255,0.60)",
    lineHeight: 1.35,
    fontWeight: 750,
  },
  weatherSource: {
    display: "block",
    marginTop: 8,
    color: "rgba(255,255,255,0.42)",
    fontSize: 11,
    fontWeight: 750,
    lineHeight: 1.25,
  },
  weatherMainRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  weatherIcon: {
    fontSize: 36,
    lineHeight: 1,
  },
  weatherTemperature: {
    fontSize: 42,
    lineHeight: 0.9,
    letterSpacing: "-0.06em",
    fontWeight: 950,
  },
  weatherCondition: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: 850,
  },
  weatherDetails: {
    marginTop: 4,
    paddingTop: 10,
    borderTop: "1px solid rgba(255,255,255,0.10)",
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: 850,
  },

  previewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
    alignItems: "stretch",
  },
  previewCard: {
    minWidth: 0,
    borderRadius: 30,
    padding: 16,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
    overflow: "hidden",
  },
  previewHeader: {
    minWidth: 0,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  previewTitle: {
    margin: "5px 0 0",
    fontSize: "clamp(24px, 6vw, 34px)",
    lineHeight: 0.98,
    letterSpacing: "-0.055em",
  },
  readyPill: {
    flex: "0 0 auto",
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.24)",
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
  },
  previewFacts: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  factChip: {
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.74)",
    fontSize: 13,
    fontWeight: 850,
  },
  previewEmpty: {
    minHeight: 170,
    borderRadius: 24,
    padding: 16,
    background: "rgba(255,255,255,0.045)",
    border: "1px dashed rgba(255,255,255,0.14)",
    display: "grid",
    alignContent: "center",
    gap: 10,
    color: "rgba(255,255,255,0.66)",
    lineHeight: 1.45,
  },
  primaryLink: {
    width: "fit-content",
    minHeight: 44,
    borderRadius: 999,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 16px",
    fontWeight: 950,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },
  actionsCompact: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  workoutVisual: {
    minHeight: 170,
    borderRadius: 24,
    background: "radial-gradient(circle at 70% 22%, rgba(228,239,22,0.16), transparent 36%), linear-gradient(145deg,#111611,#060706)",
    border: "1px solid rgba(255,255,255,0.10)",
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 7,
    textAlign: "center",
    color: "rgba(255,255,255,0.72)",
  },
  workoutIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.14)",
    border: "1px solid rgba(228,239,22,0.24)",
    color: "#e4ef16",
    fontSize: 28,
    fontWeight: 950,
  },
  toolsGrid: {
    display: "grid",
    gap: 14,
  },

  heroCompact: {
    borderRadius: 32,
    padding: 0,
    background: "transparent",
    border: 0,
    display: "grid",
    gap: 16,
  },
  detailTopBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  topIconActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.055)",
    color: "white",
    fontSize: 20,
    fontWeight: 950,
    cursor: "pointer",
  },
  iconLink: {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.055)",
    color: "white",
    fontSize: 18,
    fontWeight: 950,
    textDecoration: "none",
    display: "grid",
    placeItems: "center",
  },
  heroMetaRow: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    color: "rgba(255,255,255,0.80)",
    fontSize: 16,
    fontWeight: 850,
    lineHeight: 1.35,
  },
  routeFeatureCard: {
    borderRadius: 30,
    padding: 16,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
    overflow: "hidden",
  },
  routeTitle: {
    margin: "5px 0 0",
    fontSize: "clamp(26px, 7vw, 42px)",
    lineHeight: 0.98,
    letterSpacing: "-0.055em",
  },
  osmMapFrame: {
    borderRadius: 24,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  routeFactsBar: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    fontWeight: 900,
  },
  routeActions: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
  },
  routeActionButton: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 10px",
    fontWeight: 950,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 13,
  },
  routeActionPrimary: {
    minHeight: 48,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 10px",
    fontWeight: 950,
    cursor: "pointer",
    fontSize: 13,
  },
  compactInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
  },
  metricCard: {
    borderRadius: 18,
    padding: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.09)",
    display: "grid",
    gap: 8,
    minHeight: 80,
  },
  participantsHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  participantsCount: {
    color: "rgba(255,255,255,0.60)",
    fontWeight: 850,
  },
  rowChevron: {
    justifySelf: "end",
    color: "rgba(255,255,255,0.45)",
    fontSize: 30,
    fontWeight: 300,
  },
  actionsFooter: {
    display: "grid",
    gap: 12,
  },
  primaryWideButton: {
    minHeight: 56,
    borderRadius: 18,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 18px",
    fontWeight: 950,
    fontSize: 17,
    cursor: "pointer",
  },
  leaveFooterButton: {
    minHeight: 56,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 18px",
    fontWeight: 950,
    fontSize: 17,
    cursor: "pointer",
  },
  pageV3: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.10), transparent 30%), linear-gradient(180deg, #050806 0%, #020202 68%, #000 100%)",
    color: "white",
    padding: "0 14px 92px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shellV3: {
    width: "min(760px, 100%)",
    margin: "0 auto",
    display: "grid",
    gap: 14,
  },
  heroImageCard: {
    minHeight: "min(560px, 76vh)",
    margin: "0 -14px 0",
    padding: "26px 22px 22px",
    backgroundImage:
      "linear-gradient(180deg, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.55) 44%, rgba(0,0,0,0.94) 100%)",
    backgroundSize: "cover",
    backgroundPosition: "center center",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 22,
  },
  heroTopActionsV3: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backLinkV3: {
    color: "#e4ef16",
    textDecoration: "none",
    fontWeight: 950,
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 999,
    padding: "10px 14px",
    background: "rgba(0,0,0,0.42)",
    backdropFilter: "blur(14px)",
  },
  iconButtonV3: {
    width: 46,
    height: 46,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.42)",
    backdropFilter: "blur(14px)",
    color: "white",
    fontSize: 20,
    fontWeight: 950,
    cursor: "pointer",
  },
  iconLinkV3: {
    width: 46,
    height: 46,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.42)",
    backdropFilter: "blur(14px)",
    color: "white",
    textDecoration: "none",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
  },
  heroContentV3: {
    display: "grid",
    gap: 13,
  },
  titleV3: {
    margin: 0,
    fontSize: "clamp(42px, 12vw, 76px)",
    lineHeight: 0.93,
    letterSpacing: "-0.075em",
    textShadow: "0 12px 40px rgba(0,0,0,0.65)",
  },
  descriptionV3: {
    margin: 0,
    color: "rgba(255,255,255,0.78)",
    fontSize: 17,
    lineHeight: 1.42,
    maxWidth: 520,
  },
  heroMetaStackV3: {
    display: "grid",
    gap: 9,
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    fontWeight: 850,
    lineHeight: 1.35,
  },
  liveRowV3: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "rgba(255,255,255,0.78)",
    fontWeight: 750,
  },
  liveDotV3: {
    color: "#38ff5b",
    fontSize: 11,
  },
  routeHeroCardV3: {
    borderRadius: 28,
    padding: 0,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.12)",
    overflow: "hidden",
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  },
  mapFrameV3: {
    overflow: "hidden",
    background: "rgba(0,0,0,0.28)",
  },
  routeActionsV3: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    padding: 12,
    background: "rgba(0,0,0,0.22)",
  },
  routeActionButtonV3: {
    minHeight: 52,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045))",
    color: "white",
    padding: "0 10px",
    fontWeight: 950,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 13,
  },
  routeActionPrimaryV3: {
    minHeight: 52,
    borderRadius: 18,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 10px",
    fontWeight: 950,
    cursor: "pointer",
    fontSize: 13,
  },
  infoStripV3: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    borderRadius: 22,
    overflow: "hidden",
    background: "linear-gradient(145deg, rgba(255,255,255,0.085), rgba(255,255,255,0.035))",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  infoItemV3: {
    minHeight: 88,
    padding: 12,
    display: "grid",
    alignContent: "center",
    gap: 8,
    borderRight: "1px solid rgba(255,255,255,0.08)",
  },
  cardV3: {
    borderRadius: 26,
    padding: 16,
    background: "linear-gradient(145deg, rgba(255,255,255,0.085), rgba(255,255,255,0.035))",
    border: "1px solid rgba(255,255,255,0.11)",
    display: "grid",
    gap: 14,
    overflow: "hidden",
  },
  listCompactV3: {
    display: "grid",
    gap: 8,
  },
  personRowV3: {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 22,
    padding: 12,
    background: "rgba(255,255,255,0.055)",
    color: "white",
    display: "grid",
    gridTemplateColumns: "46px minmax(0, 1fr) 22px",
    alignItems: "center",
    gap: 10,
    textAlign: "left",
    cursor: "pointer",
  },
  trainingActionsGridV3: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  trainingActionTileV3: {
    minHeight: 78,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.045)",
    color: "white",
    padding: 14,
    textDecoration: "none",
    display: "grid",
    placeItems: "center",
    gap: 4,
    fontWeight: 900,
    cursor: "pointer",
  },
  trainingActionTilePrimaryV3: {
    minHeight: 78,
    borderRadius: 16,
    border: "1px solid rgba(228,239,22,0.28)",
    background: "rgba(228,239,22,0.14)",
    color: "#e4ef16",
    padding: 14,
    display: "grid",
    placeItems: "center",
    gap: 4,
    fontWeight: 950,
    cursor: "pointer",
  },
  trainingActionTileDangerV3: {
    minHeight: 78,
    borderRadius: 16,
    border: "1px solid rgba(255,90,90,0.45)",
    background: "rgba(120,15,15,0.26)",
    color: "#ff8d8d",
    padding: 14,
    display: "grid",
    placeItems: "center",
    gap: 4,
    fontWeight: 950,
    cursor: "pointer",
  },
  trainingActionTileDisabledV3: {
    minHeight: 78,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.025)",
    color: "rgba(255,255,255,0.36)",
    padding: 14,
    display: "grid",
    placeItems: "center",
    gap: 4,
    fontWeight: 900,
  },
  invitePanelV3: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.10)",
    display: "grid",
    gap: 12,
  },
  inviteListV3: {
    display: "grid",
    gap: 10,
  },
  inviteRowV3: {
    display: "grid",
    gridTemplateColumns: "42px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 18,
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  avatarSmallV3: {
    width: 42,
    height: 42,
    borderRadius: 999,
    objectFit: "cover",
    border: "1px solid rgba(228,239,22,0.28)",
  },
  avatarFallbackV3: {
    width: 42,
    height: 42,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.28)",
    color: "#e4ef16",
    fontWeight: 950,
  },
  smallPillPrimaryV3: {
    border: "1px solid rgba(228,239,22,0.34)",
    background: "#e4ef16",
    color: "#050505",
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 950,
    cursor: "pointer",
  },
  smallPillDisabledV3: {
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(255,255,255,0.055)",
    color: "rgba(255,255,255,0.46)",
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 900,
  },
  dangerZoneV3: {
    borderRadius: 24,
    padding: 16,
    background: "rgba(255,50,50,0.045)",
    border: "1px solid rgba(255,90,90,0.12)",
    display: "grid",
    gap: 12,
  },
  deleteWideButtonV3: {
    minHeight: 68,
    borderRadius: 16,
    border: "1px solid rgba(255,90,90,0.58)",
    background: "rgba(120,15,15,0.28)",
    color: "#ff8d8d",
    display: "grid",
    placeItems: "center",
    gap: 4,
    fontWeight: 950,
    cursor: "pointer",
  },

};
