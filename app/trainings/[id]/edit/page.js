"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

function toDateInput(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function toTimeInput(value) {
  if (!value) return "";
  try {
    return new Date(value).toTimeString().slice(0, 5);
  } catch {
    return "";
  }
}

function combineDateTime(date, time) {
  if (!date || !time) return null;
  return new Date(`${date}T${time}:00`).toISOString();
}

export default function EditTrainingPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [user, setUser] = useState(null);
  const [training, setTraining] = useState(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    start_location: "",
    date: "",
    time: "",
    distance_km: "",
    intensity_label: "",
    visibility: "public",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canSave = useMemo(() => {
    return Boolean(user?.id && training?.creator_id === user.id && form.title.trim());
  }, [user?.id, training?.creator_id, form.title]);

  useEffect(() => {
    loadTraining();
  }, [id]);

  async function loadTraining() {
    if (!id) return;

    setLoading(true);
    setMessage("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user || null;
      setUser(currentUser);

      if (!currentUser?.id) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setMessage("Training not found.");
        return;
      }

      if (data.creator_id !== currentUser.id) {
        setMessage("You can only edit trainings you created yourself.");
      }

      const start = data.final_starts_at || data.starts_at;

      setTraining(data);
      setForm({
        title: data.title || "",
        description: data.description || "",
        start_location: data.start_location || "",
        date: toDateInput(start),
        time: toTimeInput(start),
        distance_km: data.distance_km || "",
        intensity_label: data.intensity_label || "",
        visibility: data.visibility || "public",
      });
    } catch (error) {
      console.error("Edit training load error", error);
      setMessage(error?.message || "Could not load training.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function saveTraining(event) {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setMessage("");

    try {
      const startsAt = combineDateTime(form.date, form.time);

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        start_location: form.start_location.trim(),
        distance_km: form.distance_km === "" ? null : Number(form.distance_km),
        intensity_label: form.intensity_label.trim() || null,
        visibility: form.visibility,
        updated_at: new Date().toISOString(),
      };

      if (startsAt) {
        payload.planning_type = "fixed";
        payload.starts_at = startsAt;
        payload.final_starts_at = null;
        payload.flexible_date = null;
        payload.flexible_start_time = null;
        payload.flexible_end_time = null;
      }

      const { error } = await supabase
        .from("training_sessions")
        .update(payload)
        .eq("id", training.id)
        .eq("creator_id", user.id);

      if (error) throw error;

      router.replace(`/trainings/${training.id}`);
    } catch (error) {
      console.error("Save training error", error);
      setMessage(error?.message || "Could not save training.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />

        <Link href={id ? `/trainings/${id}` : "/trainings"} style={styles.backLink}>
          ← Back
        </Link>

        <section style={styles.card}>
          <p style={styles.kicker}>Edit training</p>
          <h1 style={styles.title}>Update session</h1>

          {loading ? <p style={styles.muted}>Loading training...</p> : null}
          {message ? <p style={styles.message}>{message}</p> : null}

          {!loading && training ? (
            <form onSubmit={saveTraining} style={styles.form}>
              <label style={styles.label}>
                Training name
                <input value={form.title} onChange={(event) => updateField("title", event.target.value)} style={styles.input} />
              </label>

              <label style={styles.label}>
                Description
                <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} rows={4} style={styles.textarea} />
              </label>

              <label style={styles.label}>
                Location
                <input value={form.start_location} onChange={(event) => updateField("start_location", event.target.value)} style={styles.input} />
              </label>

              <div style={styles.twoCols}>
                <label style={styles.label}>
                  Date
                  <input type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} style={styles.input} />
                </label>

                <label style={styles.label}>
                  Time
                  <input type="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} style={styles.input} />
                </label>
              </div>

              <div style={styles.twoCols}>
                <label style={styles.label}>
                  Distance km
                  <input type="number" step="0.1" value={form.distance_km} onChange={(event) => updateField("distance_km", event.target.value)} style={styles.input} />
                </label>

                <label style={styles.label}>
                  Effort
                  <input value={form.intensity_label} onChange={(event) => updateField("intensity_label", event.target.value)} style={styles.input} />
                </label>
              </div>

              <label style={styles.label}>
                Visibility
                <select value={form.visibility} onChange={(event) => updateField("visibility", event.target.value)} style={styles.input}>
                  <option value="public">Public</option>
                  <option value="team">Team</option>
                  <option value="private">Private</option>
                  <option value="selected">Selected</option>
                  <option value="group">Group</option>
                </select>
              </label>

              <div style={styles.actions}>
                <button type="submit" disabled={!canSave || saving} style={styles.primaryButton}>
                  {saving ? "Saving..." : "Save changes"}
                </button>

                <Link href={`/trainings/${training.id}`} style={styles.secondaryLink}>
                  Cancel
                </Link>
              </div>
            </form>
          ) : null}
        </section>
      </section>
    </main>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 16px 60px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: {
    width: "min(720px, 100%)",
    margin: "0 auto",
    display: "grid",
    gap: 18,
  },
  logo: {
    width: "min(280px, 72vw)",
    height: "auto",
    justifySelf: "center",
  },
  backLink: {
    width: "fit-content",
    color: "#e4ef16",
    textDecoration: "none",
    fontWeight: 950,
    border: "1px solid rgba(228,239,22,0.24)",
    borderRadius: 999,
    padding: "10px 14px",
    background: "rgba(228,239,22,0.08)",
  },
  card: {
    borderRadius: 32,
    padding: 22,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.34)",
  },
  kicker: {
    margin: 0,
    color: "#e4ef16",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: "8px 0 18px",
    fontSize: "clamp(36px, 9vw, 64px)",
    lineHeight: 0.96,
    letterSpacing: "-0.07em",
  },
  form: {
    display: "grid",
    gap: 14,
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 8,
    color: "rgba(255,255,255,0.72)",
    fontWeight: 850,
  },
  input: {
    width: "100%",
    minHeight: 54,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 14px",
    fontSize: 16,
    outline: "none",
  },
  textarea: {
    width: "100%",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: 14,
    fontSize: 16,
    outline: "none",
    resize: "vertical",
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    paddingTop: 8,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 20px",
    fontWeight: 950,
    cursor: "pointer",
  },
  secondaryLink: {
    minHeight: 54,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 20px",
    fontWeight: 950,
    textDecoration: "none",
    display: "inline-grid",
    placeItems: "center",
  },
  muted: {
    color: "rgba(255,255,255,0.66)",
  },
  message: {
    borderRadius: 18,
    padding: 12,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
};
