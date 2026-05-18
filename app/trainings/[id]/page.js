"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { subscribeToTrainingRealtime, removeRealtimeChannel } from "../../../lib/realtime";
import TrainingLiveStatus from "../../../components/realtime/TrainingLiveStatus";
import PlanningPoll from "../../../components/trainings/PlanningPoll";
import RouteMiniPreview from "../../../components/routes/RouteMiniPreview";
import { downloadTrainingIcs, getTrainingStart } from "../../../lib/trainingCalendar";

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

function mapsUrl(location) {
  if (!location) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
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

function weatherIcon(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "⛅";
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

        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
        const geoResponse = await fetch(geoUrl);
        const geoData = await geoResponse.json();
        const place = geoData?.results?.[0];

        if (!place?.latitude || !place?.longitude) {
          if (!cancelled) setStatus("unavailable");
          return;
        }

        const targetDate = startDate.toISOString().slice(0, 10);
        const weatherUrl = [
          "https://api.open-meteo.com/v1/forecast",
          `?latitude=${place.latitude}`,
          `&longitude=${place.longitude}`,
          "&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,uv_index",
          `&start_date=${targetDate}`,
          `&end_date=${targetDate}`,
          "&timezone=auto",
        ].join("");

        const weatherResponse = await fetch(weatherUrl);
        const weatherData = await weatherResponse.json();
        const hourly = weatherData?.hourly || {};
        const index = getNearestHourlyIndex(hourly.time, startDate);

        if (index < 0) {
          if (!cancelled) setStatus("unavailable");
          return;
        }

        if (!cancelled) {
          setForecast({
            temperature: Math.round(hourly.temperature_2m?.[index]),
            precipitation: hourly.precipitation_probability?.[index],
            wind: Math.round(hourly.wind_speed_10m?.[index] || 0),
            uv: Math.round(hourly.uv_index?.[index] || 0),
            code: hourly.weather_code?.[index],
            place: place.name,
          });
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
  }, [training?.id, training?.start_location, training?.starts_at, training?.final_starts_at]);

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
    body = (
      <>
        <div style={styles.weatherMainRow}>
          <span style={styles.weatherIcon}>{weatherIcon(forecast.code)}</span>
          <span style={styles.weatherTemperature}>{forecast.temperature}°C</span>
        </div>
        <span style={styles.weatherCondition}>{weatherCodeText(forecast.code)}</span>
        <div style={styles.weatherDetails}>
          <span>☔ {forecast.precipitation ?? "—"}%</span>
          <span>💨 {forecast.wind} km/h</span>
          <span>☀️ UV {forecast.uv}</span>
        </div>
      </>
    );
  } else {
    body = <span style={styles.weatherMuted}>Forecast unavailable for this location.</span>;
  }

  return (
    <div style={{ ...styles.quickCard, ...styles.weatherCard }}>
      <span>Weather forecast</span>
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

  const primarySport = getPrimarySport(training);
  const sportLabel = getSportLabel(primarySport);
  const participantCount = participants.length;
  const isFull = Boolean(training?.max_participants && participantCount >= Number(training.max_participants));
  const canManage = Boolean(user?.id && training?.creator_id === user.id);

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
        setMessage("You left this training.");
      } else {
        if (isFull) {
          setMessage("This training is full.");
          return;
        }

        const { error } = await supabase
          .from("session_participants")
          .insert({
            session_id: training.id,
            user_id: user.id,
          });

        if (error) throw error;
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

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />

        <Link href="/trainings" style={styles.backLink}>
          ← Back to trainings
        </Link>

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
            <article style={styles.hero}>
              <div style={styles.badgeRow}>
                <span style={styles.sportBadge}>{sportLabel}</span>
                <span style={styles.visibilityBadge}>{training.visibility}</span>
              </div>

              <h1 style={styles.title}>{training.title}</h1>

              {training.description ? <p style={styles.description}>{training.description}</p> : null}

              <div style={styles.quickGrid}>
                <div style={styles.quickCard}>
                  <span>Time</span>
                  <strong>{formatTime(training)}</strong>
                </div>

                <div style={styles.quickCard}>
                  <span>Start</span>
                  <strong>{training.start_location || "Location not set"}</strong>
                </div>

                {training.distance_km ? (
                  <div style={styles.quickCard}>
                    <span>Distance</span>
                    <strong>{training.distance_km} km</strong>
                  </div>
                ) : null}

                <WeatherForecastCard training={training} />

                <div style={styles.quickCard}>
                  <span>Joined</span>
                  <strong>
                    {participantCount}
                    {training.max_participants ? ` / ${training.max_participants}` : ""}
                  </strong>
                </div>
              </div>

              {message ? <div style={styles.message}>{message}</div> : null}

              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={toggleJoin}
                  disabled={busy || (!joined && isFull)}
                  style={joined ? styles.leaveButton : styles.primaryButton}
                >
                  {busy ? "..." : joined ? "Leave training" : isFull ? "Training full" : "Join training"}
                </button>

                {training.start_location ? (
                  <a href={mapsUrl(training.start_location)} target="_blank" rel="noreferrer" style={styles.secondaryLink}>
                    Maps
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={addToCalendar}
                  disabled={!getTrainingStart(training)}
                  style={getTrainingStart(training) ? styles.secondaryButton : styles.disabledButton}
                >
                  Calendar
                </button>

                <button type="button" onClick={shareTraining} style={styles.secondaryButton}>
                  Share
                </button>

                {canManage ? (
                  <>
                    <Link href={`/trainings/${training.id}/edit`} style={styles.secondaryLink}>
                      Edit
                    </Link>

                    <button type="button" onClick={deleteTraining} disabled={busy} style={styles.dangerButton}>
                      Delete
                    </button>
                  </>
                ) : null}
              </div>

              {!getTrainingStart(training) && training.planning_type === "flexible" ? (
                <div style={styles.infoMessage}>
                  Calendar export becomes available after the organizer sets a final start time.
                </div>
              ) : null}
            </article>

            <div style={{ marginBottom: 12 }}>
              <TrainingLiveStatus participants={participants} />
            </div>

            <PlanningPoll
              training={training}
              user={user}
              canManage={canManage}
              onChanged={loadTraining}
            />

            {false && canManage && sessionAvailabilityRows.length ? (
              <section style={styles.card}>
                <div style={styles.cardKicker}>Flexible planning</div>
                <h2 style={styles.sectionTitle}>Availability overview</h2>

                <div style={styles.availabilityList}>
                  {buildAvailabilitySummary(
                    sessionAvailabilityRows,
                    participantProfiles
                  ).map((item) => (
                    <div key={item.id} style={styles.availabilityRow}>
                      <div style={styles.availabilityTop}>
                        <strong>{item.name}</strong>
                        <span style={styles.availabilityTime}>
                          {item.from} – {item.until}
                        </span>
                      </div>

                      {item.note ? (
                        <p style={styles.availabilityNote}>{item.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {false && training.planning_type === "flexible" ? (
              <section style={styles.flexTimeCard}>
                <div style={styles.cardKicker}>Flexible time frame</div>
                <h2 style={styles.sectionTitle}>When are you available?</h2>
                <p style={styles.muted}>
                  This is specific for this training and separate from your general Availability calendar.
                </p>

                {availabilityMessage ? <div style={styles.message}>{availabilityMessage}</div> : null}

                <div style={styles.flexGrid}>
                  <label style={styles.label}>
                    Available from
                    <input
                      type="time"
                      value={sessionAvailabilityForm.available_from}
                      onChange={(event) => updateSessionAvailabilityForm("available_from", event.target.value)}
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.label}>
                    Available until
                    <input
                      type="time"
                      value={sessionAvailabilityForm.available_until}
                      onChange={(event) => updateSessionAvailabilityForm("available_until", event.target.value)}
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.labelFull}>
                    Note
                    <input
                      value={sessionAvailabilityForm.note}
                      onChange={(event) => updateSessionAvailabilityForm("note", event.target.value)}
                      placeholder="Optional, e.g. easy pace only"
                      style={styles.input}
                    />
                  </label>
                </div>

                <div style={styles.actions}>
                  <button type="button" onClick={saveSessionAvailability} disabled={availabilityBusy} style={styles.primaryButton}>
                    {availabilityBusy ? "Saving..." : "Save time frame"}
                  </button>

                  <button type="button" onClick={clearSessionAvailability} disabled={availabilityBusy} style={styles.secondaryButton}>
                    Clear
                  </button>
                </div>

                {sessionAvailabilityRows.length ? (
                  <div style={styles.list}>
                    {sessionAvailabilityRows.map((row) => {
                      const person = participantProfiles[row.user_id];

                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => router.push(`/profile/${row.user_id}`)}
                          style={styles.personRow}
                        >
                          {person?.avatar_url ? (
                            <img src={person.avatar_url} alt="" style={styles.avatar} />
                          ) : (
                            <span style={styles.avatarFallback}>{initials(person)}</span>
                          )}

                          <span style={styles.personText}>
                            <strong>{displayName(person)}</strong>
                            <span>
                              {row.available_from?.slice(0, 5)} – {row.available_until?.slice(0, 5)}
                              {row.note ? ` · ${row.note}` : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={styles.emptyState}>
                    <strong>No time frames shared yet.</strong>
                    <span>Share a time frame so others know when you are available.</span>
                  </div>
                )}

                {canManage ? (
                  <div style={styles.finalTimeBox}>
                    <div style={styles.cardKicker}>Organizer final time</div>
                    <h3 style={styles.smallTitle}>Set the final start time</h3>
                    <p style={styles.muted}>
                      Once this is set, calendar export becomes available for everyone.
                    </p>

                    <div style={styles.flexGrid}>
                      <label style={styles.label}>
                        Final date
                        <input
                          type="date"
                          value={finalStartForm.date}
                          onChange={(event) => updateFinalStartForm("date", event.target.value)}
                          style={styles.input}
                        />
                      </label>

                      <label style={styles.label}>
                        Final time
                        <input
                          type="time"
                          value={finalStartForm.time}
                          onChange={(event) => updateFinalStartForm("time", event.target.value)}
                          style={styles.input}
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={saveFinalStartTime}
                      disabled={busy}
                      style={styles.primaryButton}
                    >
                      {busy ? "Saving..." : "Save final time"}
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section style={styles.previewGrid}>
              <article style={styles.previewCard}>
                <div style={styles.previewHeader}>
                  <div>
                    <div style={styles.cardKicker}>Route</div>
                    <h2 style={styles.previewTitle}>{route ? route.title : supportsRoutePreview(training) ? "No route added yet" : "Route not needed"}</h2>
                  </div>
                  {route ? <span style={styles.readyPill}>Ready</span> : null}
                </div>

                {route ? (
                  <>
                    <RouteMiniPreview routePoints={route.route_points} height={170} />
                    <div style={styles.previewFacts}>
                      <span style={styles.factChip}>{getSportLabel(route.sport_id)}</span>
                      <span style={styles.factChip}>{route.distance_km ? `${route.distance_km} km` : training.distance_km ? `${training.distance_km} km planned` : "Distance not set"}</span>
                      <span style={styles.factChip}>{route.elevation_gain_m ? `${route.elevation_gain_m} m+` : "Elevation not set"}</span>
                    </div>
                    {route.description ? <p style={styles.muted}>{route.description}</p> : null}
                    <div style={styles.actionsCompact}>
                      <Link href={`/routes/${route.id}`} style={styles.secondaryLink}>Open route</Link>
                      {canManage ? <Link href={`/trainings/${training.id}/edit`} style={styles.secondaryLink}>Change route</Link> : null}
                    </div>
                  </>
                ) : supportsRoutePreview(training) ? (
                  <div style={styles.previewEmpty}>
                    <strong>Add a route preview for this training.</strong>
                    <span>Participants can quickly see distance, elevation and the planned course before they join.</span>
                    {canManage ? <Link href={`/trainings/${training.id}/edit`} style={styles.primaryLink}>Add route</Link> : null}
                  </div>
                ) : (
                  <div style={styles.previewEmpty}>
                    <strong>This sport does not need a route.</strong>
                    <span>For indoor or court based sports, use a workout plan instead.</span>
                  </div>
                )}
              </article>

              <article style={styles.previewCard}>
                <div style={styles.previewHeader}>
                  <div>
                    <div style={styles.cardKicker}>Workout</div>
                    <h2 style={styles.previewTitle}>{workout ? workout.title : supportsWorkoutPreview(training) ? "No workout added yet" : "Workout optional"}</h2>
                  </div>
                  {workout ? <span style={styles.readyPill}>Ready</span> : null}
                </div>

                {workout ? (
                  <>
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
                    {canManage ? (
                      <div style={styles.actionsCompact}>
                        <Link href={`/trainings/${training.id}/edit`} style={styles.secondaryLink}>Change workout</Link>
                        <Link href="/workouts/new" style={styles.secondaryLink}>New workout</Link>
                      </div>
                    ) : null}
                  </>
                ) : supportsWorkoutPreview(training) ? (
                  <div style={styles.previewEmpty}>
                    <strong>Add the workout structure.</strong>
                    <span>Show blocks, duration and level so participants know what to expect.</span>
                    {canManage ? <Link href={`/trainings/${training.id}/edit`} style={styles.primaryLink}>Add workout</Link> : null}
                  </div>
                ) : (
                  <div style={styles.previewEmpty}>
                    <strong>Workout plan is optional here.</strong>
                    <span>Use this only when the session has a specific workout structure.</span>
                  </div>
                )}
              </article>
            </section>

            <section style={styles.card}>
              <div style={styles.cardKicker}>Participants</div>
              <h2 style={styles.sectionTitle}>{participantCount} joined</h2>

              {participants.length ? (
                <div style={styles.list}>
                  {participants.map((participant) => {
                    const person = participantProfiles[participant.user_id];

                    return (
                      <button
                        key={participant.id}
                        type="button"
                        onClick={() => router.push(`/profile/${participant.user_id}`)}
                        style={styles.personRow}
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
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p style={styles.muted}>No participants yet.</p>
              )}
            </section>
          </>
        ) : null}
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
};
