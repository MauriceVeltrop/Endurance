"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import {
  formatTrainingIntensity,
  formatTrainingTime,
  getPrimarySport,
  getSportLabel,
} from "../../../lib/trainingHelpers";
import { getTrainingHeroImage } from "../../../lib/sportImages";

function makeGoogleMapsUrl(location) {
  if (!location) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function escapeIcs(value = "") {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;")
    .replaceAll("\n", "\\n");
}

function toIcsDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(".000Z", "Z");
}

function downloadIcs(training) {
  const start = training.final_starts_at || training.starts_at;
  const startIcs = toIcsDate(start);

  if (!startIcs) {
    alert("Calendar export is only available when the training has a fixed time.");
    return;
  }

  const startDate = new Date(start);
  const durationMin = Number(training.estimated_duration_min || 60);
  const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);
  const endIcs = toIcsDate(endDate.toISOString());

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Endurance//Training Session//EN",
    "BEGIN:VEVENT",
    `UID:${training.id}@endu-rance.nl`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${startIcs}`,
    `DTEND:${endIcs}`,
    `SUMMARY:${escapeIcs(training.title)}`,
    `DESCRIPTION:${escapeIcs(training.description || "Endurance training session")}`,
    `LOCATION:${escapeIcs(training.start_location || "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${training.title || "endurance-training"}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function shareTraining(training) {
  const url = typeof window !== "undefined" ? window.location.href : "";
  const title = training?.title || "Endurance training";
  const text = `Join this training on Endurance: ${title}`;

  if (navigator?.share) {
    navigator.share({ title, text, url }).catch(() => {});
    return;
  }

  navigator.clipboard?.writeText(url);
  alert("Training link copied.");
}

function getAvailabilitySummary(items) {
  if (!items.length) return "No availability responses yet.";

  const times = items
    .filter((item) => item.available_from || item.available_until)
    .map((item) => {
      const from = item.available_from?.slice(0, 5) || "?";
      const until = item.available_until?.slice(0, 5) || "?";
      return `${from}–${until}`;
    });

  if (!times.length) return `${items.length} response${items.length === 1 ? "" : "s"} received.`;

  return times.slice(0, 3).join(" · ") + (times.length > 3 ? ` +${times.length - 3}` : "");
}

export default function TrainingDetailPage() {
  const params = useParams();
  const id = params?.id;

  const [training, setTraining] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [route, setRoute] = useState(null);
  const [user, setUser] = useState(null);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [message, setMessage] = useState("");
  const [availabilityForm, setAvailabilityForm] = useState({
    available_from: "",
    available_until: "",
    note: "",
  });

  const loadTraining = async () => {
    if (!id) return;

    setLoading(true);
    setErrorText("");
    setMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData?.session?.user || null;
      setUser(currentUser);

      const { data: trainingData, error: trainingError } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (trainingError) throw trainingError;

      if (!trainingData) {
        setTraining(null);
        setErrorText("Training not found.");
        return;
      }

      setTraining(trainingData);

      if (trainingData.route_id) {
        const { data: routeData, error: routeError } = await supabase
          .from("routes")
          .select("id,title,description,sport_id,visibility,distance_km,elevation_gain_m,gpx_file_url")
          .eq("id", trainingData.route_id)
          .maybeSingle();

        if (routeError) {
          console.warn("Route load skipped", routeError);
          setRoute(null);
        } else {
          setRoute(routeData || null);
        }
      } else {
        setRoute(null);
      }

      const { data: participantData, error: participantError } = await supabase
        .from("session_participants")
        .select("id,user_id,created_at")
        .eq("session_id", id)
        .order("created_at", { ascending: true });

      if (participantError) {
        console.warn("Participant load skipped", participantError);
        setParticipants([]);
      } else {
        setParticipants(participantData || []);
        setJoined(Boolean(currentUser?.id && participantData?.some((p) => p.user_id === currentUser.id)));
      }

      const { data: availabilityData, error: availabilityError } = await supabase
        .from("session_availability")
        .select("id,user_id,available_from,available_until,note,created_at")
        .eq("session_id", id)
        .order("created_at", { ascending: true });

      if (availabilityError) {
        console.warn("Availability load skipped", availabilityError);
        setAvailability([]);
      } else {
        const rows = availabilityData || [];
        setAvailability(rows);

        const ownRow = rows.find((row) => row.user_id === currentUser?.id);
        if (ownRow) {
          setAvailabilityForm({
            available_from: ownRow.available_from?.slice(0, 5) || "",
            available_until: ownRow.available_until?.slice(0, 5) || "",
            note: ownRow.note || "",
          });
        }
      }
    } catch (err) {
      console.error("Training detail error", err);
      setErrorText(err?.message || "Could not load training.");
      setTraining(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTraining();
  }, [id]);

  const participantCount = participants.length;

  const isFull = useMemo(() => {
    if (!training?.max_participants) return false;
    return participantCount >= Number(training.max_participants);
  }, [training?.max_participants, participantCount]);

  const primarySport = training ? getPrimarySport(training) : null;
  const sportLabel = primarySport ? getSportLabel(primarySport) : "";
  const sportImage = training ? getTrainingHeroImage(training, primarySport) : null;
  const allSports = Array.isArray(training?.sports)
    ? training.sports.map((sport) => getSportLabel(sport))
    : [];

  const time = training ? formatTrainingTime(training) : "";
  const intensity = training ? formatTrainingIntensity(training) : "";
  const mapsUrl = training ? makeGoogleMapsUrl(training.start_location) : null;
  const isFlexible = training?.planning_type === "flexible";
  const availabilitySummary = getAvailabilitySummary(availability);

  const joinTraining = async () => {
    setMessage("");

    if (!user?.id) {
      setMessage("Login is required to join trainings.");
      return;
    }

    if (!training?.id) return;

    try {
      setJoining(true);

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

        const { error } = await supabase.from("session_participants").insert({
          session_id: training.id,
          user_id: user.id,
        });

        if (error) throw error;
        setMessage("You joined this training.");
      }

      await loadTraining();
    } catch (err) {
      console.error("Join/leave error", err);
      setMessage(err?.message || "Could not update participation.");
    } finally {
      setJoining(false);
    }
  };

  const saveAvailability = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!user?.id) {
      setMessage("Login is required to share availability.");
      return;
    }

    if (!training?.id) return;

    if (!availabilityForm.available_from || !availabilityForm.available_until) {
      setMessage("Select both available from and available until.");
      return;
    }

    try {
      setSavingAvailability(true);

      const existing = availability.find((row) => row.user_id === user.id);
      const payload = {
        session_id: training.id,
        user_id: user.id,
        available_from: availabilityForm.available_from,
        available_until: availabilityForm.available_until,
        note: availabilityForm.note?.trim() || null,
      };

      const { error } = existing
        ? await supabase.from("session_availability").update(payload).eq("id", existing.id)
        : await supabase.from("session_availability").insert(payload);

      if (error) throw error;

      setMessage("Availability saved.");
      await loadTraining();
    } catch (err) {
      console.error("Availability save error", err);
      setMessage(err?.message || "Could not save availability.");
    } finally {
      setSavingAvailability(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />

        <Link href="/trainings" style={styles.backLink}>
          ← Back to trainings
        </Link>

        {loading ? (
          <section style={styles.stateCard}>
            <div style={styles.stateTitle}>Loading training...</div>
            <p style={styles.stateText}>Opening the training detail.</p>
          </section>
        ) : null}

        {errorText ? (
          <section style={styles.errorCard}>
            <div style={styles.stateTitle}>Could not open training</div>
            <p style={styles.stateText}>{errorText}</p>
            <button type="button" onClick={loadTraining} style={styles.retryButton}>
              Try again
            </button>
          </section>
        ) : null}

        {!loading && training ? (
          <>
            <article style={styles.heroCard}>
              <div
                style={{
                  ...styles.heroImageWrap,
                  ...(sportImage?.src
                    ? {
                        backgroundImage: `url("${sportImage.src}")`,
                        backgroundSize: "cover",
                        backgroundPosition: sportImage.position || "center center",
                      }
                    : {}),
                }}
              >
                <div style={styles.heroImageOverlay} />
              </div>

              <div style={styles.heroContent}>
                <div style={styles.topRow}>
                  <div style={styles.sportBadge}>{sportLabel}</div>
                  <div style={styles.visibilityBadge}>{training.visibility}</div>
                </div>

                <h1 style={styles.title}>{training.title}</h1>

                <div style={styles.metaGrid}>
                  <div style={styles.metaItem}>
                    <span style={styles.metaIcon}>🕒</span>
                    <div>
                      <div style={styles.metaLabel}>Time</div>
                      <div style={styles.metaValue}>{time}</div>
                    </div>
                  </div>

                  <div style={styles.metaItem}>
                    <span style={styles.metaIcon}>📍</span>
                    <div>
                      <div style={styles.metaLabel}>Location</div>
                      <div style={styles.metaValue}>{training.start_location || "Location not set"}</div>
                    </div>
                  </div>

                  <div style={styles.metaItem}>
                    <span style={styles.metaIcon}>⚡</span>
                    <div>
                      <div style={styles.metaLabel}>Effort</div>
                      <div style={styles.metaValue}>{intensity}</div>
                    </div>
                  </div>

                  <div style={styles.metaItem}>
                    <span style={styles.metaIcon}>👥</span>
                    <div>
                      <div style={styles.metaLabel}>Participants</div>
                      <div style={styles.metaValue}>
                        {participantCount}
                        {training.max_participants ? ` / ${training.max_participants}` : ""} joined
                      </div>
                    </div>
                  </div>
                </div>

                {training.description ? <p style={styles.description}>{training.description}</p> : null}

                {message ? <div style={styles.message}>{message}</div> : null}

                <button
                  type="button"
                  onClick={joinTraining}
                  disabled={joining || (!joined && isFull)}
                  style={joined ? styles.leaveButton : styles.joinButton}
                >
                  {joining
                    ? "Please wait..."
                    : joined
                      ? "Leave Training"
                      : isFull
                        ? "Training Full"
                        : "Join Training"}
                </button>
              </div>
            </article>

            <section style={styles.quickPanel}>
              <div style={styles.quickHeader}>
                <div>
                  <div style={styles.panelKicker}>Session plan</div>
                  <h2 style={styles.panelTitle}>{isFlexible ? "Flexible start window" : "Fixed training"}</h2>
                </div>
                <span style={styles.planBadge}>{training.planning_type}</span>
              </div>

              <div style={styles.planGrid}>
                <div style={styles.planItem}>
                  <span style={styles.planLabel}>Sports</span>
                  <strong>{allSports.join(" · ") || sportLabel}</strong>
                </div>
                <div style={styles.planItem}>
                  <span style={styles.planLabel}>Distance</span>
                  <strong>{training.distance_km ? `${training.distance_km} km` : "Not set"}</strong>
                </div>
                <div style={styles.planItem}>
                  <span style={styles.planLabel}>Duration</span>
                  <strong>{training.estimated_duration_min ? `${training.estimated_duration_min} min` : "Not set"}</strong>
                </div>
                <div style={styles.planItem}>
                  <span style={styles.planLabel}>Availability</span>
                  <strong>{availabilitySummary}</strong>
                </div>
              </div>
            </section>

            {isFlexible ? (
              <section style={styles.availabilityCard}>
                <div>
                  <div style={styles.panelKicker}>Flexible planning</div>
                  <h2 style={styles.panelTitle}>Share your availability</h2>
                  <p style={styles.panelText}>
                    The selected time window is about possible start time, not the full training duration.
                  </p>
                </div>

                <form onSubmit={saveAvailability} style={styles.availabilityForm}>
                  <label style={styles.field}>
                    <span>Available from</span>
                    <input
                      type="time"
                      value={availabilityForm.available_from}
                      onChange={(event) =>
                        setAvailabilityForm((current) => ({ ...current, available_from: event.target.value }))
                      }
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.field}>
                    <span>Available until</span>
                    <input
                      type="time"
                      value={availabilityForm.available_until}
                      onChange={(event) =>
                        setAvailabilityForm((current) => ({ ...current, available_until: event.target.value }))
                      }
                      style={styles.input}
                    />
                  </label>

                  <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
                    <span>Note</span>
                    <input
                      value={availabilityForm.note}
                      onChange={(event) =>
                        setAvailabilityForm((current) => ({ ...current, note: event.target.value }))
                      }
                      placeholder="Example: I can start after work"
                      style={styles.input}
                    />
                  </label>

                  <button type="submit" disabled={savingAvailability} style={styles.saveAvailabilityButton}>
                    {savingAvailability ? "Saving..." : "Save availability"}
                  </button>
                </form>
              </section>
            ) : null}

            <section style={styles.actionGrid}>
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noreferrer" style={styles.actionCard}>
                  <div style={styles.actionIcon}>🗺️</div>
                  <div>
                    <div style={styles.actionTitle}>Open in Maps</div>
                    <div style={styles.actionText}>Navigate to start location</div>
                  </div>
                </a>
              ) : (
                <div style={styles.actionCardMuted}>
                  <div style={styles.actionIcon}>🗺️</div>
                  <div>
                    <div style={styles.actionTitle}>No location yet</div>
                    <div style={styles.actionText}>The organizer did not set a location</div>
                  </div>
                </div>
              )}

              <button type="button" onClick={() => downloadIcs(training)} style={styles.actionCardButton}>
                <div style={styles.actionIcon}>📅</div>
                <div>
                  <div style={styles.actionTitle}>Add to Calendar</div>
                  <div style={styles.actionText}>Download .ics event</div>
                </div>
              </button>

              <button type="button" onClick={() => shareTraining(training)} style={styles.actionCardButton}>
                <div style={styles.actionIcon}>↗</div>
                <div>
                  <div style={styles.actionTitle}>Share training</div>
                  <div style={styles.actionText}>Send or copy the training link</div>
                </div>
              </button>
            </section>

            <section style={styles.infoGrid}>
              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Route</div>
                {route ? (
                  <div style={styles.routeLinkedBox}>
                    <strong>{route.title}</strong>
                    <span>{getSportLabel(route.sport_id)}</span>
                    <span>
                      {route.distance_km ? `${route.distance_km} km` : "Distance not set"}
                      {route.elevation_gain_m ? ` · ${route.elevation_gain_m} m elevation` : ""}
                    </span>
                    {route.gpx_file_url ? (
                      <a href={route.gpx_file_url} target="_blank" rel="noreferrer" style={styles.inlineLink}>
                        Open GPX
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p style={styles.infoText}>
                    No route connected yet. Saved routes can now be selected while creating a training.
                  </p>
                )}
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Workout</div>
                <p style={styles.infoText}>
                  Workout structures for strength, HYROX, CrossFit and bootcamp will appear here.
                </p>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Weather</div>
                <p style={styles.infoText}>
                  Outdoor weather forecast will be shown from 7 days before the session.
                </p>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

const baseButton = {
  border: 0,
  cursor: "pointer",
  fontWeight: 950,
};

const cardBackground =
  "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 18px 42px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: { width: "min(960px, 100%)", margin: "0 auto", display: "grid", gap: 18 },
  logo: {
    width: "min(280px, 68vw)",
    height: "auto",
    display: "block",
    filter: "drop-shadow(0 12px 34px rgba(228,239,22,0.12))",
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
    background: cardBackground,
    border: "1px solid rgba(255,255,255,0.12)",
  },
  errorCard: {
    borderRadius: 28,
    padding: 22,
    background: "rgba(80,10,10,0.5)",
    border: "1px solid rgba(255,70,70,0.2)",
  },
  stateTitle: { fontSize: 24, fontWeight: 950 },
  stateText: { color: "rgba(255,255,255,0.70)", lineHeight: 1.45 },
  retryButton: { ...baseButton, minHeight: 44, borderRadius: 999, padding: "0 16px", background: "#e4ef16", color: "#101406" },
  heroCard: {
    overflow: "hidden",
    borderRadius: 34,
    background: cardBackground,
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.34)",
  },
  heroImageWrap: {
    position: "relative",
    height: 292,
    overflow: "hidden",
    background:
      "radial-gradient(circle at 78% 18%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #151915, #060706)",
    backgroundRepeat: "no-repeat",
  },
  heroImageOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.66)), radial-gradient(circle at 82% 15%, rgba(228,239,22,0.12), transparent 36%)",
    pointerEvents: "none",
  },
  heroContent: { padding: 22, display: "grid", gap: 18 },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sportBadge: {
    display: "inline-flex",
    width: "fit-content",
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.28)",
    color: "#e4ef16",
    fontWeight: 950,
  },
  visibilityBadge: {
    display: "inline-flex",
    width: "fit-content",
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.80)",
    textTransform: "capitalize",
    fontWeight: 900,
  },
  title: { margin: 0, fontSize: "clamp(34px, 8vw, 58px)", lineHeight: 0.96, letterSpacing: "-0.06em" },
  metaGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  metaItem: {
    display: "flex",
    gap: 10,
    minHeight: 58,
    alignItems: "center",
    padding: 12,
    borderRadius: 20,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  metaIcon: { fontSize: 20 },
  metaLabel: { color: "rgba(255,255,255,0.50)", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" },
  metaValue: { color: "rgba(255,255,255,0.86)", fontWeight: 850 },
  description: { margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.55 },
  message: {
    borderRadius: 18,
    padding: 12,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.20)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  joinButton: { ...baseButton, minHeight: 52, borderRadius: 999, background: "#e4ef16", color: "#101406", fontSize: 16 },
  leaveButton: {
    ...baseButton,
    minHeight: 52,
    borderRadius: 999,
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "white",
    fontSize: 16,
  },
  quickPanel: {
    borderRadius: 30,
    padding: 20,
    background: cardBackground,
    border: "1px solid rgba(255,255,255,0.13)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.26)",
    display: "grid",
    gap: 16,
  },
  quickHeader: { display: "flex", alignItems: "start", justifyContent: "space-between", gap: 14 },
  panelKicker: { color: "#e4ef16", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12, fontWeight: 950 },
  panelTitle: { margin: "3px 0 0", fontSize: 24, letterSpacing: "-0.045em" },
  panelText: { margin: "6px 0 0", color: "rgba(255,255,255,0.66)", lineHeight: 1.5 },
  planBadge: {
    borderRadius: 999,
    padding: "8px 12px",
    color: "#e4ef16",
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.22)",
    fontWeight: 950,
    textTransform: "capitalize",
  },
  planGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 },
  planItem: { padding: 14, borderRadius: 20, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 4 },
  planLabel: { color: "rgba(255,255,255,0.50)", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" },
  availabilityCard: {
    borderRadius: 30,
    padding: 20,
    background:
      "radial-gradient(circle at 90% 14%, rgba(228,239,22,0.12), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 16,
  },
  availabilityForm: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  field: { display: "grid", gap: 7, color: "rgba(255,255,255,0.68)", fontSize: 13, fontWeight: 850 },
  input: {
    width: "100%",
    minHeight: 46,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: "0 12px",
    boxSizing: "border-box",
    outline: "none",
    fontSize: 15,
  },
  saveAvailabilityButton: {
    ...baseButton,
    gridColumn: "1 / -1",
    minHeight: 50,
    borderRadius: 999,
    background: "#e4ef16",
    color: "#101406",
  },
  actionGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 },
  actionCard: {
    minHeight: 96,
    borderRadius: 24,
    padding: 14,
    textDecoration: "none",
    color: "white",
    background: cardBackground,
    border: "1px solid rgba(255,255,255,0.12)",
    display: "grid",
    gap: 8,
  },
  actionCardButton: {
    ...baseButton,
    minHeight: 96,
    borderRadius: 24,
    padding: 14,
    textAlign: "left",
    color: "white",
    background: cardBackground,
    border: "1px solid rgba(255,255,255,0.12)",
    display: "grid",
    gap: 8,
  },
  actionCardMuted: {
    minHeight: 96,
    borderRadius: 24,
    padding: 14,
    color: "rgba(255,255,255,0.54)",
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    gap: 8,
  },
  actionIcon: { fontSize: 24 },
  actionTitle: { fontWeight: 950 },
  actionText: { color: "rgba(255,255,255,0.58)", fontSize: 13, lineHeight: 1.35 },
  infoGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 },
  infoCard: {
    borderRadius: 24,
    padding: 16,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  infoTitle: { color: "#e4ef16", fontWeight: 950, marginBottom: 6 },
  routeLinkedBox: { display: "grid", gap: 6, color: "rgba(255,255,255,0.72)", lineHeight: 1.4, fontSize: 14 },
  inlineLink: { color: "#e4ef16", fontWeight: 950, textDecoration: "none" },
  infoText: { margin: 0, color: "rgba(255,255,255,0.64)", lineHeight: 1.45, fontSize: 14 },
};

if (typeof window !== "undefined") {
  // Keep this object client-only friendly for inline style usage.
}

