"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";
import { sportOptions } from "../../lib/sportsConfig";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [selectedSports, setSelectedSports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const formName = useMemo(() => {
    const first = profile?.first_name || "";
    const last = profile?.last_name || "";
    return `${first} ${last}`.trim();
  }, [profile?.first_name, profile?.last_name]);

  const loadProfile = async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData?.user;

      if (!currentUser?.id) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,location,birth_date,role,onboarding_completed,blocked,first_name,last_name")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      setProfile(profileRow || {
        id: currentUser.id,
        email: currentUser.email || "",
        first_name: "",
        last_name: "",
        name: "",
        avatar_url: "",
        location: "",
        birth_date: "",
        role: "user",
        onboarding_completed: false,
      });

      const { data: sportRows, error: sportError } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", currentUser.id);

      if (sportError) throw sportError;
      setSelectedSports((sportRows || []).map((row) => row.sport_id));
    } catch (err) {
      console.error("Profile load error", err);
      setMessage(err?.message || "Could not load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const updateProfileValue = (key, value) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const toggleSport = (sportId) => {
    setSelectedSports((current) => {
      if (current.includes(sportId)) return current.filter((id) => id !== sportId);
      return [...current, sportId];
    });
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!user?.id) return router.replace("/login");
    if (!profile?.first_name?.trim()) return setMessage("First name is required.");
    if (!profile?.last_name?.trim()) return setMessage("Last name is required.");
    if (!profile?.email?.trim()) return setMessage("Email is required.");
    if (!selectedSports.length) return setMessage("Choose at least one preferred sport.");

    try {
      setSaving(true);

      const cleanName = `${profile.first_name.trim()} ${profile.last_name.trim()}`.trim();
      const payload = {
        id: user.id,
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim(),
        name: cleanName,
        email: profile.email.trim(),
        avatar_url: profile.avatar_url || null,
        location: profile.location || null,
        birth_date: profile.birth_date || null,
        onboarding_completed: true,
      };

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (profileError) throw profileError;

      const { error: deleteError } = await supabase
        .from("user_sports")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      const rows = selectedSports.map((sportId) => ({ user_id: user.id, sport_id: sportId }));
      const { error: insertError } = await supabase.from("user_sports").insert(rows);

      if (insertError) throw insertError;

      setMessage("Profile saved.");
      await loadProfile();
    } catch (err) {
      console.error("Profile save error", err);
      setMessage(err?.message || "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main style={styles.page}>
        <section style={styles.shell}>
          <AppHeader profile={profile} compact />
          <section style={styles.stateCard}>
            <div style={styles.stateTitle}>Loading profile...</div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <button type="button" onClick={() => router.push("/trainings")} style={styles.backButton}>
          ← Back to trainings
        </button>

        <header style={styles.headerCard}>
          <div style={styles.avatarLarge}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={styles.avatarImage} /> : getInitials(formName || profile?.email)}
          </div>
          <div>
            <div style={styles.kicker}>Profile</div>
            <h1 style={styles.title}>{formName || "Complete your profile"}</h1>
            <p style={styles.subtitle}>Preferred sports determine what you can create and what appears in your training feed.</p>
          </div>
        </header>

        <form onSubmit={saveProfile} style={styles.formCard}>
          <section style={styles.section}>
            <div style={styles.sectionTitle}>Identity</div>

            <div style={styles.twoColumns}>
              <label style={styles.label}>
                First name
                <input value={profile?.first_name || ""} onChange={(event) => updateProfileValue("first_name", event.target.value)} style={styles.input} />
              </label>

              <label style={styles.label}>
                Last name
                <input value={profile?.last_name || ""} onChange={(event) => updateProfileValue("last_name", event.target.value)} style={styles.input} />
              </label>
            </div>

            <label style={styles.label}>
              Email
              <input type="email" value={profile?.email || ""} onChange={(event) => updateProfileValue("email", event.target.value)} style={styles.input} />
            </label>

            <label style={styles.label}>
              Location
              <input value={profile?.location || ""} onChange={(event) => updateProfileValue("location", event.target.value)} placeholder="City or region" style={styles.input} />
            </label>

            <label style={styles.label}>
              Avatar URL for now
              <input value={profile?.avatar_url || ""} onChange={(event) => updateProfileValue("avatar_url", event.target.value)} placeholder="Avatar upload stays in onboarding; URL can be edited here temporarily" style={styles.input} />
            </label>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>Preferred sports</div>
            <div style={styles.sportGrid}>
              {sportOptions.map((sport) => {
                const active = selectedSports.includes(sport.id);
                return (
                  <button key={sport.id} type="button" onClick={() => toggleSport(sport.id)} style={active ? styles.sportActive : styles.sportButton}>
                    {sport.label}
                  </button>
                );
              })}
            </div>
          </section>

          {message ? <div style={message === "Profile saved." ? styles.successMessage : styles.message}>{message}</div> : null}

          <button type="submit" disabled={saving} style={styles.primaryButton}>
            {saving ? "Saving..." : "Save profile"}
          </button>
        </form>
      </section>
    </main>
  );
}

