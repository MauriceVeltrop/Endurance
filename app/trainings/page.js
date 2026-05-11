"use client";

import Link from "next/link";

const demoTrainings = [
  {
    id: "demo-running-evening-tempo",
    sport: "Running",
    title: "Evening Tempo Run",
    time: "Tonight · 19:00",
    location: "Landgraaf",
    intensity: "5:30–6:00/km · Easy",
    joined: 4,
  },
  {
    id: "demo-trail-sunday",
    sport: "Trail Running",
    title: "Sunday Trail Session",
    time: "Sunday · 09:30",
    location: "Brunssummerheide",
    intensity: "Moderate · 8 km",
    joined: 6,
  },
  {
    id: "demo-strength-hybrid",
    sport: "Strength Training",
    title: "Hybrid Strength",
    time: "Wednesday · 18:30",
    location: "Gym",
    intensity: "Heavy · 60 min",
    joined: 3,
  },
];

export default function TrainingsPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
        color: "white",
        padding: "24px 18px 34px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <section
        style={{
          width: "min(960px, 100%)",
          margin: "0 auto",
          display: "grid",
          gap: 22,
        }}
      >
        <img
          src="/logo-endurance.png"
          alt="Endurance"
          style={{
            width: "min(340px, 76vw)",
            height: "auto",
            justifySelf: "center",
            objectFit: "contain",
            background: "transparent",
          }}
        />

        <header
          style={{
            display: "grid",
            gap: 8,
          }}
        >
          <div
            style={{
              color: "#e4ef16",
              fontSize: 13,
              fontWeight: 950,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Training Sessions
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(38px, 10vw, 66px)",
              lineHeight: 0.96,
              letterSpacing: "-0.065em",
            }}
          >
            Who is training?
          </h1>

          <p
            style={{
              margin: 0,
              color: "rgba(255,255,255,0.68)",
              lineHeight: 1.5,
              maxWidth: 520,
            }}
          >
            Swipe through upcoming sessions and tap a card to open the training detail.
          </p>
        </header>

        <section
          style={{
            display: "flex",
            gap: 16,
            overflowX: "auto",
            padding: "4px 2px 18px",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {demoTrainings.map((training) => (
            <Link
              key={training.id}
              href={`/trainings/${training.id}`}
              style={{
                minWidth: 292,
                maxWidth: 292,
                minHeight: 260,
                borderRadius: 32,
                padding: 22,
                boxSizing: "border-box",
                textDecoration: "none",
                color: "white",
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
                scrollSnapAlign: "start",
                display: "grid",
                alignContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    width: "fit-content",
                    borderRadius: 999,
                    padding: "8px 12px",
                    background: "rgba(228,239,22,0.12)",
                    border: "1px solid rgba(228,239,22,0.28)",
                    color: "#e4ef16",
                    fontWeight: 950,
                    fontSize: 13,
                  }}
                >
                  {training.sport}
                </div>

                <h2
                  style={{
                    margin: "18px 0 10px",
                    fontSize: 29,
                    lineHeight: 1.02,
                    letterSpacing: "-0.045em",
                  }}
                >
                  {training.title}
                </h2>

                <p style={metaStyle}>🕒 {training.time}</p>
                <p style={metaStyle}>📍 {training.location}</p>
                <p style={metaStyle}>⚡ {training.intensity}</p>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={joinedStyle}>{training.joined} joined</span>
                <span style={openStyle}>Open →</span>
              </div>
            </Link>
          ))}
        </section>
      </section>
    </main>
  );
}

const metaStyle = {
  margin: "8px 0",
  color: "rgba(255,255,255,0.70)",
  fontSize: 15,
  lineHeight: 1.35,
};

const joinedStyle = {
  color: "rgba(255,255,255,0.70)",
  fontWeight: 800,
  fontSize: 14,
};

const openStyle = {
  color: "#101406",
  background: "#e4ef16",
  borderRadius: 999,
  padding: "9px 12px",
  fontWeight: 950,
  fontSize: 13,
};
