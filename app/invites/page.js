"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InvitesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/inbox");
  }, [router]);

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.kicker}>Endurance</div>
        <h1 style={styles.title}>Opening your inbox</h1>
        <p style={styles.text}>Training invites now live in the compact action center together with Team Up requests and messages.</p>
        <button type="button" onClick={() => router.replace("/inbox")} style={styles.button}>
          Go to inbox
        </button>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 70%, #020202 100%)",
    color: "white",
    padding: 18,
    display: "grid",
    placeItems: "center",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 32,
    padding: 24,
    background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(38px, 10vw, 64px)",
    lineHeight: 0.92,
    letterSpacing: "-0.075em",
  },
  text: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
  },
  button: {
    minHeight: 48,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "pointer",
  },
};
