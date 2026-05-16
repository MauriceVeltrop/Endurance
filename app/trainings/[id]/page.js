"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { getTrainingHeroImage } from "../../../lib/sportImages";
import { canUserSeeTraining } from "../../../lib/trainingVisibility";

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
      return new Date(start).toLocaleString([], {
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

function normalizeRoutePoints(routePoints) {
  if (!routePoints) return [];
  if (Array.isArray(routePoints)) return routePoints;
  if (Array.isArray(routePoints.points)) return routePoints.points;
  return [];
}

function makeRouteLine(routePoints, width = 320, height = 150, padding = 18) {
  const points = normalizeRoutePoints(routePoints).filter(
    (point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon))
  );

  if (points.length < 2) return "";

  const lats = points.map((point) => Number(point.lat));
  const lons = points.map((point) => Number(point.lon));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latRange = maxLat - minLat || 0.000001;
  const lonRange = maxLon - minLon || 0.000001;

  return points
    .map((point) => {
      const x = padding + ((Number(point.lon) - minLon) / lonRange) * (width - padding * 2);
      const y = padding + ((maxLat - Number(point.lat)) / latRange) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
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
  const [availabilityRows, setAvailabilityRows] = useState([]);
  const [availabilityForm, setAvailabilityForm] = useState({
    available_from: "",
    available_until: "",
    note: "",
  });
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");

  const primarySport = getPrimarySport(training);
  const sportLabel = getSportLabel(primarySport);
  const participantCount = participants.length;
  const isFull = Boolean(training?.max_participants && participantCount >= Number(training.max_participants));
  const routeLine = route ? makeRouteLine(route.route_points) : "";
  const canManage = Boolean(user?.id && training?.creator_id === user.id);

  useEffect(() => {
    loadTraining();
  }, [id]);

  async function loadTraining() {
    if (!id) return;

    setLoading(true);
    setErrorText("");
    setMessage("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user || null;
      setUser(currentUser);

      if (!currentUser?.id) {
        router.replace("/login");
        return;
      }

      const { data: viewerProfileRow, error: viewerProfileError } = await supabase
        .from("profiles")
        .select("id,role,blocked")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (viewerProfileError) throw viewerProfileError;

      if (viewerProfileRow?.blocked) {
        setErrorText("Your account is blocked. Contact an administrator.");
        setTraining(null);
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

      const { data: sportRows } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", currentUser.id);

      const preferredSportIds = (sportRows || []).map((row) => row.sport_id).filter(Boolean);

      const { data: partnerRows } = await supabase
        .from("training_partners")
        .select("requester_id,addressee_id,status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);

      const acceptedPartnerIds = (partnerRows || [])
        .map((relation) =>
          relation.requester_id === currentUser.id ? relation.addressee_id : relation.requester_id
        )
        .filter(Boolean);

      const { data: selectedRows } = await supabase
        .from("training_visibility_members")
        .select("session_id")
        .eq("user_id", currentUser.id);

      const selectedVisibilitySessionIds = (selectedRows || []).map((row) => row.session_id).filter(Boolean);

      const allowed = canUserSeeTraining({
        training: trainingRow,
        userId: currentUser.id,
        role: viewerProfileRow?.role,
        preferredSportIds,
        acceptedPartnerIds,
        selectedVisibilitySessionIds,
      });

      if (!allowed) {
        setErrorText("You do not have access to this training.");
        setTraining(null);
        return;
      }

      setTraining(trainingRow);

      if (trainingRow.route_id) {
        const { data: routeRow, error: routeError } = await supabase
          .from("routes")
          .select("id,title,sport_id,distance_km,elevation_gain_m,route_points,visibility")
          .eq("id", trainingRow.route_id)
          .maybeSingle();

        setRoute(routeError ? null : routeRow || null);
      } else {
        setRoute(null);
      }

      if (trainingRow.workout_id) {
        const { data: workoutRow, error: workoutError } = await supabase
          .from("workouts")
          .select("id,title,sport_id,workout_type,level,duration_min,visibility,structure")
          .eq("id", trainingRow.workout_id)
          .maybeSingle();

        setWorkout(workoutError ? null : workoutRow || null);
      } else {
        setWorkout(null);
      }

      const { data: participantRows, error: participantError } = await supabase
        .from("session_participants")
        .select("id,user_id,created_at")
        .eq("session_id", id)
        .order("created_at", { ascending: true });

      if (participantError) {
        setParticipants([]);
        setParticipantProfiles({});
        setJoined(false);
      } else {
        const rows = participantRows || [];
        setParticipants(rows);
        setJoined(rows.some((row) => row.user_id === currentUser.id));

        const participantUserIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];

        if (participantUserIds.length) {
          const { data: profileRows, error: profileRowsError } = await supabase
            .from("profiles")
            .select("id,name,first_name,last_name,email,avatar_url,role,location")
            .in("id", participantUserIds);

          if (profileRowsError) {
            console.warn("Participant profiles skipped", profileRowsError);
            setParticipantProfiles({});
          } else {
            setParticipantProfiles(
              Object.fromEntries((profileRows || []).map((profile) => [profile.id, profile]))
            );
          }
        } else {
          setParticipantProfiles({});
        }
      }

      if (trainingRow.planning_type === "flexible") {
        const { data: availabilityData, error: availabilityError } = await supabase
          .from("session_availability")
          .select("id,session_id,user_id,available_from,available_until,note,created_at")
          .eq("session_id", trainingRow.id)
          .order("created_at", { ascending: true });

        if (availabilityError) {
          console.warn("Session availability skipped", availabilityError);
          setAvailabilityRows([]);
        } else {
          const rows = availabilityData || [];
          setAvailabilityRows(rows);

          const ownRow = rows.find((row) => row.user_id === currentUser.id);
          setAvailabilityForm({
            available_from: ownRow?.available_from?.slice(0, 5) || "",
            available_until: ownRow?.available_until?.slice(0, 5) || "",
            note: ownRow?.note || "",
          });
        }
      } else {
        setAvailabilityRows([]);
        setAvailabilityForm({
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

    setMessage("");
    setBusy(true);

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
      console.error("Join training error", error);
      setMessage(error?.message || "Could not update participation.");
    } finally {
      setBusy(false);
    }
  }


  async function deleteTraining() {
    if (!user?.id || !training?.id || !canManage) return;

    const confirmed = window.confirm("Delete this training? This cannot be undone.");
    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    try {
      await supabase
        .from("session_participants")
        .delete()
        .eq("session_id", training.id);

      const { error } = await supabase
        .from("training_sessions")
        .delete()
        .eq("id", training.id)
        .eq("creator_id", user.id);

      if (error) throw error;

      router.replace("/trainings");
    } catch (error) {
      console.error("Delete training error", error);
      setMessage(error?.message || "Could not delete training.");
    } finally {
      setBusy(false);
    }
  }

  function displayParticipantName(person) {
    return person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.email || "Endurance athlete";
  }

  function participantInitials(person) {
    return displayParticipantName(person)
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  async function saveSessionAvailability() {
    if (!user?.id || !training?.id || training.planning_type !== "flexible") return;

    setAvailabilityBusy(true);
    setAvailabilityMessage("");

    try {
      if (!availabilityForm.available_from || !availabilityForm.available_until) {
        setAvailabilityMessage("Choose both a start and end time.");
        return;
      }

      if (availabilityForm.available_from >= availabilityForm.available_until) {
        setAvailabilityMessage("End time must be after start time.");
        return;
      }

      const existing = availabilityRows.find((row) => row.user_id === user.id);

      if (existing?.id) {
        const { error } = await supabase
          .from("session_availability")
          .update({
            available_from: availabilityForm.available_from,
            available_until: availabilityForm.available_until,
            note: availabilityForm.note.trim() || null,
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
            available_from: availabilityForm.available_from,
            available_until: availabilityForm.available_until,
            note: availabilityForm.note.trim() || null,
          });

        if (error) throw error;
      }

      setAvailabilityMessage("Availability saved.");
      await loadTraining();
    } catch (error) {
      console.error("Session availability save error", error);
      setAvailabilityMessage(error?.message || "Could not save availability.");
    } finally {
      setAvailabilityBusy(false);
    }
  }

  async function clearSessionAvailability() {
    if (!user?.id || !training?.id) return;

    setAvailabilityBusy(true);
    setAvailabilityMessage("");

    try {
      const existing = availabilityRows.find((row) => row.user_id === user.id);

      if (existing?.id) {
        const { error } = await supabase
          .from("session_availability")
          .delete()
          .eq("id", existing.id)
          .eq("user_id", user.id);

        if (error) throw error;
      }

      setAvailabilityForm({
        available_from: "",
        available_until: "",
        note: "",
      });
      setAvailabilityMessage("Availability cleared.");
      await loadTraining();
    } catch (error) {
      console.error("Session availability clear error", error);
      setAvailabilityMessage(error?.message || "Could not clear availability.");
    } finally {
      setAvailabilityBusy(false);
    }
  }

  function updateAvailabilityForm(key, value) {
    setAvailabilityForm((current) => ({
      ...current,
      [key]: value,
    }));
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
            <p style={styles.muted}>Opening the training session.</p>
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
              <div style={styles.heroContent}>
                <div style={styles.badgeRow}>
                  <span style={styles.sportBadge}>{sportLabel}</span>
                  <span style={styles.visibilityBadge}>{training.visibility}</span>
                </div>

                <h1 style={styles.title}>{training.title}</h1>

                {training.description ? (
                  <p style={styles.description}>{training.description}</p>
                ) : null}

                <div style={styles.quickGrid}>
                  <div style={styles.quickCard}>
                    <span>Time</span>
                    <strong>{formatTime(training)}</strong>
                  </div>

                  <div style={styles.quickCard}>
                    <span>Start</span>
                    <strong>{training.start_location || "Location not set"}</strong>
                  </div>

                  <div style={styles.quickCard}>
                    <span>Distance</span>
                    <strong>{training.distance_km ? `${training.distance_km} km` : "Not set"}</strong>
                  </div>

                  <div style={styles.quickCard}>
                    <span>Effort</span>
                    <strong>{formatEffort(training)}</strong>
                  </div>

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
              </div>
            </article>

            {training.planning_type === "flexible" ? (
              <section style={styles.availabilityCard}>
                <div style={styles.cardKicker}>Flexible planning</div>
                <h2 style={styles.cardTitle}>When can you train?</h2>

                <p style={styles.muted}>
                  Add your availability for this session. The organizer can use this to choose the final start time.
                </p>

                {availabilityMessage ? (
                  <div style={styles.availabilityMessage}>{availabilityMessage}</div>
                ) : null}

                <div style={styles.availabilityForm}>
                  <label style={styles.availabilityLabel}>
                    From
                    <input
                      type="time"
                      value={availabilityForm.available_from}
                      onChange={(event) => updateAvailabilityForm("available_from", event.target.value)}
                      style={styles.availabilityInput}
                    />
                  </label>

                  <label style={styles.availabilityLabel}>
                    Until
                    <input
                      type="time"
                      value={availabilityForm.available_until}
                      onChange={(event) => updateAvailabilityForm("available_until", event.target.value)}
                      style={styles.availabilityInput}
                    />
                  </label>

                  <label style={styles.availabilityLabelFull}>
                    Note
                    <input
                      value={availabilityForm.note}
                      onChange={(event) => updateAvailabilityForm("note", event.target.value)}
                      placeholder="Optional, e.g. easy pace only"
                      style={styles.availabilityInput}
                    />
                  </label>
                </div>

                <div style={styles.availabilityActions}>
                  <button
                    type="button"
                    onClick={saveSessionAvailability}
                    disabled={availabilityBusy}
                    style={styles.primaryButton}
                  >
                    {availabilityBusy ? "Saving..." : "Save availability"}
                  </button>

                  <button
                    type="button"
                    onClick={clearSessionAvailability}
                    disabled={availabilityBusy}
                    style={styles.secondaryButton}
                  >
                    Clear
                  </button>
                </div>

                {availabilityRows.length ? (
                  <div style={styles.availabilityList}>
                    {availabilityRows.map((row) => {
                      const person = participantProfiles[row.user_id];

                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => router.push(`/profile/${row.user_id}`)}
                          style={styles.availabilityRow}
                        >
                          {person?.avatar_url ? (
                            <img src={person.avatar_url} alt="" style={styles.participantAvatar} />
                          ) : (
                            <span style={styles.participantFallback}>{participantInitials(person)}</span>
                          )}

                          <span style={styles.availabilityText}>
                            <strong>{displayParticipantName(person)}</strong>
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
                  <p style={styles.muted}>No availability shared yet.</p>
                )}
              </section>
            ) : null}

            <section style={styles.grid}>
              <article style={styles.card}>
                <div style={styles.cardKicker}>Route</div>
                {route ? (
                  <>
                    {routeLine ? (
                      <div style={styles.routePreview}>
                        <div style={styles.routeGrid} />
                        <svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid meet" style={styles.routeSvg}>
                          <polyline
                            points={routeLine}
                            fill="none"
                            stroke="rgba(0,0,0,0.70)"
                            strokeWidth="12"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <polyline
                            points={routeLine}
                            fill="none"
                            stroke="#e4ef16"
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    ) : null}

                    <h2 style={styles.cardTitle}>{route.title}</h2>
                    <p style={styles.muted}>
                      {getSportLabel(route.sport_id)}
                      {route.distance_km ? ` · ${route.distance_km} km` : ""}
                      {route.elevation_gain_m ? ` · ${route.elevation_gain_m} m+` : ""}
                    </p>
                  </>
                ) : (
                  <p style={styles.muted}>No route connected.</p>
                )}
              </article>

              <article style={styles.card}>
                <div style={styles.cardKicker}>Workout</div>
                {workout ? (
                  <>
                    <h2 style={styles.cardTitle}>{workout.title}</h2>
                    <p style={styles.muted}>
                      {getSportLabel(workout.sport_id)}
                      {workout.duration_min ? ` · ${workout.duration_min} min` : ""}
                    </p>
                  </>
                ) : (
                  <p style={styles.muted}>No workout connected.</p>
                )}
              </article>

              <article style={styles.card}>
                <div style={styles.cardKicker}>Participants</div>
                <h2 style={styles.cardTitle}>{participantCount} joined</h2>

                {participants.length ? (
                  <div style={styles.participantList}>
                    {participants.map((participant) => {
                      const person = participantProfiles[participant.user_id];

                      async function saveSessionAvailability() {
    if (!user?.id || !training?.id || training.planning_type !== "flexible") return;

    setAvailabilityBusy(true);
    setAvailabilityMessage("");

    try {
      if (!availabilityForm.available_from || !availabilityForm.available_until) {
        setAvailabilityMessage("Choose both a start and end time.");
        return;
      }

      if (availabilityForm.available_from >= availabilityForm.available_until) {
        setAvailabilityMessage("End time must be after start time.");
        return;
      }

      const existing = availabilityRows.find((row) => row.user_id === user.id);

      if (existing?.id) {
        const { error } = await supabase
          .from("session_availability")
          .update({
            available_from: availabilityForm.available_from,
            available_until: availabilityForm.available_until,
            note: availabilityForm.note.trim() || null,
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
            available_from: availabilityForm.available_from,
            available_until: availabilityForm.available_until,
            note: availabilityForm.note.trim() || null,
          });

        if (error) throw error;
      }

      setAvailabilityMessage("Availability saved.");
      await loadTraining();
    } catch (error) {
      console.error("Session availability save error", error);
      setAvailabilityMessage(error?.message || "Could not save availability.");
    } finally {
      setAvailabilityBusy(false);
    }
  }

  async function clearSessionAvailability() {
    if (!user?.id || !training?.id) return;

    setAvailabilityBusy(true);
    setAvailabilityMessage("");

    try {
      const existing = availabilityRows.find((row) => row.user_id === user.id);

      if (existing?.id) {
        const { error } = await supabase
          .from("session_availability")
          .delete()
          .eq("id", existing.id)
          .eq("user_id", user.id);

        if (error) throw error;
      }

      setAvailabilityForm({
        available_from: "",
        available_until: "",
        note: "",
      });
      setAvailabilityMessage("Availability cleared.");
      await loadTraining();
    } catch (error) {
      console.error("Session availability clear error", error);
      setAvailabilityMessage(error?.message || "Could not clear availability.");
    } finally {
      setAvailabilityBusy(false);
    }
  }

  function updateAvailabilityForm(key, value) {
    setAvailabilityForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
                        <button
                          key={participant.id}
                          type="button"
                          onClick={() => router.push(`/profile/${participant.user_id}`)}
                          style={styles.participantRow}
                        >
                          {person?.avatar_url ? (
                            <img src={person.avatar_url} alt="" style={styles.participantAvatar} />
                          ) : (
                            <span style={styles.participantFallback}>{participantInitials(person)}</span>
                          )}

                          <span style={styles.participantText}>
                            <strong>{displayParticipantName(person)}</strong>
                            <span>{person?.location || person?.role || "Training participant"}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p style={styles.muted}>No participants yet.</p>
                )}
              </article>
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
    position: "relative",
    overflow: "hidden",
    borderRadius: 36,
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #121712, #060706)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.34)",
  },
  heroContent: {
    position: "relative",
    zIndex: 2,
    padding: 24,
    display: "grid",
    gap: 18,
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
    lineHeight: 0.94,
    letterSpacing: "-0.07em",
  },
  description: {
    margin: 0,
    color: "rgba(255,255,255,0.70)",
    lineHeight: 1.5,
  },
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  quickCard: {
    minHeight: 76,
    borderRadius: 22,
    padding: 14,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.09)",
    display: "grid",
    gap: 6,
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "pointer",
  },
  leaveButton: {
    minHeight: 50,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "pointer",
  },
  dangerButton: {
    minHeight: 50,
    borderRadius: 999,
    border: "1px solid rgba(255,90,90,0.24)",
    background: "rgba(255,70,70,0.12)",
    color: "#ffb4b4",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 16px",
    fontWeight: 950,
    cursor: "pointer",
  },
  secondaryLink: {
    minHeight: 50,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 18px",
    fontWeight: 950,
    textDecoration: "none",
    display: "inline-grid",
    placeItems: "center",
  },
  message: {
    borderRadius: 18,
    padding: 12,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  grid: {
    display: "grid",
    gap: 14,
  },
  card: {
    borderRadius: 28,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 8,
  },
  availabilityCard: {
    borderRadius: 30,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
  },
  availabilityMessage: {
    borderRadius: 18,
    padding: 12,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  availabilityForm: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  availabilityLabel: {
    display: "grid",
    gap: 6,
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    fontWeight: 850,
  },
  availabilityLabelFull: {
    display: "grid",
    gap: 6,
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    fontWeight: 850,
    gridColumn: "1 / -1",
  },
  availabilityInput: {
    width: "100%",
    minHeight: 46,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.24)",
    color: "white",
    padding: "0 12px",
    boxSizing: "border-box",
    outline: "none",
    fontSize: 15,
  },
  availabilityActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  availabilityList: {
    display: "grid",
    gap: 10,
  },
  availabilityRow: {
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
  availabilityText: {
    minWidth: 0,
    display: "grid",
    gap: 3,
    color: "rgba(255,255,255,0.62)",
  },
  participantList: {
    display: "grid",
    gap: 10,
  },
  participantRow: {
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
  participantAvatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    objectFit: "cover",
    border: "1px solid rgba(228,239,22,0.28)",
  },
  participantFallback: {
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
  participantText: {
    minWidth: 0,
    display: "grid",
    gap: 3,
    color: "rgba(255,255,255,0.62)",
  },
  routePreview: {
    position: "relative",
    overflow: "hidden",
    height: 150,
    borderRadius: 22,
    background: "linear-gradient(145deg,#0d120d,#040604)",
    border: "1px solid rgba(255,255,255,0.10)",
    marginBottom: 6,
  },
  routeGrid: {
    position: "absolute",
    inset: 0,
    opacity: 0.20,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
    backgroundSize: "26px 26px",
  },
  routeSvg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    filter: "drop-shadow(0 10px 20px rgba(228,239,22,0.25))",
  },
  cardKicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  cardTitle: {
    margin: 0,
    fontSize: 24,
    letterSpacing: "-0.04em",
  },
  muted: {
    margin: 0,
    color: "rgba(255,255,255,0.66)",
    lineHeight: 1.5,
  },
};
