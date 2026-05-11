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

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const user = await getCurrentUser();
        if (!mounted) return;
        if (!user?.id) {
          setChecking(false);
          return;
        }

        const profile = await getProfile(user.id);
        if (!mounted) return;
        router.replace(getNextAuthPath(profile));
      } catch (error) {
        console.error("Session check failed", error);
        if (mounted) {
          setMessage(error?.message || "Could not check your session.");
          setChecking(false);
        }
      }
    }

    checkSession();
    return () => {
      mounted = false;
    };
  }, [router]);

  async function submit(event) {
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
      const profile = await getProfile(user?.id);
      router.replace(getNextAuthPath(profile));
    } catch (error) {
      console.error("Auth error", error);
      setMessage(error?.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main style={styles.page}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />
        <section style={styles.card}>
          <div style={styles.title}>Checking session...</div>
          {message ? <p style={styles.message}>{message}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />

      <section style={styles.card}>
        <div style={styles.tabs}>
          <button type="button" onClick={() => setMode("signin")} style={mode === "signin" ? styles.tabActive : styles.tab}>
            Sign in
          </button>
          <button type="button" onClick={() => setMode("signup")} style={mode === "signup" ? styles.tabActive : styles.tab}>
            Create account
          </button>
        </div>

        <h1 style={styles.heading}>{mode === "signin" ? "Welcome back" : "Join Endurance"}</h1>
        <p style={styles.subtitle}>Verified profiles, preferred sports and safer training together.</p>

        <form onSubmit={submit} style={styles.form}>
          <label style={styles.label}>
            Email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" style={styles.input} />
          </label>

          <label style={styles.label}>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={mode === "signin" ? "current-password" : "new-password"} style={styles.input} />
          </label>

          {message ? <div style={styles.message}>{message}</div> : null}

          <button type="submit" disabled={loading} style={styles.primaryButton}>
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top right, rgba(228,239,22,0.16), transparent 32%), radial-gradient(circle at 10% 24%, rgba(120,160,20,0.14), transparent 34%), linear-gradient(180deg, #07100b 0%, #050505 62%, #020202 100%)",
    color: "white",
    padding: "24px 18px 34px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "grid",
    justifyItems: "center",
    alignContent: "start",
    gap: 24,
  },
  logo: { width: "min(440px, 88vw)", height: "auto", marginTop: 18, objectFit: "contain" },
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
  tabs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 6, borderRadius: 22, background: "rgba(0,0,0,0.28)", marginBottom: 24 },
  tab: { minHeight: 46, borderRadius: 17, border: 0, background: "transparent", color: "rgba(255,255,255,0.58)", fontWeight: 950, cursor: "pointer" },
  tabActive: { minHeight: 46, borderRadius: 17, border: 0, background: "#e9ff00", color: "#07100b", fontWeight: 950, cursor: "pointer" },
  title: { fontSize: 20, fontWeight: 800 },
  heading: { margin: "0 0 10px", fontSize: "clamp(34px, 9vw, 54px)", lineHeight: 0.94, letterSpacing: -2.5 },
  subtitle: { margin: "0 0 22px", color: "rgba(255,255,255,0.68)", fontSize: 17, lineHeight: 1.45 },
  form: { display: "grid", gap: 16 },
  label: { display: "grid", gap: 8, color: "rgba(255,255,255,0.82)", fontWeight: 800, fontSize: 14 },
  input: { minHeight: 56, borderRadius: 20, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.35)", color: "white", padding: "0 16px", fontSize: 16, outline: "none" },
  message: { borderRadius: 18, padding: 14, background: "rgba(233,255,0,0.10)", border: "1px solid rgba(233,255,0,0.20)", color: "#f4ff8a", fontWeight: 750, lineHeight: 1.35 },
  primaryButton: { minHeight: 58, borderRadius: 999, border: 0, background: "#e9ff00", color: "#07100b", fontSize: 17, fontWeight: 950, cursor: "pointer", boxShadow: "0 18px 55px rgba(233,255,0,0.22)" },
};
