"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(228,239,22,0.16), transparent 32%), radial-gradient(circle at 10% 24%, rgba(120,160,20,0.14), transparent 34%), linear-gradient(180deg, #07100b 0%, #050505 62%, #020202 100%)",
        color: "white",
        padding: "24px 18px 34px",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: "grid",
        justifyItems: "center",
        alignContent: "start",
        overflowX: "hidden",
      }}
    >
      <section
        style={{
          width: "min(640px, 100%)",
          display: "grid",
          justifyItems: "center",
          gap: 26,
        }}
      >
        <img
          src="/logo-endurance.png"
          alt="Endurance"
          style={{
            width: "min(520px, 92vw)",
            height: "auto",
            display: "block",
            objectFit: "contain",
            background: "transparent",
            filter: "drop-shadow(0 12px 34px rgba(228,239,22,0.14))",
            marginTop: 16,
          }}
        />

        <section
          style={{
            width: "100%",
            borderRadius: 36,
            padding: "32px 24px",
            boxSizing: "border-box",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow:
              "0 30px 90px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)",
            backdropFilter: "blur(22px)",
          }}
        >
          <div
            style={{
              color: "#e4ef16",
              fontSize: 13,
              fontWeight: 950,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Verified Social Training Platform
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(46px, 12vw, 78px)",
              lineHeight: 0.94,
              letterSpacing: "-0.07em",
              textShadow: "0 18px 50px rgba(0,0,0,0.36)",
            }}
          >
            I want to train.
            <br />
            Who joins?
          </h1>

          <p
            style={{
              margin: "26px 0 0",
              color: "rgba(255,255,255,0.72)",
              fontSize: 18,
              lineHeight: 1.55,
            }}
          >
            A premium verified training platform for endurance athletes, hybrid
            athletes and local training communities.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 10,
              marginTop: 24,
            }}
          >
            <div style={featureStyle}>✅ Verified profiles</div>
            <div style={featureStyle}>⚡ Training-first community</div>
            <div style={featureStyle}>🤝 Team up safely</div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/trainings")}
            style={{
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
            }}
          >
            Continue
          </button>
        </section>
      </section>
    </main>
  );
}

const featureStyle = {
  minHeight: 48,
  borderRadius: 18,
  padding: "0 15px",
  display: "flex",
  alignItems: "center",
  background: "rgba(255,255,255,0.065)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "rgba(255,255,255,0.86)",
  fontWeight: 850,
};
