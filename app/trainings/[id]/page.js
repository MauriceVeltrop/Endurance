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

export default function TrainingDetailPage() {
  const params = useParams();
  const id = params?.id;

  const [training, setTraining] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [user, setUser] = useState(null);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [message, setMessage] = useState("");

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

  const joinTraining = async () => {
    setMessage("");

    if (!user?.id) {
      setMessage("Login is required to join trainings. Auth/onboarding is the next build step.");
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
        setJoined(false);
        setParticipants((items) => items.filter((item) => item.user_id !== user.id));
        setMessage("You left this training.");
        return;
      }

      if (isFull) {
        setMessage("This training is already full.");
        return;
      }

      const { data, error } = await supabase
        .from("session_participants")
        .insert({
          session_id: training.id,
          user_id: user.id,
        })
        .select("id,user_id,created_at")
        .single();

      if (error) throw error;

      setJoined(true);
      setParticipants((items) => [...items, data]);
      setMessage("You joined this training.");
    } catch (err) {
      console.error("Join training error", err);
      setMessage(err?.message || "Could not update participation.");
    } finally {
      setJoining(false);
    }
  };

  const primarySport = training ? getPrimarySport(training) : "";
  const sportLabel = training ? getSportLabel(primarySport) : "";
  const sportImage = training ? getTrainingHeroImage(training, primarySport) : null;
  const allSports = Array.isArray(training?.sports)
    ? training.sports.map((sport) => getSportLabel(sport))
    : [];

  const time = training ? formatTrainingTime(training) : "";
  const intensity = training ? formatTrainingIntensity(training) : "";
  const mapsUrl = training ? makeGoogleMapsUrl(training.start_location) : null;

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
                  backgroundImage: `url("${sportImage?.src}")`,
                  backgroundSize: "cover",
                  backgroundPosition: sportImage?.position || "center center",
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
                      <div style={styles.metaValue}>
                        {training.start_location || "Location not set"}
                      </div>
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

                {training.description ? (
                  <p style={styles.description}>{training.description}</p>
                ) : null}

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
                    <div style={styles.actionText}>Maps unavailable</div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => downloadIcs(training)}
                style={styles.actionCardButton}
              >
                <div style={styles.actionIcon}>📅</div>
                <div>
                  <div style={styles.actionTitle}>Add to Calendar</div>
                  <div style={styles.actionText}>Download .ics file</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (navigator?.share) {
                    navigator.share({
                      title: training.title,
                      text: "Join this Endurance training.",
                      url: window.location.href,
                    });
                  } else {
                    navigator.clipboard?.writeText(window.location.href);
                    setMessage("Training link copied.");
                  }
                }}
                style={styles.actionCardButton}
              >
                <div style={styles.actionIcon}>↗️</div>
                <div>
                  <div style={styles.actionTitle}>Share</div>
                  <div style={styles.actionText}>Invite training partners</div>
                </div>
              </button>
            </section>

            <section style={styles.infoGrid}>
              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Sports</div>
                <div style={styles.chipRow}>
                  {allSports.length ? (
                    allSports.map((sport) => (
                      <span key={sport} style={styles.chip}>
                        {sport}
                      </span>
                    ))
                  ) : (
                    <span style={styles.muted}>No sports set</span>
                  )}
                </div>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Visibility</div>
                <p style={styles.infoText}>
                  This training is visible as: <strong>{training.visibility}</strong>.
                </p>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Weather</div>
                <p style={styles.infoText}>
                  Weather forecast appears here for outdoor trainings within 7 days.
                </p>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoTitle}>Route / Workout</div>
                <p style={styles.infoText}>
                  Route and workout previews will connect in the next modules.
                </p>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

