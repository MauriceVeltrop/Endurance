"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import PlanningPoll from "../../../components/trainings/PlanningPoll";
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

function metricValue(value, fallback = "—") {
  return value || value === 0 ? value : fallback;
}

function TrainingStat({ label, value, tone = "default" }) {
  return (
    <div style={tone === "accent" ? styles.statCardAccent : styles.statCard}>
      <span style={styles.statLabel}>{label}</span>
      <strong style={styles.statValue}>{value}</strong>
    </div>
  );
}

function PersonRow({ person, onClick, subtitle }) {
  return (
    <button type="button" onClick={onClick} style={styles.personRow}>
      {person?.avatar_url ? (
        <img src={person.avatar_url} alt="" style={styles.avatar} />
      ) : (
        <span style={styles.avatarFallback}>{initials(person)}</span>
      )}
      <span style={styles.personText}>
        <strong>{displayName(person)}</strong>
        <span>{subtitle || person?.location || person?.role || "Training participant"}</span>
      </span>
    </button>
  );
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
  const [sessionAvailabilityForm, setSessionAvailabilityForm] = useState({ available_from: "", available_until: "", note: "" });
  const [finalStartForm, setFinalStartForm] = useState({ date: "", time: "" });
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
  const hasFinalTime = Boolean(getTrainingStart(training));

  useEffect(() => {
    loadTraining();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      const finalStart = trainingRow.final_starts_at || trainingRow.starts_at || "";
      if (finalStart) {
        const finalDate = new Date(finalStart);
        if (!Number.isNaN(finalDate.getTime())) {
          setFinalStartForm({ date: finalDate.toISOString().slice(0, 10), time: finalDate.toTimeString().slice(0, 5) });
        }
      } else {
        setFinalStartForm({ date: trainingRow.flexible_date || "", time: trainingRow.flexible_start_time?.slice(0, 5) || "" });
      }

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
        setSessionAvailabilityForm({ available_from: "", available_until: "", note: "" });
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
        const { error } = await supabase.from("session_participants").delete().eq("session_id", training.id).eq("user_id", user.id);
        if (error) throw error;
        setMessage("You left this training.");
      } else {
        if (isFull) {
          setMessage("This training is full.");
          return;
        }
        const { error } = await supabase.from("session_participants").insert({ session_id: training.id, user_id: user.id });
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
      const { error } = await supabase.from("training_sessions").delete().eq("id", training.id).eq("creator_id", user.id);
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
    setSessionAvailabilityForm((current) => ({ ...current, [key]: value }));
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
        const { error } = await supabase.from("session_availability").insert({
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
        const { error } = await supabase.from("session_availability").delete().eq("id", existing.id).eq("user_id", user.id);
        if (error) throw error;
      }
      setSessionAvailabilityForm({ available_from: "", available_until: "", note: "" });
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
    setFinalStartForm((current) => ({ ...current, [key]: value }));
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
        .update({ final_starts_at: finalStartsAt, updated_at: new Date().toISOString() })
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
      if (error?.name !== "AbortError") setMessage("Could not share this training.");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.topBar}>
          <Link href="/trainings" style={styles.iconLink} aria-label="Back to trainings">‹</Link>
          <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />
          <button type="button" onClick={shareTraining} style={styles.iconButton} aria-label="Share training">↗</button>
        </header>

        {loading ? (
          <section style={styles.stateCard}>
            <div style={styles.skeletonLineWide} />
            <div style={styles.skeletonLine} />
            <p style={styles.muted}>Opening the session.</p>
          </section>
        ) : null}

        {errorText ? (
          <section style={styles.errorCard}>
            <h1 style={styles.stateTitle}>Could not open training</h1>
            <p style={styles.muted}>{errorText}</p>
            <button type="button" onClick={loadTraining} style={styles.secondaryButton}>Try again</button>
          </section>
        ) : null}

        {!loading && training ? (
          <>
            <article style={styles.hero}>
              {training.teaser_photo_url ? (
                <img src={training.teaser_photo_url} alt="" style={styles.heroPhoto} />
              ) : (
                <div style={styles.heroArt} aria-hidden="true">
                  <span>{sportLabel.slice(0, 2).toUpperCase()}</span>
                </div>
              )}

              <div style={styles.heroOverlay}>
                <div style={styles.badgeRow}>
                  <span style={styles.sportBadge}>{sportLabel}</span>
                  <span style={styles.visibilityBadge}>{training.visibility || "public"}</span>
                  <span style={hasFinalTime ? styles.readyBadge : styles.pendingBadge}>
                    {hasFinalTime ? "Time set" : "Planning"}
                  </span>
                </div>

                <h1 style={styles.title}>{training.title || "Untitled training"}</h1>
                {training.description ? <p style={styles.description}>{training.description}</p> : null}
              </div>
            </article>

            {message ? <div style={styles.message}>{message}</div> : null}

            <section style={styles.actionDock}>
              <button
                type="button"
                onClick={toggleJoin}
                disabled={busy || (!joined && isFull)}
                style={joined ? styles.leaveButton : styles.primaryButton}
              >
                {busy ? "..." : joined ? "Joined · Leave" : isFull ? "Training full" : "Join training"}
              </button>

              <button type="button" onClick={addToCalendar} disabled={!hasFinalTime} style={hasFinalTime ? styles.dockButton : styles.disabledButton}>
                Calendar
              </button>

              {training.start_location ? (
                <a href={mapsUrl(training.start_location)} target="_blank" rel="noreferrer" style={styles.dockLink}>Maps</a>
              ) : null}
            </section>

            {!hasFinalTime && training.planning_type === "flexible" ? (
              <div style={styles.infoMessage}>Calendar export becomes available after the organizer sets a final start time.</div>
            ) : null}

            <section style={styles.statsGrid}>
              <TrainingStat label="Time" value={formatTime(training)} tone="accent" />
              <TrainingStat label="Start" value={training.start_location || "Location not set"} />
              <TrainingStat label="Distance" value={training.distance_km ? `${training.distance_km} km` : "—"} />
              <TrainingStat label="Effort" value={formatEffort(training)} />
              <TrainingStat label="Athletes" value={`${participantCount}${training.max_participants ? ` / ${training.max_participants}` : ""}`} />
            </section>

            <PlanningPoll training={training} user={user} canManage={canManage} onChanged={loadTraining} />

            {training.planning_type === "flexible" && !hasFinalTime ? (
              <section style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <div style={styles.cardKicker}>Your availability</div>
                    <h2 style={styles.sectionTitle}>When can you start?</h2>
                  </div>
                </div>

                <p style={styles.muted}>Share a personal time frame for this training. The organizer chooses the final start time later.</p>
                {availabilityMessage ? <div style={styles.message}>{availabilityMessage}</div> : null}

                <div style={styles.formGrid}>
                  <label style={styles.label}>From
                    <input type="time" value={sessionAvailabilityForm.available_from} onChange={(event) => updateSessionAvailabilityForm("available_from", event.target.value)} style={styles.input} />
                  </label>
                  <label style={styles.label}>Until
                    <input type="time" value={sessionAvailabilityForm.available_until} onChange={(event) => updateSessionAvailabilityForm("available_until", event.target.value)} style={styles.input} />
                  </label>
                  <label style={styles.labelFull}>Note
                    <input value={sessionAvailabilityForm.note} onChange={(event) => updateSessionAvailabilityForm("note", event.target.value)} placeholder="Optional, e.g. easy pace only" style={styles.input} />
                  </label>
                </div>

                <div style={styles.actions}>
                  <button type="button" onClick={saveSessionAvailability} disabled={availabilityBusy} style={styles.primaryButton}>{availabilityBusy ? "Saving..." : "Save availability"}</button>
                  <button type="button" onClick={clearSessionAvailability} disabled={availabilityBusy} style={styles.secondaryButton}>Clear</button>
                </div>

                {canManage ? (
                  <div style={styles.finalTimeBox}>
                    <div style={styles.cardKicker}>Organizer</div>
                    <h3 style={styles.smallTitle}>Set final start time</h3>
                    <div style={styles.formGrid}>
                      <label style={styles.label}>Date
                        <input type="date" value={finalStartForm.date} onChange={(event) => updateFinalStartForm("date", event.target.value)} style={styles.input} />
                      </label>
                      <label style={styles.label}>Time
                        <input type="time" value={finalStartForm.time} onChange={(event) => updateFinalStartForm("time", event.target.value)} style={styles.input} />
                      </label>
                    </div>
                    <button type="button" onClick={saveFinalStartTime} disabled={busy} style={styles.primaryButton}>{busy ? "Saving..." : "Save final time"}</button>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <div style={styles.cardKicker}>Participants</div>
                  <h2 style={styles.sectionTitle}>{participantCount} joined</h2>
                </div>
                <span style={styles.countPill}>{training.max_participants ? `${participantCount}/${training.max_participants}` : participantCount}</span>
              </div>

              {participants.length ? (
                <div style={styles.list}>
                  {participants.map((participant) => {
                    const person = participantProfiles[participant.user_id];
                    return (
                      <PersonRow
                        key={participant.id}
                        person={person}
                        onClick={() => router.push(`/profile/${participant.user_id}`)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div style={styles.emptyState}>
                  <strong>No participants yet.</strong>
                  <span>Be the first athlete to join this session.</span>
                </div>
              )}
            </section>

            {(route || workout) ? (
              <section style={styles.toolsGrid}>
                {route ? (
                  <article style={styles.toolCard}>
                    <div style={styles.cardKicker}>Route</div>
                    <h2 style={styles.toolTitle}>{route.title}</h2>
                    <p style={styles.muted}>
                      {getSportLabel(route.sport_id)}{route.distance_km ? ` · ${route.distance_km} km` : ""}{route.elevation_gain_m ? ` · ${route.elevation_gain_m} m+` : ""}
                    </p>
                    <Link href={`/routes/${route.id}`} style={styles.secondaryLink}>Open route</Link>
                  </article>
                ) : null}

                {workout ? (
                  <article style={styles.toolCard}>
                    <div style={styles.cardKicker}>Workout</div>
                    <h2 style={styles.toolTitle}>{workout.title}</h2>
                    <p style={styles.muted}>
                      {getSportLabel(workout.sport_id)}{workout.duration_min ? ` · ${workout.duration_min} min` : ""}{workout.level ? ` · ${workout.level}` : ""}
                    </p>
                  </article>
                ) : null}
              </section>
            ) : null}

            {canManage ? (
              <section style={styles.manageCard}>
                <div>
                  <div style={styles.cardKicker}>Organizer tools</div>
                  <h2 style={styles.manageTitle}>Manage this training</h2>
                </div>
                <div style={styles.actions}>
                  <Link href={`/trainings/${training.id}/edit`} style={styles.secondaryLink}>Edit training</Link>
                  <button type="button" onClick={deleteTraining} disabled={busy} style={styles.dangerButton}>Delete</button>
                </div>
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
    width: "100%",
    overflowX: "hidden",
    boxSizing: "border-box",
    background: "radial-gradient(circle at 85% 0%, rgba(228,239,22,0.16), transparent 28%), radial-gradient(circle at 0% 24%, rgba(95,255,170,0.07), transparent 26%), linear-gradient(180deg, #07100b 0%, #050505 70%, #020202 100%)",
    color: "white",
    padding: "calc(env(safe-area-inset-top, 0px) + 10px) 14px 74px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: {
    width: "min(960px, 100%)",
    maxWidth: "100%",
    margin: "0 auto",
    display: "grid",
    gap: 16,
    boxSizing: "border-box",
  },
  topBar: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr) 44px",
    alignItems: "center",
    gap: 10,
    boxSizing: "border-box",
  },
  logo: { width: "min(220px, 58vw)", height: "auto", justifySelf: "center", display: "block" },
  iconLink: {
    width: 44,
    height: 44,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    textDecoration: "none",
    color: "white",
    fontSize: 34,
    lineHeight: 1,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    boxSizing: "border-box",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 950,
    fontSize: 18,
    cursor: "pointer",
  },
  stateCard: { borderRadius: 30, padding: 22, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gap: 14, boxSizing: "border-box" },
  errorCard: { borderRadius: 30, padding: 22, background: "rgba(140,20,20,0.18)", border: "1px solid rgba(255,90,90,0.22)", display: "grid", gap: 14, boxSizing: "border-box" },
  stateTitle: { margin: 0, fontSize: 26, lineHeight: 1, letterSpacing: "-0.05em" },
  skeletonLineWide: { height: 36, width: "72%", borderRadius: 999, background: "rgba(255,255,255,0.09)" },
  skeletonLine: { height: 18, width: "46%", borderRadius: 999, background: "rgba(255,255,255,0.07)" },
  hero: {
    position: "relative",
    minHeight: 390,
    borderRadius: 36,
    overflow: "hidden",
    background: "#111711",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.42)",
    boxSizing: "border-box",
  },
  heroPhoto: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.74 },
  heroArt: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "radial-gradient(circle at 74% 20%, rgba(228,239,22,0.32), transparent 28%), linear-gradient(135deg, #1d241d, #07100b 72%)",
    color: "rgba(228,239,22,0.16)",
    fontSize: "clamp(120px, 40vw, 260px)",
    fontWeight: 1000,
    letterSpacing: "-0.16em",
  },
  heroOverlay: {
    position: "absolute",
    inset: 0,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    gap: 14,
    background: "linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.35) 46%, rgba(0,0,0,0.86) 100%)",
    boxSizing: "border-box",
  },
  badgeRow: { display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0 },
  sportBadge: { borderRadius: 999, padding: "8px 11px", background: "rgba(228,239,22,0.14)", border: "1px solid rgba(228,239,22,0.34)", color: "#e4ef16", fontWeight: 950, fontSize: 13 },
  visibilityBadge: { borderRadius: 999, padding: "8px 11px", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.80)", fontWeight: 900, fontSize: 13, textTransform: "capitalize" },
  readyBadge: { borderRadius: 999, padding: "8px 11px", background: "rgba(95,255,170,0.12)", border: "1px solid rgba(95,255,170,0.24)", color: "#9effc9", fontWeight: 950, fontSize: 13 },
  pendingBadge: { borderRadius: 999, padding: "8px 11px", background: "rgba(255,190,90,0.12)", border: "1px solid rgba(255,190,90,0.22)", color: "#ffd18a", fontWeight: 950, fontSize: 13 },
  title: { margin: 0, fontSize: "clamp(42px, 12vw, 78px)", lineHeight: 0.9, letterSpacing: "-0.085em", overflowWrap: "anywhere" },
  description: { margin: 0, maxWidth: 680, color: "rgba(255,255,255,0.76)", fontSize: 17, lineHeight: 1.45, overflowWrap: "anywhere" },
  message: { borderRadius: 20, padding: 13, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.18)", color: "#e4ef16", fontWeight: 850, lineHeight: 1.4, boxSizing: "border-box" },
  infoMessage: { borderRadius: 20, padding: 13, background: "rgba(255,255,255,0.065)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.70)", fontWeight: 800, lineHeight: 1.45, boxSizing: "border-box" },
  actionDock: {
    position: "sticky",
    top: 8,
    zIndex: 20,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(92px, 0.8fr) minmax(78px, 0.65fr)",
    gap: 8,
    padding: 8,
    borderRadius: 26,
    background: "rgba(10,13,10,0.78)",
    border: "1px solid rgba(255,255,255,0.12)",
    backdropFilter: "blur(18px)",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  primaryButton: { minHeight: 48, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", padding: "0 16px", fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap", minWidth: 0 },
  leaveButton: { minHeight: 48, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.10)", color: "white", padding: "0 16px", fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap", minWidth: 0 },
  dockButton: { minHeight: 48, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.09)", color: "white", padding: "0 12px", fontWeight: 950, cursor: "pointer", minWidth: 0 },
  dockLink: { minHeight: 48, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.09)", color: "white", padding: "0 12px", fontWeight: 950, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", minWidth: 0 },
  disabledButton: { minHeight: 48, borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.36)", padding: "0 12px", fontWeight: 950, cursor: "not-allowed", minWidth: 0 },
  secondaryButton: { minHeight: 48, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.08)", color: "white", padding: "0 16px", fontWeight: 950, cursor: "pointer" },
  secondaryLink: { minHeight: 48, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.08)", color: "white", padding: "0 16px", fontWeight: 950, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" },
  dangerButton: { minHeight: 48, borderRadius: 999, border: "1px solid rgba(255,90,90,0.24)", background: "rgba(255,70,70,0.10)", color: "#ffb4b4", padding: "0 16px", fontWeight: 950, cursor: "pointer" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 10, width: "100%", maxWidth: "100%", boxSizing: "border-box" },
  statCard: { minWidth: 0, borderRadius: 24, padding: 15, background: "rgba(255,255,255,0.065)", border: "1px solid rgba(255,255,255,0.10)", display: "grid", gap: 7, boxSizing: "border-box" },
  statCardAccent: { minWidth: 0, borderRadius: 24, padding: 15, background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.20)", display: "grid", gap: 7, boxSizing: "border-box" },
  statLabel: { color: "rgba(255,255,255,0.56)", fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" },
  statValue: { color: "white", fontSize: 18, lineHeight: 1.1, overflowWrap: "anywhere" },
  card: { borderRadius: 30, padding: 18, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gap: 14, boxSizing: "border-box", minWidth: 0 },
  cardHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, minWidth: 0 },
  cardKicker: { color: "#e4ef16", fontSize: 12, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  sectionTitle: { margin: "4px 0 0", fontSize: "clamp(28px, 8vw, 44px)", lineHeight: 0.96, letterSpacing: "-0.065em", overflowWrap: "anywhere" },
  muted: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.5, overflowWrap: "anywhere" },
  countPill: { borderRadius: 999, padding: "8px 12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.11)", color: "rgba(255,255,255,0.76)", fontWeight: 950, whiteSpace: "nowrap" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, width: "100%", maxWidth: "100%" },
  label: { display: "grid", gap: 8, color: "rgba(255,255,255,0.82)", fontSize: 14, fontWeight: 850, minWidth: 0 },
  labelFull: { display: "grid", gap: 8, color: "rgba(255,255,255,0.82)", fontSize: 14, fontWeight: 850, gridColumn: "1 / -1", minWidth: 0 },
  input: { width: "100%", minWidth: 0, minHeight: 54, borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.045)", color: "white", padding: "0 14px", boxSizing: "border-box", fontSize: 16, outline: "none" },
  actions: { display: "flex", flexWrap: "wrap", gap: 10, minWidth: 0 },
  finalTimeBox: { borderRadius: 24, padding: 14, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.10)", display: "grid", gap: 12, boxSizing: "border-box" },
  smallTitle: { margin: 0, fontSize: 22, lineHeight: 1, letterSpacing: "-0.045em" },
  emptyState: { borderRadius: 22, padding: 16, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.70)", display: "grid", gap: 4, lineHeight: 1.45, boxSizing: "border-box" },
  list: { display: "grid", gap: 10, minWidth: 0 },
  personRow: { width: "100%", minWidth: 0, border: 0, borderRadius: 24, padding: 10, background: "rgba(255,255,255,0.055)", color: "white", display: "grid", gridTemplateColumns: "46px minmax(0, 1fr)", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", boxSizing: "border-box" },
  avatar: { width: 46, height: 46, borderRadius: 999, objectFit: "cover", border: "1px solid rgba(228,239,22,0.28)" },
  avatarFallback: { width: 46, height: 46, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(228,239,22,0.14)", border: "1px solid rgba(228,239,22,0.24)", color: "#e4ef16", fontWeight: 950 },
  personText: { minWidth: 0, display: "grid", gap: 3, color: "rgba(255,255,255,0.62)", overflowWrap: "anywhere" },
  toolsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, minWidth: 0 },
  toolCard: { minWidth: 0, borderRadius: 30, padding: 18, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gap: 12, boxSizing: "border-box" },
  toolTitle: { margin: 0, fontSize: 28, lineHeight: 1, letterSpacing: "-0.055em", overflowWrap: "anywhere" },
  manageCard: { borderRadius: 30, padding: 18, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", display: "grid", gap: 14, boxSizing: "border-box" },
  manageTitle: { margin: "4px 0 0", fontSize: 26, lineHeight: 1, letterSpacing: "-0.055em" },
};
