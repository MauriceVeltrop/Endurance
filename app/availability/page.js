"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value) {
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return value;
  }
}

export default function AvailabilityPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [weekStart, setWeekStart] = useState(todayString());
  const [availability, setAvailability] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [weekStart]);

  useEffect(() => {
    loadAvailability();
  }, [weekStart]);

  async function loadAvailability() {
    setLoading(true);
    setMessage("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      if (profileRow?.blocked) {
        setProfile(profileRow);
        setMessage("Your account is blocked. Contact an administrator.");
        return;
      }

      setProfile(profileRow);

      const from = days[0];
      const until = addDays(days[6], 1);

      const { data: rows, error } = await supabase
        .from("user_availability")
        .select("id,user_id,date,available_from,available_until,note")
        .eq("user_id", user.id)
        .gte("date", from)
        .lt("date", until)
        .order("date", { ascending: true });

      if (error) throw error;

      const next = {};
      for (const day of days) {
        next[day] = {
          id: "",
          date: day,
          available_from: "",
          available_until: "",
          note: "",
        };
      }

      for (const row of rows || []) {
        next[row.date] = {
          id: row.id,
          date: row.date,
          available_from: row.available_from?.slice(0, 5) || "",
          available_until: row.available_until?.slice(0, 5) || "",
          note: row.note || "",
        };
      }

      setAvailability(next);
    } catch (error) {
      console.error("Availability load error", error);
      setMessage(error?.message || "Could not load availability.");
    } finally {
      setLoading(false);
    }
  }

  function updateDay(day, field, value) {
    setAvailability((current) => ({
      ...current,
      [day]: {
        ...(current[day] || { date: day }),
        [field]: value,
      },
    }));
  }

  async function saveDay(day) {
    const row = availability[day];
    if (!profile?.id || !row) return;

    setSavingKey(day);
    setMessage("");

    try {
      if (!row.available_from && !row.available_until && !row.note.trim()) {
        if (row.id) {
          const { error } = await supabase
            .from("user_availability")
            .delete()
            .eq("id", row.id)
            .eq("user_id", profile.id);

          if (error) throw error;
        }

        setMessage("Availability cleared.");
        await loadAvailability();
        return;
      }

      if (!row.available_from || !row.available_until) {
        setMessage("Choose both a start and end time, or clear the row.");
        return;
      }

      if (row.available_from >= row.available_until) {
        setMessage("End time must be after start time.");
        return;
      }

      const payload = {
        user_id: profile.id,
        date: day,
        available_from: row.available_from,
        available_until: row.available_until,
        note: row.note.trim() || null,
      };

      const { error } = await supabase
        .from("user_availability")
        .upsert(payload, {
          onConflict: "user_id,date",
        });

      if (error) throw error;

      setMessage("Availability saved.");
      await loadAvailability();
    } catch (error) {
      console.error("Availability save error", error);
      setMessage(error?.message || "Could not save availability.");
    } finally {
      setSavingKey("");
    }
  }

  function clearDay(day) {
    updateDay(day, "available_from", "");
    updateDay(day, "available_until", "");
    updateDay(day, "note", "");
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Availability</div>
          <div style={styles.titleRow}>
            <h1 style={styles.title}>When can you train?</h1>
          </div>
          <p style={styles.subtitle}>
            Add your personal training availability. This will later power flexible training planning and smarter Team Up matching.
          </p>
        </header>

        {message ? <section style={styles.message}>{message}</section> : null}

        <section style={styles.weekNav}>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} style={styles.secondaryButton}>
            ← Previous
          </button>

          <div style={styles.weekLabel}>
            <strong>{formatDateLabel(days[0])}</strong>
            <span>to {formatDateLabel(days[6])}</span>
          </div>

          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} style={styles.secondaryButton}>
            Next →
          </button>
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.panelKicker}>Weekly planning</div>
              <h2 style={styles.panelTitle}>Available time slots</h2>
            </div>

            <button type="button" onClick={() => setWeekStart(todayString())} style={styles.smallGhostButton}>
              Today
            </button>
          </div>

          {loading ? (
            <p style={styles.panelText}>Loading availability...</p>
          ) : (
            <div style={styles.dayList}>
              {days.map((day) => {
                const row = availability[day] || {
                  available_from: "",
                  available_until: "",
                  note: "",
                };

                return (
                  <article key={day} style={styles.dayCard}>
                    <div style={styles.dayHeader}>
                      <div>
                        <div style={styles.dayLabel}>{formatDateLabel(day)}</div>
                        <div style={styles.dayDate}>{day}</div>
                      </div>
                    </div>

                    <div style={styles.timeGrid}>
                      <label style={styles.label}>
                        From
                        <input
                          type="time"
                          value={row.available_from || ""}
                          onChange={(event) => updateDay(day, "available_from", event.target.value)}
                          style={styles.input}
                        />
                      </label>

                      <label style={styles.label}>
                        Until
                        <input
                          type="time"
                          value={row.available_until || ""}
                          onChange={(event) => updateDay(day, "available_until", event.target.value)}
                          style={styles.input}
                        />
                      </label>
                    </div>

                    <label style={styles.label}>
                      Note
                      <input
                        value={row.note || ""}
                        onChange={(event) => updateDay(day, "note", event.target.value)}
                        placeholder="Optional, e.g. easy run only"
                        style={styles.input}
                      />
                    </label>

                    <div style={styles.actions}>
                      <button
                        type="button"
                        onClick={() => saveDay(day)}
                        disabled={savingKey === day}
                        style={styles.smallPrimaryButton}
                      >
                        {savingKey === day ? "Saving..." : "Save"}
                      </button>

                      <button type="button" onClick={() => clearDay(day)} style={styles.smallGhostButton}>
                        Clear
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
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
    padding: "18px 16px 42px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
  },
  shell: {
    width: "100%",
    maxWidth: 960,
    margin: "0 auto",
    display: "grid",
    gap: 18,
  },
  header: {
    display: "grid",
    gap: 10,
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  titleRow: {
    display: "grid",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: "clamp(38px, 11vw, 64px)",
    lineHeight: 0.96,
    letterSpacing: "-0.065em",
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
    maxWidth: 680,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 16px",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
  message: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
    lineHeight: 1.45,
  },
  weekNav: {
    borderRadius: 26,
    padding: 12,
    background: glass,
    border: "1px solid rgba(255,255,255,0.12)",
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
  },
  weekLabel: {
    display: "grid",
    justifyItems: "center",
    color: "rgba(255,255,255,0.68)",
    fontWeight: 850,
    textAlign: "center",
  },
  panel: {
    borderRadius: 30,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  panelKicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  panelTitle: {
    margin: 0,
    fontSize: 25,
    letterSpacing: "-0.05em",
  },
  panelText: {
    margin: 0,
    color: "rgba(255,255,255,0.66)",
    lineHeight: 1.45,
  },
  dayList: {
    display: "grid",
    gap: 12,
  },
  dayCard: {
    borderRadius: 24,
    padding: 14,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    gap: 12,
  },
  dayHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
  },
  dayLabel: {
    fontSize: 20,
    fontWeight: 950,
    letterSpacing: "-0.04em",
  },
  dayDate: {
    color: "rgba(255,255,255,0.54)",
    fontWeight: 800,
    fontSize: 13,
  },
  timeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  label: {
    display: "grid",
    gap: 6,
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    fontWeight: 850,
  },
  input: {
    width: "100%",
    minHeight: 46,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.24)",
    color: "white",
    padding: "0 12px",
    boxSizing: "border-box",
    outline: "none",
    fontSize: 15,
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  smallPrimaryButton: {
    minHeight: 40,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
  smallGhostButton: {
    minHeight: 40,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
};
