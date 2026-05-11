"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />

        <section style={styles.heroCard}>
          <div style={styles.kicker}>Verified Social Training Platform</div>

          <h1 style={styles.title}>
            I want to train.
            <br />
            Who joins?
          </h1>

          <p style={styles.subtitle}>
            A premium verified training platform for endurance athletes, hybrid
            athletes and local training communities.
          </p>

          <div style={styles.livePreview}>
            <div style={styles.previewTop}>
              <span style={styles.previewBadge}>Today</span>
              <span style={styles.previewMeta}>Team training</span>
            </div>
            <div style={styles.routeGraphic}>
              <span style={styles.routeDot} />
              <span style={styles.routeLine} />
              <span style={styles.routeDotEnd} />
            </div>
            <div style={styles.previewTitle}>Trail Running • Brunssummerheide</div>
            <div style={styles.previewSub}>8.5 km · easy pace · 5 spots left</div>
          </div>

          <div style={styles.featureGrid}>
            <div style={styles.feature}><span>✅</span> Verified profiles</div>
            <div style={styles.feature}><span>⚡</span> Training-first community</div>
            <div style={styles.feature}><span>🤝</span> Team up safely</div>
          </div>

          <button type="button" onClick={() => router.push("/login")} style={styles.button}>
            Enter Endurance
          </button>
        </section>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.16), transparent 32%), radial-gradient(circle at 10% 24%, rgba(120,160,20,0.14), transparent 34%), linear-gradient(180deg, #07100b 0%, #050505 62%, #020202 100%)",
    color: "white",
    padding: "24px 18px 34px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "grid",
    justifyItems: "center",
    alignContent: "start",
    overflowX: "hidden",
  },
  shell: {
    width: "min(640px, 100%)",
    display: "grid",
    justifyItems: "center",
    gap: 26,
  },
  logo: {
    width: "min(520px, 92vw)",
    height: "auto",
    objectFit: "contain",
    background: "transparent",
    filter: "drop-shadow(0 12px 34px rgba(228,239,22,0.14))",
    marginTop: 16,
  },
  heroCard: {
    width: "100%",
    borderRadius: 36,
    padding: "32px 24px",
    boxSizing: "border-box",
    background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)",
    backdropFilter: "blur(22px)",
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: "clamp(46px, 12vw, 78px)",
    lineHeight: 0.94,
    letterSpacing: "-0.07em",
  },
  subtitle: {
    margin: "26px 0 0",
    color: "rgba(255,255,255,0.72)",
    fontSize: 18,
    lineHeight: 1.55,
  },
  livePreview: {
    marginTop: 26,
    borderRadius: 28,
    padding: 18,
    background: "radial-gradient(circle at 82% 12%, rgba(228,239,22,0.18), transparent 35%), rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
  },
  previewTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  previewBadge: { borderRadius: 999, padding: "7px 11px", background: "rgba(228,239,22,0.13)", color: "#e4ef16", border: "1px solid rgba(228,239,22,0.24)", fontWeight: 950, fontSize: 12 },
  previewMeta: { color: "rgba(255,255,255,0.58)", fontSize: 12, fontWeight: 850 },
  routeGraphic: { position: "relative", height: 66, margin: "10px 0 8px" },
  routeDot: { position: "absolute", left: 8, top: 28, width: 14, height: 14, borderRadius: 999, background: "#e4ef16", boxShadow: "0 0 22px rgba(228,239,22,0.35)" },
  routeDotEnd: { position: "absolute", right: 8, top: 28, width: 14, height: 14, borderRadius: 999, background: "rgba(255,255,255,0.92)" },
  routeLine: { position: "absolute", left: 24, right: 24, top: 34, height: 3, borderRadius: 999, background: "linear-gradient(90deg, #e4ef16, rgba(255,255,255,0.75), #e4ef16)", transform: "skewY(-7deg)", boxShadow: "0 0 24px rgba(228,239,22,0.20)" },
  previewTitle: { fontSize: 21, fontWeight: 950, letterSpacing: "-0.04em" },
  previewSub: { marginTop: 6, color: "rgba(255,255,255,0.64)", fontWeight: 800, fontSize: 14 },
  featureGrid: {
    display: "grid",
    gap: 10,
    marginTop: 16,
  },
  feature: {
    minHeight: 48,
    borderRadius: 18,
    padding: "0 15px",
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: "rgba(255,255,255,0.065)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.86)",
    fontWeight: 850,
  },
  button: {
    width: "100%",
    minHeight: 58,
    borderRadius: 23,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    fontSize: 17,
    marginTop: 30,
    cursor: "pointer",
    boxShadow: "0 18px 38px rgba(228,239,22,0.18)",
  },
};