const baseCard = {
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
  border: "1px solid rgba(255,255,255,0.14)",
  boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
};

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "24px 18px 34px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: {
    width: "min(860px, 100%)",
    margin: "0 auto",
    display: "grid",
    gap: 20,
  },
  logo: {
    width: "min(330px, 76vw)",
    height: "auto",
    justifySelf: "center",
    objectFit: "contain",
  },
  backLink: {
    width: "fit-content",
    color: "#e4ef16",
    textDecoration: "none",
    fontWeight: 950,
  },
  heroCard: {
    ...baseCard,
    borderRadius: 36,
    overflow: "hidden",
  },
  heroImageWrap: {
    position: "relative",
    height: 260,
    overflow: "hidden",
    background: "#111",
  },
  teaser: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    opacity: 0.94,
    filter: "saturate(0.96) contrast(1.08) brightness(0.80)",
  },
  heroImageOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.72)), radial-gradient(circle at 82% 12%, rgba(228,239,22,0.20), transparent 34%)",
    pointerEvents: "none",
  },
  heroContent: {
    padding: 24,
    display: "grid",
    gap: 18,
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  sportBadge: {
    display: "inline-flex",
    width: "fit-content",
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.28)",
    color: "#e4ef16",
    fontWeight: 950,
    fontSize: 13,
  },
  visibilityBadge: {
    borderRadius: 999,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.72)",
    fontWeight: 850,
    fontSize: 12,
    textTransform: "capitalize",
  },
  title: {
    margin: 0,
    fontSize: "clamp(42px, 11vw, 76px)",
    lineHeight: 0.94,
    letterSpacing: "-0.065em",
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
  },
  metaItem: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    borderRadius: 20,
    padding: 14,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  metaIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.10)",
  },
  metaLabel: {
    color: "rgba(255,255,255,0.48)",
    fontWeight: 850,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  metaValue: {
    color: "rgba(255,255,255,0.86)",
    fontWeight: 850,
    marginTop: 2,
  },
  description: {
    margin: 0,
    color: "rgba(255,255,255,0.74)",
    fontSize: 17,
    lineHeight: 1.6,
  },
  joinButton: {
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
  leaveButton: {
    width: "100%",
    minHeight: 58,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 950,
    fontSize: 17,
    cursor: "pointer",
  },
  message: {
    borderRadius: 18,
    padding: 14,
    background: "rgba(228,239,22,0.08)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "rgba(255,255,255,0.82)",
    lineHeight: 1.45,
  },
  actionGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  actionCard: {
    ...baseCard,
    minHeight: 76,
    borderRadius: 24,
    padding: 16,
    display: "flex",
    alignItems: "center",
    gap: 14,
    color: "white",
    textDecoration: "none",
  },
  actionCardButton: {
    ...baseCard,
    minHeight: 76,
    borderRadius: 24,
    padding: 16,
    display: "flex",
    alignItems: "center",
    gap: 14,
    color: "white",
    textAlign: "left",
    cursor: "pointer",
  },
  actionCardMuted: {
    minHeight: 76,
    borderRadius: 24,
    padding: 16,
    display: "flex",
    alignItems: "center",
    gap: 14,
    color: "rgba(255,255,255,0.62)",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.10)",
    flex: "0 0 auto",
  },
  actionTitle: {
    fontWeight: 950,
  },
  actionText: {
    color: "rgba(255,255,255,0.58)",
    marginTop: 3,
    fontSize: 13,
  },
  infoGrid: {
    display: "grid",
    gap: 12,
  },
  infoCard: {
    ...baseCard,
    borderRadius: 24,
    padding: 18,
  },
  infoTitle: {
    color: "#e4ef16",
    fontWeight: 950,
    marginBottom: 10,
  },
  infoText: {
    color: "rgba(255,255,255,0.70)",
    lineHeight: 1.5,
    margin: 0,
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    padding: "8px 11px",
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.20)",
    color: "#e4ef16",
    fontWeight: 850,
    fontSize: 13,
  },
  muted: {
    color: "rgba(255,255,255,0.55)",
  },
  stateCard: {
    borderRadius: 28,
    padding: 22,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  errorCard: {
    borderRadius: 28,
    padding: 22,
    background: "rgba(140,20,20,0.18)",
    border: "1px solid rgba(255,90,90,0.22)",
  },
  stateTitle: {
    fontSize: 22,
    fontWeight: 950,
  },
  stateText: {
    color: "rgba(255,255,255,0.70)",
    lineHeight: 1.5,
  },
  retryButton: {
    minHeight: 42,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    padding: "0 16px",
    cursor: "pointer",
    marginTop: 12,
  },
};
