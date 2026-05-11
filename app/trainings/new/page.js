"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const sportOptions = [
  { id: "running", label: "Running", route: true, workout: false },
  { id: "trail_running", label: "Trail Running", route: true, workout: false },
  { id: "road_cycling", label: "Road Cycling", route: true, workout: false },
  { id: "gravel_cycling", label: "Gravel Cycling", route: true, workout: false },
  { id: "mountain_biking", label: "Mountain Biking", route: true, workout: false },
  { id: "walking", label: "Walking", route: true, workout: false },
  { id: "kayaking", label: "Kayaking", route: true, workout: false },
  { id: "strength_training", label: "Strength Training", route: false, workout: true },
  { id: "crossfit", label: "CrossFit", route: false, workout: true },
  { id: "hyrox", label: "HYROX", route: false, workout: true },
  { id: "bootcamp", label: "Bootcamp", route: false, workout: true },
  { id: "swimming", label: "Swimming", route: false, workout: false },
  { id: "padel", label: "Padel", route: false, workout: false },
];

export default function CreateTrainingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    sports: ["running"],
    visibility: "public",
    planning_type: "fixed",
    date: "",
    time: "",
    flexible_date: "",
    flexible_start_time: "",
    flexible_end_time: "",
    start_location: "",
    distance_km: "",
    estimated_duration_min: "",
    intensity_label: "easy",
    pace_min: "",
    pace_max: "",
    speed_min: "",
    speed_max: "",
    max_participants: "",
    is_outdoor: true,
  });

  const selectedSports = useMemo(
    () => sportOptions.filter((sport) => form.sports.includes(sport.id)),
    [form.sports]
  );

  const supportsRoutes = selectedSports.some((sport) => sport.route);
  const supportsWorkouts = selectedSports.some((sport) => sport.workout);
  const hasCycling = form.sports.some((sport) => ["road_cycling", "gravel_cycling", "mountain_biking"].includes(sport));
  const hasRunning = form.sports.some((sport) => ["running", "trail_running"].includes(sport));

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const toggleSport = (sportId) => {
    setForm((current) => {
      const exists = current.sports.includes(sportId);
      const next = exists
        ? current.sports.filter((item) => item !== sportId)
        : [...current.sports, sportId];

      return { ...current, sports: next.length ? next : current.sports };
    });
  };

  const saveTraining = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!form.title.trim()) return setMessage("Add a clear training title.");
    if (!form.start_location.trim()) return setMessage("Add a start location.");

    try {
      setSaving(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (!user?.id) {
        setMessage("Creating trainings requires login. Auth/onboarding is the next build step.");
        return;
      }

      let startsAt = null;
      if (form.planning_type === "fixed" && form.date && form.time) {
        startsAt = new Date(`${form.date}T${form.time}`).toISOString();
      }

      const payload = {
        creator_id: user.id,
        title: form.title.trim(),
        description: form.description.trim(),
        sports: form.sports,
        visibility: form.visibility,
        planning_type: form.planning_type,
        starts_at: startsAt,
        flexible_date: form.planning_type === "flexible" ? form.flexible_date || null : null,
        flexible_start_time: form.planning_type === "flexible" ? form.flexible_start_time || null : null,
        flexible_end_time: form.planning_type === "flexible" ? form.flexible_end_time || null : null,
        start_location: form.start_location.trim(),
        is_outdoor: Boolean(form.is_outdoor),
        distance_km: form.distance_km ? Number(form.distance_km) : null,
        estimated_duration_min: form.estimated_duration_min ? Number(form.estimated_duration_min) : null,
        intensity_label: form.intensity_label || null,
        pace_min: form.pace_min || null,
        pace_max: form.pace_max || null,
        speed_min: form.speed_min ? Number(form.speed_min) : null,
        speed_max: form.speed_max ? Number(form.speed_max) : null,
        max_participants: form.max_participants ? Number(form.max_participants) : null,
      };

      const { data, error } = await supabase
        .from("training_sessions")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      router.push(`/trainings/${data.id}`);
    } catch (err) {
      console.error(err);
      setMessage(err?.message || "Could not create training.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />
        <Link href="/trainings" style={styles.backLink}>← Back to trainings</Link>

        <header style={styles.header}>
          <div style={styles.kicker}>Create Training</div>
          <h1 style={styles.title}>Build a session people want to join.</h1>
          <p style={styles.subtitle}>Keep it clear: sport, time, location, intensity and visibility.</p>
        </header>

        <form onSubmit={saveTraining} style={styles.formCard}>
          <section style={styles.section}>
            <div style={styles.sectionTitle}>1. Basics</div>
            <label style={styles.label}>Title
              <input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Evening Tempo Run" style={styles.input} />
            </label>
            <label style={styles.label}>Description
              <textarea value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What kind of session is this?" style={styles.textarea} />
            </label>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>2. Sports</div>
            <div style={styles.sportGrid}>
              {sportOptions.map((sport) => {
                const active = form.sports.includes(sport.id);
                return (
                  <button type="button" key={sport.id} onClick={() => toggleSport(sport.id)} style={active ? styles.sportActive : styles.sportButton}>
                    {sport.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>3. Planning</div>
            <div style={styles.toggleRow}>
              <button type="button" onClick={() => update("planning_type", "fixed")} style={form.planning_type === "fixed" ? styles.toggleActive : styles.toggleButton}>Fixed time</button>
              <button type="button" onClick={() => update("planning_type", "flexible")} style={form.planning_type === "flexible" ? styles.toggleActive : styles.toggleButton}>Flexible time</button>
            </div>

            {form.planning_type === "fixed" ? (
              <div style={styles.twoColumns}>
                <label style={styles.label}>Date
                  <input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} style={styles.input} />
                </label>
                <label style={styles.label}>Start time
                  <input type="time" value={form.time} onChange={(event) => update("time", event.target.value)} style={styles.input} />
                </label>
              </div>
            ) : (
              <>
                <label style={styles.label}>Flexible date
                  <input type="date" value={form.flexible_date} onChange={(event) => update("flexible_date", event.target.value)} style={styles.input} />
                </label>
                <div style={styles.twoColumns}>
                  <label style={styles.label}>Possible from
                    <input type="time" value={form.flexible_start_time} onChange={(event) => update("flexible_start_time", event.target.value)} style={styles.input} />
                  </label>
                  <label style={styles.label}>Possible until
                    <input type="time" value={form.flexible_end_time} onChange={(event) => update("flexible_end_time", event.target.value)} style={styles.input} />
                  </label>
                </div>
                <p style={styles.hint}>This is a possible start window. The final time can be chosen later.</p>
              </>
            )}
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>4. Location & effort</div>
            <label style={styles.label}>Start location
              <input value={form.start_location} onChange={(event) => update("start_location", event.target.value)} placeholder="Landgraaf, Brunssummerheide, gym..." style={styles.input} />
            </label>

            <div style={styles.twoColumns}>
              <label style={styles.label}>Distance km
                <input type="number" min="0" step="0.1" value={form.distance_km} onChange={(event) => update("distance_km", event.target.value)} style={styles.input} />
              </label>
              <label style={styles.label}>Duration min
                <input type="number" min="0" value={form.estimated_duration_min} onChange={(event) => update("estimated_duration_min", event.target.value)} style={styles.input} />
              </label>
            </div>

            <label style={styles.label}>Intensity
              <select value={form.intensity_label} onChange={(event) => update("intensity_label", event.target.value)} style={styles.input}>
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="hard">Hard</option>
                <option value="race pace">Race pace</option>
                <option value="heavy">Heavy</option>
              </select>
            </label>

            {hasRunning ? (
              <div style={styles.twoColumns}>
                <label style={styles.label}>Pace from
                  <input value={form.pace_min} onChange={(event) => update("pace_min", event.target.value)} placeholder="5:30" style={styles.input} />
                </label>
                <label style={styles.label}>Pace to
                  <input value={form.pace_max} onChange={(event) => update("pace_max", event.target.value)} placeholder="6:00" style={styles.input} />
                </label>
              </div>
            ) : null}

            {hasCycling ? (
              <div style={styles.twoColumns}>
                <label style={styles.label}>Speed from
                  <input type="number" value={form.speed_min} onChange={(event) => update("speed_min", event.target.value)} placeholder="28" style={styles.input} />
                </label>
                <label style={styles.label}>Speed to
                  <input type="number" value={form.speed_max} onChange={(event) => update("speed_max", event.target.value)} placeholder="32" style={styles.input} />
                </label>
              </div>
            ) : null}
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>5. Visibility</div>
            <label style={styles.label}>Who can see this?
              <select value={form.visibility} onChange={(event) => update("visibility", event.target.value)} style={styles.input}>
                <option value="public">All users</option>
                <option value="private">Only me</option>
                <option value="team">My team</option>
                <option value="selected">Selected members</option>
                <option value="group">Group</option>
              </select>
            </label>
            <label style={styles.label}>Max participants
              <input type="number" min="1" value={form.max_participants} onChange={(event) => update("max_participants", event.target.value)} placeholder="Optional" style={styles.input} />
            </label>
          </section>

          {supportsRoutes ? <section style={styles.infoCard}><div style={styles.infoTitle}>Route options</div><p style={styles.hint}>This sport supports routes. Upload GPX, saved routes and Route Wizard come in the route module.</p></section> : null}
          {supportsWorkouts ? <section style={styles.infoCard}><div style={styles.infoTitle}>Workout options</div><p style={styles.hint}>This sport supports generated workouts. Workout Generator comes in the workout module.</p></section> : null}

          {message ? <div style={styles.message}>{message}</div> : null}

          <button type="submit" disabled={saving} style={styles.submitButton}>
            {saving ? "Creating..." : "Create Training"}
          </button>
        </form>
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)", color: "white", padding: "24px 18px 34px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  shell: { width: "min(760px, 100%)", margin: "0 auto", display: "grid", gap: 20 },
  logo: { width: "min(330px, 76vw)", height: "auto", justifySelf: "center", objectFit: "contain" },
  backLink: { width: "fit-content", color: "#e4ef16", textDecoration: "none", fontWeight: 950 },
  header: { display: "grid", gap: 8 },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  title: { margin: 0, fontSize: "clamp(38px, 10vw, 66px)", lineHeight: 0.96, letterSpacing: "-0.065em" },
  subtitle: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.5 },
  formCard: { borderRadius: 36, padding: 22, background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 30px 90px rgba(0,0,0,0.40)", display: "grid", gap: 20 },
  section: { display: "grid", gap: 14 },
  sectionTitle: { color: "#e4ef16", fontWeight: 950, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 12 },
  label: { display: "grid", gap: 8, color: "rgba(255,255,255,0.78)", fontWeight: 850, fontSize: 13 },
  input: { width: "100%", minHeight: 52, borderRadius: 18, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.32)", color: "white", padding: "0 15px", boxSizing: "border-box", fontSize: 16, outline: "none" },
  textarea: { width: "100%", minHeight: 96, borderRadius: 18, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.32)", color: "white", padding: 15, boxSizing: "border-box", fontSize: 16, outline: "none", resize: "vertical" },
  sportGrid: { display: "flex", flexWrap: "wrap", gap: 9 },
  sportButton: { borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.76)", padding: "11px 13px", fontWeight: 850, cursor: "pointer" },
  sportActive: { borderRadius: 999, border: "1px solid rgba(228,239,22,0.40)", background: "rgba(228,239,22,0.14)", color: "#e4ef16", padding: "11px 13px", fontWeight: 950, cursor: "pointer" },
  toggleRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  toggleButton: { minHeight: 48, borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.74)", fontWeight: 900, cursor: "pointer" },
  toggleActive: { minHeight: 48, borderRadius: 18, border: "1px solid rgba(228,239,22,0.40)", background: "#e4ef16", color: "#101406", fontWeight: 950, cursor: "pointer" },
  twoColumns: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  hint: { color: "rgba(255,255,255,0.62)", lineHeight: 1.5, margin: 0 },
  infoCard: { borderRadius: 22, padding: 16, background: "rgba(228,239,22,0.075)", border: "1px solid rgba(228,239,22,0.18)" },
  infoTitle: { color: "#e4ef16", fontWeight: 950, marginBottom: 6 },
  message: { borderRadius: 18, padding: 14, background: "rgba(228,239,22,0.08)", border: "1px solid rgba(228,239,22,0.18)", color: "rgba(255,255,255,0.82)", lineHeight: 1.45 },
  submitButton: { width: "100%", minHeight: 58, borderRadius: 22, border: 0, background: "#e4ef16", color: "#101406", fontWeight: 950, fontSize: 17, cursor: "pointer", boxShadow: "0 18px 38px rgba(228,239,22,0.16)" },
};
