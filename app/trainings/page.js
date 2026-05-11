"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  formatTrainingIntensity,
  formatTrainingTime,
  getPrimarySport,
  getSportLabel,
} from "../../lib/trainingHelpers";

export default function TrainingsPage() {
  const router = useRouter();

  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");

  const loadTrainings = async () => {
    setErrorText("");
    setRefreshing(true);

    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("training_sessions")
        .select(
          "id, title, description, sports, visibility, planning_type, starts_at, flexible_date, flexible_start_time, flexible_end_time, final_starts_at, start_location, distance_km, estimated_duration_min, intensity_label, pace_min, pace_max, speed_min, speed_max, heart_rate_zone, max_participants, teaser_photo_url, created_at"
        )
        .or(`starts_at.gte.${now},starts_at.is.null`)
        .order("starts_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      setTrainings(data || []);
    } catch (err) {
      console.error("Training feed error", err);
      setErrorText(err?.message || "Could not load training sessions.");
      setTrainings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTrainings();
  }, []);

  const empty = !loading && !errorText && trainings.length === 0;

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />

        <header style={styles.header}>
          <div style={styles.kicker}>Training Sessions</div>
          <h1 style={styles.title}>Who is training?</h1>
          <p style={styles.subtitle}>
            Swipe through upcoming sessions and tap a card to open the training detail.
          </p>

          <button
            type="button"
            onClick={loadTrainings}
            disabled={refreshing}
            style={styles.refreshButton}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        {loading ? (
          <section style={styles.stateCard}>
            <div style={styles.stateTitle}>Loading trainings...</div>
            <p style={styles.stateText}>Fetching upcoming sessions from Supabase.</p>
          </section>
        ) : null}

        {errorText ? (
          <section style={styles.errorCard}>
            <div style={styles.stateTitle}>Could not load trainings</div>
            <p style={styles.stateText}>{errorText}</p>
            <button type="button" onClick={loadTrainings} style={styles.retryButton}>
              Try again
            </button>
          </section>
        ) : null}

        {empty ? (
          <section style={styles.stateCard}>
            <div style={styles.stateTitle}>No trainings yet</div>
            <p style={styles.stateText}>
              Your clean v2 feed is connected. Create the first training session next.
            </p>
          </section>
        ) : null}

        {!loading && !errorText && trainings.length > 0 ? (
          <section style={styles.carousel}>
            {trainings.map((training) => {
              const sport = getPrimarySport(training);
              const sportLabel = getSportLabel(sport);
              const time = formatTrainingTime(training);
              const intensity = formatTrainingIntensity(training);

              return (
                <article
                  key={training.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/trainings/${training.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/trainings/${training.id}`);
                    }
                  }}
                  style={styles.card}
                >
                  {training.teaser_photo_url ? (
                    <img
                      src={training.teaser_photo_url}
                      alt=""
                      style={styles.teaser}
                    />
                  ) : null}

                  <div style={styles.cardContent}>
                    <div>
                      <div style={styles.cardTop}>
                        <div style={styles.sportBadge}>{sportLabel}</div>
                        <div style={styles.visibilityBadge}>{training.visibility}</div>
                      </div>

                      <h2 style={styles.cardTitle}>{training.title}</h2>

                      <p style={styles.meta}>🕒 {time}</p>
                      <p style={styles.meta}>📍 {training.start_location || "Location not set"}</p>
                      <p style={styles.meta}>⚡ {intensity}</p>
                    </div>

                    <div style={styles.cardFooter}>
                      <span style={styles.joined}>
                        {training.max_participants
                          ? `Max ${training.max_participants}`
                          : "Open session"}
                      </span>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/trainings/${training.id}`);
                        }}
                        style={styles.openButton}
                      >
                        Open →
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}
      </section>
    </main>
  );
}

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
    width: "min(960px, 100%)",
    margin: "0 auto",
    display: "grid",
    gap: 22,
  },
  logo: {
    width: "min(340px, 76vw)",
    height: "auto",
    justifySelf: "center",
    objectFit: "contain",
    background: "transparent",
  },
  header: { display: "grid", gap: 8 },
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
    maxWidth: 520,
  },
  refreshButton: {
    width: "fit-content",
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.28)",
    background: "rgba(228,239,22,0.08)",
    color: "#e4ef16",
    fontWeight: 950,
    padding: "0 16px",
    cursor: "pointer",
    marginTop: 6,
  },
  carousel: {
    display: "flex",
    gap: 16,
    overflowX: "auto",
    padding: "4px 2px 18px",
    scrollSnapType: "x mandatory",
    WebkitOverflowScrolling: "touch",
  },
  card: {
    minWidth: 306,
    maxWidth: 306,
    minHeight: 300,
    borderRadius: 32,
    boxSizing: "border-box",
    color: "white",
    background:
      "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
    scrollSnapAlign: "start",
    display: "grid",
    overflow: "hidden",
    cursor: "pointer",
    userSelect: "none",
  },
  teaser: {
    width: "100%",
    height: 118,
    objectFit: "cover",
    display: "block",
    opacity: 0.92,
  },
  cardContent: {
    padding: 22,
    display: "grid",
    alignContent: "space-between",
    gap: 20,
  },
  cardTop: {
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
  cardTitle: {
    margin: "18px 0 10px",
    fontSize: 29,
    lineHeight: 1.02,
    letterSpacing: "-0.045em",
  },
  meta: {
    margin: "8px 0",
    color: "rgba(255,255,255,0.70)",
    fontSize: 15,
    lineHeight: 1.35,
  },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  joined: {
    color: "rgba(255,255,255,0.70)",
    fontWeight: 800,
    fontSize: 14,
  },
  openButton: {
    color: "#101406",
    background: "#e4ef16",
    borderRadius: 999,
    padding: "10px 13px",
    fontWeight: 950,
    fontSize: 13,
    border: 0,
    cursor: "pointer",
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
    marginBottom: 0,
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
