"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import {
  formatTrainingIntensity,
  formatTrainingTime,
  getPrimarySport,
  getSportLabel,
} from "../../../lib/trainingHelpers";

export default function TrainingDetailPage() {
  const params = useParams();
  const id = params?.id;

  const [training, setTraining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const loadTraining = async () => {
    if (!id) return;

    setLoading(true);
    setErrorText("");

    try {
      const { data, error } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setErrorText("Training not found.");
        setTraining(null);
        return;
      }

      setTraining(data);
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

  const sport = getPrimarySport(training);
  const sportLabel = getSportLabel(sport);
  const time = training ? formatTrainingTime(training) : "";
  const intensity = training ? formatTrainingIntensity(training) : "";

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
          <article style={styles.card}>
            {training.teaser_photo_url ? (
              <img src={training.teaser_photo_url} alt="" style={styles.teaser} />
            ) : null}

            <div style={styles.sportBadge}>{sportLabel}</div>

            <h1 style={styles.title}>{training.title}</h1>

            <p style={styles.meta}>🕒 {time}</p>
            <p style={styles.meta}>📍 {training.start_location || "Location not set"}</p>
            <p style={styles.meta}>⚡ {intensity}</p>
            <p style={styles.meta}>👁 {training.visibility}</p>
            {training.max_participants ? (
              <p style={styles.meta}>👥 Max {training.max_participants} participants</p>
            ) : null}

            {training.description ? (
              <p style={styles.description}>{training.description}</p>
            ) : null}

            <button type="button" style={styles.joinButton}>
              Join Training
            </button>
          </article>
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
    width: "min(720px, 100%)",
    margin: "0 auto",
    display: "grid",
    gap: 20,
  },
  logo: {
    width: "min(320px, 74vw)",
    height: "auto",
    justifySelf: "center",
    objectFit: "contain",
    background: "transparent",
  },
  backLink: {
    width: "fit-content",
    color: "#e4ef16",
    textDecoration: "none",
    fontWeight: 950,
  },
  card: {
    borderRadius: 36,
    padding: "24px",
    background:
      "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.40)",
    overflow: "hidden",
  },
  teaser: {
    width: "calc(100% + 48px)",
    height: 210,
    objectFit: "cover",
    display: "block",
    margin: "-24px -24px 22px",
  },
  sportBadge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.28)",
    color: "#e4ef16",
    fontWeight: 950,
    fontSize: 13,
  },
  title: {
    margin: "18px 0 14px",
    fontSize: "clamp(42px, 11vw, 72px)",
    lineHeight: 0.94,
    letterSpacing: "-0.065em",
  },
  meta: {
    margin: "9px 0",
    color: "rgba(255,255,255,0.72)",
    fontSize: 16,
  },
  description: {
    marginTop: 24,
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
    marginTop: 26,
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
