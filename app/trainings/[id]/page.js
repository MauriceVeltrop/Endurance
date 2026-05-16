"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
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
  }, [id]);

  async function loadTraining() {
    if (!id) return;

    setLoading(true);
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

      if (trainingRow.route_id) {
        const { data: routeRow } = await supabase
          .from("routes")
          .select("id,title,sport_id,distance_km,elevation_gain_m,visibility")
          .eq("id", trainingRow.route_id)
          .maybeSingle();

        setRoute(routeRow || null);
      } else {
        setRoute(null);
      }

      if (trainingRow.workout_id) {
        const { data: workoutRow } = await supabase
          .from("workouts")
          .select("id,title,sport_id,workout_type,level,duration_min,visibility")
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

            {training.planning_type === "flexible" ? (
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
              </section>
            ) : null}

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

            {(route || workout) ? (
              <section style={styles.toolsGrid}>
                {route ? (
                  <article style={styles.card}>
                    <div style={styles.cardKicker}>Route</div>
                    <h2 style={styles.sectionTitle}>{route.title}</h2>
                    <p style={styles.muted}>
                      {getSportLabel(route.sport_id)}
                      {route.distance_km ? ` · ${route.distance_km} km` : ""}
                      {route.elevation_gain_m ? ` · ${route.elevation_gain_m} m+` : ""}
                    </p>
                  </article>
                ) : null}

                {workout ? (
                  <article style={styles.card}>
                    <div style={styles.cardKicker}>Workout</div>
                    <h2 style={styles.sectionTitle}>{workout.title}</h2>
                    <p style={styles.muted}>
                      {getSportLabel(workout.sport_id)}
                      {workout.duration_min ? ` · ${workout.duration_min} min` : ""}
                    </p>
                  </article>
                ) : null}
              </section>
            ) : null}
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
  toolsGrid: {
    display: "grid",
    gap: 14,
  },
};
