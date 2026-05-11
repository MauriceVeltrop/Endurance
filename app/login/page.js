"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getCurrentUser, getNextAuthPath, getProfile } from "../../lib/authFlow";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  const checkSession = async () => {
    setMessage("");

    try {
      const user = await getCurrentUser();

      if (!user?.id) return;

      const profile = await getProfile(user.id, "id,onboarding_completed,blocked");
      router.replace(getNextAuthPath(profile));
    } catch (err) {
      console.error("Session check error", err);
      setMessage(err?.message || "Could not check your session. You can still sign in below.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!email.trim()) return setMessage("Enter your email address.");
    if (password.length < 6) return setMessage("Password must be at least 6 characters.");

    try {
      setLoading(true);

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        setMessage("Account created. Check your email if confirmation is enabled, then sign in.");
        setMode("signin");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      const user = await getCurrentUser();
      const profile = await getProfile(user?.id, "id,onboarding_completed,blocked");

      router.replace(getNextAuthPath(profile));
    } catch (err) {
      console.error("Auth error", err);
      setMessage(err?.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <main style={styles.page}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />
        <section style={styles.card}>
          <div style={styles.checkingRow}>
            <div style={styles.spinner} />
            <div>
              <div style={styles.checkingTitle}>Checking session...</div>
              <p style={styles.checkingText}>This should only take a moment.</p>
            </div>
          </div>
          <button type="button" onClick={() => setChecking(false)} style={styles.secondaryButton}>
            Show login form
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />

      <section style={styles.card}>
        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => setMode("signin")}
            style={mode === "signin" ? styles.tabActive : styles.tab}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            style={mode === "signup" ? styles.tabActive : styles.tab}
          >
            Create account
          </button>
        </div>

        <h1 style={styles.heading}>
          {mode === "signin" ? "Welcome back" : "Join Endurance"}
        </h1>

        <p style={styles.subtitle}>
          Verified profiles, preferred sports and safer training together.
        </p>

        <form onSubmit={submit} style={styles.form}>
          <label style={styles.label}>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              style={styles.input}
            />
          </label>

          {message ? <div style={styles.message}>{message}</div> : null}

          <button type="submit" disabled={loading} style={styles.primaryButton}>
            {loading
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
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
    gap: 24,
  },
  logo: {
    width: "min(440px, 88vw)",
    height: "auto",
    marginTop: 18,
    objectFit: "contain",
  },
  card: {
    width: "min(520px, 100%)",
    borderRadius: 36,
    padding: 24,
    boxSizing: "border-box",
    background: "linear-gradient(145deg, rgba(255,255,255,0.115), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.42)",
    backdropFilter: "blur(22px)",
  },
  checkingRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  spinner: {
    width: 20,
    height: 20,
    borderRadius: 999,
    border: "3px solid rgba(255,255,255,0.18)",
    borderTopColor: "#e4ef16",
  },
  checkingTitle: {
    color: "white",
    fontWeight: 950,
    fontSize: 20,
  },
  checkingText: {
    margin: "6px 0 0",
    color: "rgba(255,255,255,0.58)",
    lineHeight: 1.35,
  },
  secondaryButton: {
    width: "100%",
    minHeight: 50,
    borderRadius: 20,
    border: "1px solid rgba(228,239,22,0.22)",
    background: "rgba(228,239,22,0.08)",
    color: "#e4ef16",
    fontWeight: 950,
    fontSize: 15,
    cursor: "pointer",
    marginTop: 18,
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    padding: 6,
    borderRadius: 22,
    background: "rgba(0,0,0,0.28)",
    marginBottom: 24,
  },
  tab: {
    minHeight: 46,
    borderRadius: 17,
    border: 0,
    background: "transparent",
    color: "rgba(255,255,255,0.58)",
    fontWeight: 950,
    cursor: "pointer",
  },
  tabActive: {
    minHeight: 46,
    borderRadius: 17,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    cursor: "pointer",
  },
  heading: {
    margin: 0,
    fontSize: "clamp(38px, 10vw, 58px)",
    lineHeight: 0.98,
    letterSpacing: "-0.06em",
  },
  subtitle: {
    margin: "14px 0 0",
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
  },
  form: {
    display: "grid",
    gap: 16,
    marginTop: 26,
  },
  label: {
    display: "grid",
    gap: 8,
    color: "rgba(255,255,255,0.78)",
    fontWeight: 850,
    fontSize: 13,
  },
  input: {
    width: "100%",
    minHeight: 54,
    borderRadius: 19,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.32)",
    color: "white",
    padding: "0 15px",
    boxSizing: "border-box",
    fontSize: 16,
    outline: "none",
  },
  message: {
    borderRadius: 18,
    padding: 14,
    background: "rgba(228,239,22,0.08)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "rgba(255,255,255,0.82)",
    lineHeight: 1.45,
  },
  primaryButton: {
    width: "100%",
    minHeight: 58,
    borderRadius: 22,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    fontSize: 17,
    cursor: "pointer",
    boxShadow: "0 18px 38px rgba(228,239,22,0.16)",
  },
};
