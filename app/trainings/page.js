"use client";

import { useRouter } from "next/navigation";

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

export default function TrainingsPage() {
  const router = useRouter();

  const openTraining = (id) => {
    router.push(`/trainings/${id}`);
  };

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
        </header>

        <section style={styles.carousel}>
          {demoTrainings.map((training) => (
            <article
              key={training.id}
              role="button"
              tabIndex={0}
              onClick={() => openTraining(training.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openTraining(training.id);
                }
              }}
              style={styles.card}
            >
              <div>
                <div style={styles.sportBadge}>{training.sport}</div>
                <h2 style={styles.cardTitle}>{training.title}</h2>
                <p style={styles.meta}>🕒 {training.time}</p>
                <p style={styles.meta}>📍 {training.location}</p>
                <p style={styles.meta}>⚡ {training.intensity}</p>
              </div>

              <div style={styles.cardFooter}>
                <span style={styles.joined}>{training.joined} joined</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openTraining(training.id);
                  }}
                  style={styles.openButton}
                >
                  Open →
                </button>
              </div>
            </article>
          ))}
        </section>
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
  carousel: {
    display: "flex",
    gap: 16,
    overflowX: "auto",
    padding: "4px 2px 18px",
    scrollSnapType: "x mandatory",
    WebkitOverflowScrolling: "touch",
  },
  card: {
    minWidth: 292,
    maxWidth: 292,
    minHeight: 260,
    borderRadius: 32,
    padding: 22,
    boxSizing: "border-box",
    color: "white",
    background:
      "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
    scrollSnapAlign: "start",
    display: "grid",
    alignContent: "space-between",
    cursor: "pointer",
    userSelect: "none",
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
};
