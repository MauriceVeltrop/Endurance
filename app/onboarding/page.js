"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { sportOptions } from "../../lib/sportsConfig";

export default function OnboardingPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    avatar_url: "",
    location: "",
    birth_date: "",
    sports: ["running"],
  });

  const selectedSports = useMemo(
    () => sportOptions.filter((sport) => form.sports.includes(sport.id)),
    [form.sports]
  );

  const checkUser = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const currentUser = data?.user;

      if (!currentUser?.id) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);
      setForm((current) => ({
        ...current,
        email: currentUser.email || "",
      }));

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profile) {
        setForm((current) => ({
          ...current,
          name: profile.name || "",
          email: profile.email || currentUser.email || "",
          avatar_url: profile.avatar_url || "",
          location: profile.location || "",
          birth_date: profile.birth_date || "",
        }));

        if (profile.onboarding_completed) {
          router.replace("/trainings");
        }
      }

      const { data: userSports } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", currentUser.id);

      if (userSports?.length) {
        setForm((current) => ({
          ...current,
          sports: userSports.map((item) => item.sport_id),
        }));
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkUser();
  }, []);

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleSport = (sportId) => {
    setForm((current) => {
      const exists = current.sports.includes(sportId);
      const next = exists
        ? current.sports.filter((item) => item !== sportId)
        : [...current.sports, sportId];

      return { ...current, sports: next.length ? next : current.sports };
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!form.name.trim()) return setMessage("Your real name is required.");
    if (!form.email.trim()) return setMessage("Email address is required.");
    if (!form.avatar_url.trim()) return setMessage("Profile photo URL is required for now.");
    if (!form.sports.length) return setMessage("Choose at least one preferred sport.");

    try {
      setSaving(true);

      const profilePayload = {
        id: user.id,
        name: form.name.trim(),
        email: form.email.trim(),
        avatar_url: form.avatar_url.trim(),
        location: form.location.trim() || null,
        birth_date: form.birth_date || null,
        role: "user",
        onboarding_completed: true,
      };

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (profileError) throw profileError;

      await supabase.from("user_sports").delete().eq("user_id", user.id);

      const rows = form.sports.map((sportId) => ({
        user_id: user.id,
        sport_id: sportId,
      }));

      const { error: sportsError } = await supabase
        .from("user_sports")
        .insert(rows);

      if (sportsError) throw sportsError;

      router.replace("/trainings");
    } catch (err) {
      console.error("Onboarding error", err);
      setMessage(err?.message || "Could not complete onboarding.");
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <main style={styles.page}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />
        <section style={styles.card}>
          <div style={styles.stateTitle}>Loading onboarding...</div>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />

        <header style={styles.header}>
          <div style={styles.kicker}>Verified Profile</div>
          <h1 style={styles.title}>Complete your training identity.</h1>
          <p style={styles.subtitle}>
            Endurance uses real profiles and preferred sports to keep the community clean and relevant.
          </p>
        </header>

        <form onSubmit={save} style={styles.card}>
          <section style={styles.section}>
            <div style={styles.sectionTitle}>1. Profile</div>

            <label style={styles.label}>
              Real name
              <input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Your real name"
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder="you@example.com"
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              Profile photo URL
              <input
                value={form.avatar_url}
                onChange={(event) => update("avatar_url", event.target.value)}
                placeholder="https://..."
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              City / region
              <input
                value={form.location}
                onChange={(event) => update("location", event.target.value)}
                placeholder="Landgraaf"
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              Birth date
              <input
                type="date"
                value={form.birth_date}
                onChange={(event) => update("birth_date", event.target.value)}
                style={styles.input}
              />
            </label>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>2. Preferred sports</div>

            <div style={styles.sportGrid}>
              {sportOptions.map((sport) => {
                const active = form.sports.includes(sport.id);

                return (
                  <button
                    type="button"
                    key={sport.id}
                    onClick={() => toggleSport(sport.id)}
                    style={active ? styles.sportActive : styles.sportButton}
                  >
                    {sport.label}
                  </button>
                );
              })}
            </div>

            <div style={styles.summaryCard}>
              <div style={styles.summaryLabel}>Selected</div>
              <div style={styles.summaryText}>
                {selectedSports.map((sport) => sport.label).join(", ")}
              </div>
            </div>
          </section>

          {message ? <div style={styles.message}>{message}</div> : null}

          <button type="submit" disabled={saving} style={styles.primaryButton}>
            {saving ? "Saving..." : "Complete onboarding"}
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
  },
  shell: {
    width: "min(760px, 100%)",
    margin: "0 auto",
    display: "grid",
    gap: 20,
  },
  logo: {
    width: "min(360px, 80vw)",
    height: "auto",
    justifySelf: "center",
    objectFit: "contain",
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
  },
  card: {
    borderRadius: 36,
    padding: 22,
    background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.40)",
    display: "grid",
    gap: 22,
  },
  section: { display: "grid", gap: 14 },
  sectionTitle: {
    color: "#e4ef16",
    fontWeight: 950,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontSize: 12,
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
    minHeight: 52,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.32)",
    color: "white",
    padding: "0 15px",
    boxSizing: "border-box",
    fontSize: 16,
    outline: "none",
  },
  sportGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 9,
  },
  sportButton: {
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.76)",
    padding: "11px 13px",
    fontWeight: 850,
    cursor: "pointer",
  },
  sportActive: {
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.40)",
    background: "rgba(228,239,22,0.14)",
    color: "#e4ef16",
    padding: "11px 13px",
    fontWeight: 950,
    cursor: "pointer",
  },
  summaryCard: {
    borderRadius: 20,
    padding: 15,
    background: "rgba(228,239,22,0.07)",
    border: "1px solid rgba(228,239,22,0.16)",
  },
  summaryLabel: {
    color: "#e4ef16",
    fontWeight: 950,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 5,
  },
  summaryText: {
    color: "rgba(255,255,255,0.84)",
    lineHeight: 1.4,
    fontWeight: 850,
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
  stateTitle: {
    fontSize: 22,
    fontWeight: 950,
  },
};
