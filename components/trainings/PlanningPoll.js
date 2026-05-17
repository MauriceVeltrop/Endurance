"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

function displayName(person) {
  return person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.email || "Endurance user";
}

function initials(person) {
  return displayName(person)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toMinutes(value) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function insideWindow(option, from, until) {
  const start = toMinutes(option.window_start);
  const end = toMinutes(option.window_end);
  const f = toMinutes(from);
  const u = toMinutes(until);

  if ([start, end, f, u].some((value) => value === null)) return false;
  return f >= start && u <= end && f < u;
}

function formatOption(option) {
  return `${option.starts_on} · ${option.window_start?.slice(0, 5)}–${option.window_end?.slice(0, 5)}`;
}

export default function PlanningPoll({ training, user, canManage, onChanged }) {
  const [options, setOptions] = useState([]);
  const [responses, setResponses] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [forms, setForms] = useState({});
  const [finalForms, setFinalForms] = useState({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const groupedResponses = useMemo(() => {
    const map = {};
    for (const option of options) map[option.id] = [];
    for (const response of responses) {
      if (!map[response.option_id]) map[response.option_id] = [];
      map[response.option_id].push(response);
    }
    return map;
  }, [options, responses]);

  useEffect(() => {
    if (training?.id && user?.id) {
      loadPoll();
    }
  }, [training?.id, user?.id]);

  async function loadPoll() {
    setMessage("");

    try {
      const { data: optionRows, error: optionError } = await supabase
        .from("training_time_options")
        .select("id,session_id,starts_on,window_start,window_end,created_at")
        .eq("session_id", training.id)
        .order("starts_on", { ascending: true })
        .order("window_start", { ascending: true });

      if (optionError) {
        console.warn("Planning poll options not available", optionError);
        setOptions([]);
        setResponses([]);
        return;
      }

      const loadedOptions = optionRows || [];
      setOptions(loadedOptions);

      const { data: responseRows, error: responseError } = await supabase
        .from("training_time_responses")
        .select("id,option_id,session_id,user_id,status,available_from,available_until,preference,note,created_at,updated_at")
        .eq("session_id", training.id)
        .order("created_at", { ascending: true });

      if (responseError) {
        console.warn("Planning poll responses not available", responseError);
        setResponses([]);
        return;
      }

      const loadedResponses = responseRows || [];
      setResponses(loadedResponses);

      const userIds = [...new Set(loadedResponses.map((row) => row.user_id).filter(Boolean))];

      if (userIds.length) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,email,avatar_url,location,role")
          .in("id", userIds);

        setProfiles(Object.fromEntries((profileRows || []).map((profile) => [profile.id, profile])));
      } else {
        setProfiles({});
      }

      const nextForms = {};
      for (const option of loadedOptions) {
        const own = loadedResponses.find((row) => row.option_id === option.id && row.user_id === user.id);
        nextForms[option.id] = {
          available_from: own?.available_from?.slice(0, 5) || option.window_start?.slice(0, 5) || "",
          available_until: own?.available_until?.slice(0, 5) || option.window_end?.slice(0, 5) || "",
          preference: own?.preference || "possible",
          note: own?.note || "",
        };
      }
      setForms(nextForms);

      const nextFinalForms = {};
      for (const option of loadedOptions) {
        nextFinalForms[option.id] = {
          date: option.starts_on,
          time: option.window_start?.slice(0, 5) || "",
        };
      }
      setFinalForms(nextFinalForms);
    } catch (error) {
      console.error("Planning poll load error", error);
      setMessage(error?.message || "Could not load planning options.");
    }
  }

  function updateForm(optionId, key, value) {
    setForms((current) => ({
      ...current,
      [optionId]: {
        ...(current[optionId] || {}),
        [key]: value,
      },
    }));
  }

  function updateFinalForm(optionId, key, value) {
    setFinalForms((current) => ({
      ...current,
      [optionId]: {
        ...(current[optionId] || {}),
        [key]: value,
      },
    }));
  }

  async function saveResponse(option, status = "available") {
    if (!user?.id) return;

    const form = forms[option.id] || {};
    setBusyId(option.id);
    setMessage("");

    try {
      if (status === "available" && !insideWindow(option, form.available_from, form.available_until)) {
        setMessage(`Choose availability inside: ${formatOption(option)}.`);
        return;
      }

      const payload = {
        option_id: option.id,
        session_id: training.id,
        user_id: user.id,
        status,
        available_from: status === "available" ? form.available_from : null,
        available_until: status === "available" ? form.available_until : null,
        preference: status === "available" ? form.preference || "possible" : null,
        note: form.note?.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("training_time_responses")
        .upsert(payload, { onConflict: "option_id,user_id" });

      if (error) throw error;

      setMessage(status === "available" ? "Availability saved." : "Response saved.");
      await loadPoll();
      onChanged?.();
    } catch (error) {
      console.error("Planning response error", error);
      setMessage(error?.message || "Could not save response.");
    } finally {
      setBusyId("");
    }
  }

  async function setFinalStart(option) {
    if (!canManage) return;

    const form = finalForms[option.id] || {};
    setBusyId(`final-${option.id}`);
    setMessage("");

    try {
      if (!form.date || !form.time) {
        setMessage("Choose final date and time.");
        return;
      }

      const finalMinutes = toMinutes(form.time);
      const start = toMinutes(option.window_start);
      const end = toMinutes(option.window_end);

      if (finalMinutes === null || start === null || end === null || finalMinutes < start || finalMinutes > end) {
        setMessage(`Final time must be inside: ${formatOption(option)}.`);
        return;
      }

      const finalStartsAt = new Date(`${form.date}T${form.time}:00`).toISOString();

      const { error } = await supabase
        .from("training_sessions")
        .update({
          final_starts_at: finalStartsAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", training.id)
        .eq("creator_id", user.id);

      if (error) throw error;

      setMessage("Final start time saved.");
      await loadPoll();
      onChanged?.();
    } catch (error) {
      console.error("Final start error", error);
      setMessage(error?.message || "Could not set final start time.");
    } finally {
      setBusyId("");
    }
  }

  if (training?.planning_type !== "flexible") return null;

  if (!options.length) {
    return (
      <section style={styles.card}>
        <div style={styles.kicker}>Planning poll</div>
        <h2 style={styles.title}>No time options yet</h2>
        <p style={styles.muted}>
          This flexible training was created before Planning Poll v2 or has no options.
        </p>
      </section>
    );
  }

  return (
    <section style={styles.wrap}>
      <div style={styles.header}>
        <div style={styles.kicker}>Flexible Planning v2</div>
        <h2 style={styles.title}>Time options</h2>
        <p style={styles.muted}>
          Respond within the proposed windows. The organizer chooses the final start time.
        </p>
      </div>

      {message ? <div style={styles.message}>{message}</div> : null}

      <div style={styles.optionList}>
        {options.map((option) => {
          const optionResponses = groupedResponses[option.id] || [];
          const form = forms[option.id] || {};
          const finalForm = finalForms[option.id] || {};
          const own = optionResponses.find((row) => row.user_id === user?.id);
          const availableCount = optionResponses.filter((row) => row.status === "available").length;
          const declinedCount = optionResponses.filter((row) => row.status === "declined").length;

          return (
            <article key={option.id} style={styles.optionCard}>
              <div style={styles.optionTop}>
                <div>
                  <div style={styles.optionDate}>{option.starts_on}</div>
                  <div style={styles.optionWindow}>
                    {option.window_start?.slice(0, 5)} – {option.window_end?.slice(0, 5)}
                  </div>
                </div>

                <div style={styles.countPill}>
                  {availableCount} available · {declinedCount} declined
                </div>
              </div>

              {!canManage ? (
                <div style={styles.responseBox}>
                  <div style={styles.inputGrid}>
                    <label style={styles.label}>
                      Available from
                      <input
                        type="time"
                        value={form.available_from || ""}
                        min={option.window_start?.slice(0, 5)}
                        max={option.window_end?.slice(0, 5)}
                        onChange={(event) => updateForm(option.id, "available_from", event.target.value)}
                        style={styles.input}
                      />
                    </label>

                    <label style={styles.label}>
                      Available until
                      <input
                        type="time"
                        value={form.available_until || ""}
                        min={option.window_start?.slice(0, 5)}
                        max={option.window_end?.slice(0, 5)}
                        onChange={(event) => updateForm(option.id, "available_until", event.target.value)}
                        style={styles.input}
                      />
                    </label>
                  </div>

                  <label style={styles.label}>
                    Preference
                    <select
                      value={form.preference || "possible"}
                      onChange={(event) => updateForm(option.id, "preference", event.target.value)}
                      style={styles.input}
                    >
                      <option value="best">Best</option>
                      <option value="possible">Possible</option>
                      <option value="not_preferred">Not preferred</option>
                    </select>
                  </label>

                  <label style={styles.label}>
                    Note
                    <textarea
                      value={form.note || ""}
                      onChange={(event) => updateForm(option.id, "note", event.target.value)}
                      placeholder="Optional note..."
                      style={styles.textarea}
                    />
                  </label>

                  <div style={styles.actions}>
                    <button
                      type="button"
                      onClick={() => saveResponse(option, "available")}
                      disabled={busyId === option.id}
                      style={styles.primaryButton}
                    >
                      {own?.status === "available" ? "Update availability" : "I can make this"}
                    </button>

                    <button
                      type="button"
                      onClick={() => saveResponse(option, "declined")}
                      disabled={busyId === option.id}
                      style={styles.dangerButton}
                    >
                      Decline option
                    </button>
                  </div>
                </div>
              ) : null}

              {canManage ? (
                <div style={styles.organizerBox}>
                  <div style={styles.responseList}>
                    {optionResponses.length ? (
                      optionResponses.map((response) => {
                        const person = profiles[response.user_id];

                        return (
                          <div key={response.id} style={styles.responseRow}>
                            {person?.avatar_url ? (
                              <img src={person.avatar_url} alt="" style={styles.avatar} />
                            ) : (
                              <span style={styles.avatarFallback}>{initials(person)}</span>
                            )}

                            <span style={styles.responseText}>
                              <strong>{displayName(person)}</strong>
                              <span>
                                {(response.status || "pending").toUpperCase()}
                                {response.available_from && response.available_until
                                  ? ` · ${response.available_from.slice(0, 5)}–${response.available_until.slice(0, 5)}`
                                  : ""}
                                {response.preference ? ` · ${response.preference}` : ""}
                                {response.note ? ` · ${response.note}` : ""}
                              </span>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p style={styles.muted}>No responses yet.</p>
                    )}
                  </div>

                  <div style={styles.finalBox}>
                    <div style={styles.kicker}>Set final start</div>
                    <div style={styles.inputGrid}>
                      <label style={styles.label}>
                        Date
                        <input
                          type="date"
                          value={finalForm.date || option.starts_on}
                          onChange={(event) => updateFinalForm(option.id, "date", event.target.value)}
                          style={styles.input}
                        />
                      </label>

                      <label style={styles.label}>
                        Time
                        <input
                          type="time"
                          value={finalForm.time || ""}
                          min={option.window_start?.slice(0, 5)}
                          max={option.window_end?.slice(0, 5)}
                          onChange={(event) => updateFinalForm(option.id, "time", event.target.value)}
                          style={styles.input}
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => setFinalStart(option)}
                      disabled={busyId === `final-${option.id}`}
                      style={styles.primaryButton}
                    >
                      Choose this final time
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  wrap: {
    borderRadius: 32,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 16,
  },
  card: {
    borderRadius: 30,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 10,
  },
  header: {
    display: "grid",
    gap: 8,
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(30px, 8vw, 48px)",
    lineHeight: 0.95,
    letterSpacing: "-0.065em",
  },
  muted: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.45,
  },
  message: {
    borderRadius: 18,
    padding: 12,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  optionList: {
    display: "grid",
    gap: 14,
  },
  optionCard: {
    borderRadius: 26,
    padding: 16,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.10)",
    display: "grid",
    gap: 14,
  },
  optionTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  optionDate: {
    fontSize: 20,
    fontWeight: 950,
    letterSpacing: "-0.04em",
  },
  optionWindow: {
    color: "#e4ef16",
    fontWeight: 950,
  },
  countPill: {
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(228,239,22,0.10)",
    color: "#e4ef16",
    border: "1px solid rgba(228,239,22,0.18)",
    fontSize: 12,
    fontWeight: 900,
  },
  responseBox: {
    display: "grid",
    gap: 12,
  },
  organizerBox: {
    display: "grid",
    gap: 14,
  },
  inputGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 10,
  },
  label: {
    display: "grid",
    gap: 7,
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: 850,
  },
  input: {
    width: "100%",
    minHeight: 48,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: "0 12px",
    boxSizing: "border-box",
    fontSize: 15,
    outline: "none",
  },
  textarea: {
    width: "100%",
    minHeight: 72,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: 12,
    boxSizing: "border-box",
    fontSize: 14,
    fontFamily: "inherit",
    resize: "vertical",
    outline: "none",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 15px",
    fontWeight: 950,
    cursor: "pointer",
  },
  dangerButton: {
    minHeight: 44,
    borderRadius: 999,
    border: "1px solid rgba(255,90,90,0.18)",
    background: "rgba(255,70,70,0.10)",
    color: "#ffb4b4",
    padding: "0 15px",
    fontWeight: 950,
    cursor: "pointer",
  },
  responseList: {
    display: "grid",
    gap: 9,
  },
  responseRow: {
    display: "grid",
    gridTemplateColumns: "42px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
    borderRadius: 18,
    padding: 10,
    background: "rgba(0,0,0,0.16)",
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    objectFit: "cover",
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    fontWeight: 950,
  },
  responseText: {
    minWidth: 0,
    display: "grid",
    gap: 2,
    color: "rgba(255,255,255,0.62)",
    fontSize: 14,
  },
  finalBox: {
    borderRadius: 22,
    padding: 14,
    background: "rgba(228,239,22,0.075)",
    border: "1px solid rgba(228,239,22,0.18)",
    display: "grid",
    gap: 12,
  },
};
