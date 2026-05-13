"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import { supabase } from "../../../lib/supabase";
import { getSportLabel } from "../../../lib/trainingHelpers";

const workoutSportIds = ["strength_training", "crossfit", "hyrox", "bootcamp"];

function defaultBlocks(sportId) {
  if (sportId === "strength_training") return "Warm-up\nSquat 3x8\nBench Press 3x8\nRow 3x10";
  if (sportId === "hyrox") return "SkiErg 1000m\nSled Push\nWall Balls\nRun 1000m";
  if (sportId === "crossfit") return "Warm-up\nSkill block\nWOD\nCooldown";
  if (sportId === "bootcamp") return "Run block\nBodyweight circuit\nCore finisher";
  return "";
}

function parseBlocks(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name, index) => ({ id: index + 1, name }));
}

export default function NewWorkoutPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [allowedSportIds, setAllowedSportIds] = useState([]);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    sport_id: "",
    title: "",
    description: "",
    workout_type: "session",
    level: "all levels",
    duration_min: "",
    visibility: "public",
    blocksText: "",
  });

  const availableWorkoutSports = useMemo(
    () => allowedSportIds.filter((sportId) => workoutSportIds.includes(sportId)),
    [allowedSportIds]
  );

  useEffect(() => {
    loadAccess();
  }, []);

  async function loadAccess() {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      setProfile(profileRow);

      const { data: sportRows, error: sportError } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);

      if (sportError) throw sportError;

      const allowed = (sportRows || []).map((row) => row.sport_id).filter(Boolean);
      setAllowedSportIds(allowed);

      const first = allowed.find((sportId) => workoutSportIds.includes(sportId));
      if (first) {
        setForm((current) => ({
          ...current,
          sport_id: first,
          title: `${getSportLabel(first)} Workout`,
          blocksText: defaultBlocks(first),
        }));
      }
    } catch (error) {
      console.error("Workout form error", error);
      setMessage(error?.message || "Could not prepare workout form.");
    } finally {
      setChecking(false);
    }
  }

  function update(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "sport_id") {
        next.title = current.title?.trim() ? current.title : `${getSportLabel(value)} Workout`;
        next.blocksText = current.blocksText?.trim() ? current.blocksText : defaultBlocks(value);
      }

      return next;
    });
  }

  async function saveWorkout(event) {
    event.preventDefault();
    setMessage("");

    if (!profile?.id) return router.replace("/login");
    if (!form.sport_id) return setMessage("Choose a workout sport.");
    if (!form.title.trim()) return setMessage("Add a workout title.");

    try {
      setSaving(true);

      const { error } = await supabase.from("workouts").insert({
        creator_id: profile.id,
        sport_id: form.sport_id,
        title: form.title.trim(),
        description: form.description.trim(),
        workout_type: form.workout_type.trim() || "session",
        level: form.level.trim() || "all levels",
        duration_min: form.duration_min ? Number(form.duration_min) : null,
        structure: { exercises: parseBlocks(form.blocksText) },
        visibility: form.visibility,
      });

      if (error) throw error;
      router.push("/workouts");
    } catch (error) {
      console.error("Workout save error", error);
      setMessage(error?.message || "Could not save workout.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <Link href="/workouts" style={styles.backLink}>← Back to workouts</Link>

        <header style={styles.header}>
          <div style={styles.kicker}>Workout Builder</div>
          <h1 style={styles.title}>Structure the session.</h1>
          <p style={styles.subtitle}>Create reusable workout structures for strength, HYROX, CrossFit and bootcamp.</p>
        </header>

        {message ? <section style={styles.message}>{message}</section> : null}

        {checking ? (
          <section style={styles.card}>Checking profile...</section>
        ) : (
          <form onSubmit={saveWorkout} style={styles.card}>
            <label style={styles.field}>
              <span>Sport</span>
              <select value={form.sport_id} onChange={(event) => update("sport_id", event.target.value)} style={styles.input}>
                <option value="">Choose sport</option>
                {availableWorkoutSports.map((sportId) => <option key={sportId} value={sportId}>{getSportLabel(sportId)}</option>)}
              </select>
            </label>

            <label style={styles.field}>
              <span>Title</span>
              <input value={form.title} onChange={(event) => update("title", event.target.value)} style={styles.input} />
            </label>

            <label style={styles.fieldFull}>
              <span>Description</span>
              <textarea value={form.description} onChange={(event) => update("description", event.target.value)} style={styles.textarea} />
            </label>

            <label style={styles.field}>
              <span>Type</span>
              <input value={form.workout_type} onChange={(event) => update("workout_type", event.target.value)} style={styles.input} />
            </label>

            <label style={styles.field}>
              <span>Level</span>
              <select value={form.level} onChange={(event) => update("level", event.target.value)} style={styles.input}>
                <option value="beginner">Beginner</option>
                <option value="all levels">All levels</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="race prep">Race prep</option>
              </select>
            </label>

            <label style={styles.field}>
              <span>Duration min</span>
              <input type="number" min="0" value={form.duration_min} onChange={(event) => update("duration_min", event.target.value)} style={styles.input} />
            </label>

            <label style={styles.field}>
              <span>Visibility</span>
              <select value={form.visibility} onChange={(event) => update("visibility", event.target.value)} style={styles.input}>
                <option value="public">Public</option>
                <option value="team">Team</option>
                <option value="private">Private</option>
                <option value="selected">Selected people</option>
                <option value="group">Group</option>
              </select>
            </label>

            <label style={styles.fieldFull}>
              <span>Blocks / exercises</span>
              <textarea value={form.blocksText} onChange={(event) => update("blocksText", event.target.value)} style={styles.blocksArea} />
            </label>

            <button type="submit" disabled={saving || !availableWorkoutSports.length} style={styles.submitButton}>
              {saving ? "Saving..." : "Save workout"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: { minHeight: "100vh", background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)", color: "white", padding: "18px 16px 56px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  shell: { width: "100%", maxWidth: 860, margin: "0 auto", display: "grid", gap: 18 },
  backLink: { width: "fit-content", color: "#e4ef16", textDecoration: "none", fontWeight: 950, border: "1px solid rgba(228,239,22,0.24)", borderRadius: 999, padding: "10px 14px", background: "rgba(228,239,22,0.08)" },
  header: { display: "grid", gap: 8 },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  title: { margin: 0, fontSize: "clamp(38px, 10vw, 66px)", lineHeight: 0.96, letterSpacing: "-0.065em" },
  subtitle: { margin: 0, maxWidth: 620, color: "rgba(255,255,255,0.68)", lineHeight: 1.5 },
  message: { borderRadius: 22, padding: 14, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.18)", color: "#e4ef16", fontWeight: 850 },
  card: { borderRadius: 32, padding: 22, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 },
  field: { display: "grid", gap: 7, color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 13 },
  fieldFull: { gridColumn: "1 / -1", display: "grid", gap: 7, color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 13 },
  input: { width: "100%", minHeight: 48, borderRadius: 16, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.24)", color: "white", padding: "0 12px", boxSizing: "border-box", outline: "none", fontSize: 15 },
  textarea: { width: "100%", minHeight: 96, borderRadius: 16, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.24)", color: "white", padding: 12, boxSizing: "border-box", outline: "none", fontSize: 15, resize: "vertical" },
  blocksArea: { width: "100%", minHeight: 160, borderRadius: 16, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.24)", color: "white", padding: 12, boxSizing: "border-box", outline: "none", fontSize: 15, resize: "vertical" },
  submitButton: { gridColumn: "1 / -1", minHeight: 54, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", fontWeight: 950, fontSize: 16, cursor: "pointer" },
};
