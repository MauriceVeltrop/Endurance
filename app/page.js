"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(228,239,22,0.14), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 100%)",
        padding: "22px 18px 32px",
        display: "grid",
        justifyItems: "center",
        alignContent: "start",
        gap: 28,
        color: "white",
      }}
    >
      <img
        src="/logo-endurance.png"
        alt="Endurance"
        style={{
          width: "min(470px, 92vw)",
          height: "auto",
          marginTop: 18,
          objectFit: "contain",
          display: "block",
          filter: "drop-shadow(0 12px 34px rgba(228,239,22,0.12))",
        }}
      />

      <section
        style={{
          width: "min(520px, 100%)",
          borderRadius: 34,
          padding: "30px 24px",
          background:
            "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045))",
          border: "1px solid rgba(255,255,255,0.14)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 28px 80px rgba(0,0,0,0.34)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(44px, 12vw, 72px)",
            lineHeight: 0.95,
            letterSpacing: "-0.065em",
          }}
        >
          I want to train.
          <br />
          Who joins?
        </h1>

        <p
          style={{
            color: "rgba(255,255,255,0.72)",
            lineHeight: 1.55,
            fontSize: 18,
            margin: "26px 0 0",
          }}
        >
          Verified social training platform built for runners, cyclists,
          hybrid athletes and training communities.
        </p>

        <button
          type="button"
          onClick={() => router.push("/trainings")}
          style={{
            width: "100%",
            minHeight: 58,
            borderRadius: 22,
            border: 0,
            background: "#e4ef16",
            color: "#101406",
            fontWeight: 950,
            fontSize: 17,
            marginTop: 30,
            cursor: "pointer",
            boxShadow: "0 18px 38px rgba(228,239,22,0.16)",
          }}
        >
          Continue
        </button>
      </section>
    </main>
  );
}