function getInitials(value) {
  return String(value || "E")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "E";
}

const baseButton = { border: 0, cursor: "pointer", fontWeight: 950 };

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 18px 34px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: { width: "min(860px, 100%)", margin: "0 auto", display: "grid", gap: 18 },
  backButton: { ...baseButton, width: "fit-content", minHeight: 42, borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.82)", padding: "0 14px" },
  headerCard: { display: "grid", gridTemplateColumns: "88px 1fr", gap: 18, alignItems: "center", borderRadius: 32, padding: 22, background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 24px 70px rgba(0,0,0,0.30)" },
  avatarLarge: { width: 88, height: 88, borderRadius: 30, overflow: "hidden", display: "grid", placeItems: "center", background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.24)", color: "#e4ef16", fontWeight: 950, fontSize: 28 },
  avatarImage: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  title: { margin: "5px 0 0", fontSize: "clamp(32px, 8vw, 56px)", lineHeight: 0.96, letterSpacing: "-0.06em" },
  subtitle: { margin: "12px 0 0", color: "rgba(255,255,255,0.68)", lineHeight: 1.5 },
  formCard: { display: "grid", gap: 18, borderRadius: 32, padding: 22, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.12)" },
  section: { display: "grid", gap: 14 },
  sectionTitle: { fontSize: 18, fontWeight: 950 },
  twoColumns: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 },
  label: { display: "grid", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 13, fontWeight: 850 },
  input: { width: "100%", minHeight: 52, borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.26)", color: "white", padding: "0 14px", boxSizing: "border-box", fontSize: 16, outline: "none" },
  sportGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 },
  sportButton: { ...baseButton, minHeight: 50, borderRadius: 18, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.78)", border: "1px solid rgba(255,255,255,0.12)" },
  sportActive: { ...baseButton, minHeight: 50, borderRadius: 18, background: "#e4ef16", color: "#101406", border: "1px solid rgba(228,239,22,0.55)", boxShadow: "0 14px 30px rgba(228,239,22,0.14)" },
  message: { borderRadius: 18, padding: 14, background: "rgba(255,120,80,0.12)", border: "1px solid rgba(255,160,120,0.22)", color: "rgba(255,255,255,0.86)", fontWeight: 800 },
  successMessage: { borderRadius: 18, padding: 14, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.25)", color: "#e4ef16", fontWeight: 900 },
  primaryButton: { ...baseButton, minHeight: 56, borderRadius: 20, background: "#e4ef16", color: "#101406", fontSize: 16, boxShadow: "0 18px 38px rgba(228,239,22,0.16)" },
  stateCard: { borderRadius: 28, padding: 22, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" },
  stateTitle: { fontSize: 22, fontWeight: 950 },
};
