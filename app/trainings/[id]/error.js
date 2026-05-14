"use client";

import Link from "next/link";

export default function TrainingDetailError({ error, reset }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
        color: "white",
        padding: 18,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <section style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 18 }}>
        <img src="/logo-endurance.png" alt="Endurance" style={{ width: "min(280px,72vw)", justifySelf: "center" }} />

        <section
          style={{
            borderRadius: 28,
            padding: 22,
            background: "rgba(140,20,20,0.18)",
            border: "1px solid rgba(255,90,90,0.22)",
          }}
        >
          <h1 style={{ marginTop: 0 }}>Training could not load</h1>
          <p style={{ color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
            {error?.message || "A runtime error occurred while opening this training."}
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 46,
                borderRadius: 999,
                border: 0,
                background: "#e4ef16",
                color: "#101406",
                padding: "0 16px",
                fontWeight: 950,
              }}
            >
              Try again
            </button>

            <Link
              href="/trainings"
              style={{
                minHeight: 46,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
                padding: "0 16px",
                fontWeight: 950,
                textDecoration: "none",
                display: "inline-grid",
                placeItems: "center",
              }}
            >
              Back to trainings
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
