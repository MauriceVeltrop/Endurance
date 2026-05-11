"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

const demoTrainings = [
  {
    id: "demo-running-evening-tempo",
    sport: "Running",
    title: "Evening Tempo Run",
    time: "Tonight · 19:00",
    location: "Landgraaf",
    intensity: "5:30–6:00/km · Easy",
    joined: 4,
    description:
      "A controlled tempo session for runners who want to train together without racing the workout.",
  },
  {
    id: "demo-trail-sunday",
    sport: "Trail Running",
    title: "Sunday Trail Session",
    time: "Sunday · 09:30",
    location: "Brunssummerheide",
    intensity: "Moderate · 8 km",
    joined: 6,
    description:
      "A relaxed social trail session over mixed terrain. Focus on endurance, safety and good company.",
  },
  {
    id: "demo-strength-hybrid",
    sport: "Strength Training",
    title: "Hybrid Strength",
    time: "Wednesday · 18:30",
    location: "Gym",
    intensity: "Heavy · 60 min",
    joined: 3,
    description:
      "Strength-focused hybrid training session with controlled volume and clear structure.",
  },
];

export default function TrainingDetailPage() {
  const params = useParams();
  const training =
    demoTrainings.find((item) => item.id === params?.id) || demoTrainings[0];

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />

        <Link href="/trainings" style={styles.backLink}>
          ← Back to trainings
        </Link>

        <article style={styles.card}>
          <div style={styles.sportBadge}>{training.sport}</div>

          <h1 style={styles.title}>{training.title}</h1>

          <p style={styles.meta}>🕒 {training.time}</p>
          <p style={styles.meta}>📍 {training.location}</p>
          <p style={styles.meta}>⚡ {training.intensity}</p>
          <p style={styles.meta}>👥 {training.joined} joined</p>

          <p style={styles.description}>{training.description}</p>

          <button type="button" style={styles.joinButton}>
            Join Training
          </button>
        </article>
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
    padding: "28px 24px",
    background:
      "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.40)",
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
};
