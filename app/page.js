"use client";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(228,239,22,0.14), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 100%)",
        padding: 24,
        display: "grid",
        justifyItems: "center",
        alignContent: "start",
        gap: 24,
      }}
    >
      <img
        src="/logo-endurance.png"
        alt="Endurance"
        style={{
          width: "min(340px, 80vw)",
          marginTop: 20,
        }}
      />

      <div
        style={{
          width: "min(440px, 100%)",
          borderRadius: 32,
          padding: 24,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(20px)",
        }}
      >
        <h1
          style={{
            marginTop: 0,
            fontSize: 42,
            lineHeight: 1,
            letterSpacing: "-0.05em",
          }}
        >
          I want to train.
          <br />
          Who joins?
        </h1>

        <p
          style={{
            color: "rgba(255,255,255,0.7)",
            lineHeight: 1.6,
          }}
        >
          Verified social training platform built for runners, cyclists,
          hybrid athletes and training communities.
        </p>

        <button
          style={{
            width: "100%",
            minHeight: 56,
            borderRadius: 20,
            border: 0,
            background: "#e4ef16",
            color: "#101406",
            fontWeight: 900,
            fontSize: 16,
            marginTop: 12,
            cursor: "pointer",
          }}
        >
          Continue
        </button>
      </div>
    </main>
  );
}
