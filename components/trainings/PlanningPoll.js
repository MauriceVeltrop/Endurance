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

function minutesToTime(value) {
  const hours = String(Math.floor(value / 60)).padStart(2, "0");
  const minutes = String(value % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatTime(value) {
  return value?.slice(0, 5) || "--:--";
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
  return `${option.starts_on} · ${formatTime(option.window_start)}–${formatTime(option.window_end)}`;
}

function getOverlapSegments(option, optionResponses) {
  const available = optionResponses.filter(
    (row) => row.status === "available" && row.available_from && row.available_until
  );

  const optionStart = toMinutes(option.window_start);
  const optionEnd = toMinutes(option.window_end);
  if (optionStart === null || optionEnd === null || optionStart >= optionEnd || !available.length) return [];

  const points = new Set([optionStart, optionEnd]);
  for (const response of available) {
    const from = toMinutes(response.available_from);
    const until = toMinutes(response.available_until);
    if (from !== null && until !== null && from < until) {
      points.add(Math.max(optionStart, from));
      points.add(Math.min(optionEnd, until));
    }
  }

  const sorted = [...points].sort((a, b) => a - b);
  const rawSegments = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (start >= end) continue;

    const active = available.filter((response) => {
      const from = toMinutes(response.available_from);
      const until = toMinutes(response.available_until);
      return from !== null && until !== null && from <= start && until >= end;
    });

    if (active.length) {
      rawSegments.push({
        start,
        end,
        active,
        key: active.map((row) => row.user_id).sort().join("|"),
      });
    }
  }

  const merged = [];
  for (const segment of rawSegments) {
    const previous = merged[merged.length - 1];
    if (previous && previous.end === segment.start && previous.key === segment.key) {
      previous.end = segment.end;
    } else {
      merged.push({ ...segment });
    }
  }

  return merged
    .map((segment) => ({
      ...segment,
      count: segment.active.length,
      duration: segment.end - segment.start,
      startText: minutesToTime(segment.start),
      endText: minutesToTime(segment.end),
    }))
    .sort((a, b) => b.count - a.count || b.duration - a.duration || a.start - b.start);
}

export default function PlanningPoll({ training, user, canManage, onChanged, onOptionsLoaded }) {
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

  const overlapSummary = useMemo(() => {
    const rows = [];
    for (const option of options) {
      const optionResponses = groupedResponses[option.id] || [];
      const segments = getOverlapSegments(option, optionResponses);
      if (segments[0]) {
        rows.push({ option, segment: segments[0] });
      }
    }
    return rows.sort(
      (a, b) =>
        b.segment.count - a.segment.count ||
        b.segment.duration - a.segment.duration ||
        `${a.option.starts_on}${a.segment.start}`.localeCompare(`${b.option.starts_on}${b.segment.start}`)
    );
  }, [options, groupedResponses]);

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
        onOptionsLoaded?.(false);
        return;
      }

      const loadedOptions = optionRows || [];
      setOptions(loadedOptions);
      onOptionsLoaded?.(loadedOptions.length > 0);

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
      onOptionsLoaded?.(false);
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

  function useOverlapSuggestion(option, segment) {
    setFinalForms((current) => ({
      ...current,
      [option.id]: {
        date: option.starts_on,
        time: segment.startText,
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
        <p style={styles.muted}>This flexible training was created before Planning Poll v2 or has no options.</p>
      </section>
    );
  }

  return (
    <section style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.kicker}>Flexible planning</div>
          <h2 style={styles.title}>Best start time</h2>
        </div>
        <p style={styles.muted}>Compact overview of who can join each option. Highest overlap is shown first.</p>
      </div>

      {message ? <div style={styles.message}>{message}</div> : null}

      {canManage && overlapSummary.length ? (
        <div style={styles.bestBox}>
          <div style={styles.bestHeader}>
            <span style={styles.kicker}>Most overlap</span>
            <span style={styles.bestHint}>{overlapSummary[0].segment.count} participant(s)</span>
          </div>
          <div style={styles.bestGrid}>
            {overlapSummary.slice(0, 3).map(({ option, segment }, index) => (
              <button
                key={`${option.id}-${segment.startText}`}
                type="button"
                onClick={() => useOverlapSuggestion(option, segment)}
                style={index === 0 ? styles.bestButtonPrimary : styles.bestButton}
              >
                <span style={styles.bestRank}>#{index + 1}</span>
                <strong>{option.starts_on}</strong>
                <span>
                  {segment.startText}–{segment.endText}
                </span>
                <small>{segment.count} available</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div style={styles.optionList}>
        {options.map((option) => {
          const optionResponses = groupedResponses[option.id] || [];
          const form = forms[option.id] || {};
          const finalForm = finalForms[option.id] || {};
          const own = optionResponses.find((row) => row.user_id === user?.id);
          const availableResponses = optionResponses.filter((row) => row.status === "available");
          const declinedResponses = optionResponses.filter((row) => row.status === "declined");
          const segments = getOverlapSegments(option, optionResponses);
          const bestSegment = segments[0];

          return (
            <article key={option.id} style={styles.optionCard}>
              <div style={styles.optionTop}>
                <div style={styles.optionDateBlock}>
                  <div style={styles.optionDate}>{option.starts_on}</div>
                  <div style={styles.optionWindow}>{formatTime(option.window_start)} – {formatTime(option.window_end)}</div>
                </div>

                <div style={styles.scoreStack}>
                  <div style={styles.countPill}>{availableResponses.length}/{optionResponses.length || "–"} available</div>
                  {bestSegment ? (
                    <div style={styles.overlapPill}>
                      Best {bestSegment.startText}–{bestSegment.endText} · {bestSegment.count}
                    </div>
                  ) : null}
                </div>
              </div>

              {!canManage ? (
                <div style={styles.responseBox}>
                  <div style={styles.inputGrid}>
                    <label style={styles.label}>
                      From
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
                      Until
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

                  <div style={styles.compactResponseActions}>
                    <select
                      value={form.preference || "possible"}
                      onChange={(event) => updateForm(option.id, "preference", event.target.value)}
                      style={styles.compactSelect}
                    >
                      <option value="best">Best</option>
                      <option value="possible">Possible</option>
                      <option value="not_preferred">Not preferred</option>
                    </select>
                    <button type="button" onClick={() => saveResponse(option, "available")} disabled={busyId === option.id} style={styles.primaryButton}>
                      {own?.status === "available" ? "Update" : "Available"}
                    </button>
                    <button type="button" onClick={() => saveResponse(option, "declined")} disabled={busyId === option.id} style={styles.dangerButton}>
                      Decline
                    </button>
                  </div>
                </div>
              ) : null}

              {canManage ? (
                <div style={styles.organizerCompact}>
                  <div style={styles.peoplePanel}>
                    {availableResponses.length ? (
                      <div style={styles.avatarGrid}>
                        {availableResponses.map((response) => {
                          const person = profiles[response.user_id];
                          return (
                            <div key={response.id} style={styles.personChip} title={displayName(person)}>
                              {person?.avatar_url ? <img src={person.avatar_url} alt="" style={styles.avatar} /> : <span style={styles.avatarFallback}>{initials(person)}</span>}
                              <span style={styles.personText}>
                                <strong>{displayName(person)}</strong>
                                <small>
                                  {formatTime(response.available_from)}–{formatTime(response.available_until)}
                                  {response.preference === "best" ? " · best" : ""}
                                </small>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={styles.muted}>No availability yet.</p>
                    )}

                    {declinedResponses.length ? (
                      <div style={styles.declinedLine}>
                        Declined: {declinedResponses.map((response) => displayName(profiles[response.user_id])).join(", ")}
                      </div>
                    ) : null}
                  </div>

                  <div style={styles.finalCompact}>
                    <div style={styles.finalText}>
                      <span>Final start</span>
                      <strong>{finalForm.date || option.starts_on}</strong>
                    </div>
                    <input
                      type="time"
                      value={finalForm.time || ""}
                      min={option.window_start?.slice(0, 5)}
                      max={option.window_end?.slice(0, 5)}
                      onChange={(event) => updateFinalForm(option.id, "time", event.target.value)}
                      style={styles.timeInput}
                    />
                    <button type="button" onClick={() => setFinalStart(option)} disabled={busyId === `final-${option.id}`} style={styles.primaryButtonWide}>
                      Choose
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
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    borderRadius: 32,
    padding: 16,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
    overflow: "hidden",
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
    fontSize: "clamp(28px, 7vw, 44px)",
    lineHeight: 0.95,
    letterSpacing: "-0.065em",
  },
  muted: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.35,
  },
  message: {
    borderRadius: 18,
    padding: 12,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  bestBox: {
    borderRadius: 24,
    padding: 12,
    background: "rgba(228,239,22,0.075)",
    border: "1px solid rgba(228,239,22,0.18)",
    display: "grid",
    gap: 10,
  },
  bestHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  bestHint: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: 850,
  },
  bestGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
    gap: 8,
  },
  bestButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    background: "rgba(0,0,0,0.18)",
    color: "white",
    padding: 10,
    textAlign: "left",
    display: "grid",
    gap: 2,
    cursor: "pointer",
  },
  bestButtonPrimary: {
    border: "1px solid rgba(228,239,22,0.34)",
    borderRadius: 18,
    background: "rgba(228,239,22,0.13)",
    color: "white",
    padding: 10,
    textAlign: "left",
    display: "grid",
    gap: 2,
    cursor: "pointer",
  },
  bestRank: {
    color: "#e4ef16",
    fontSize: 11,
    fontWeight: 950,
  },
  optionList: {
    display: "grid",
    gap: 10,
    minWidth: 0,
  },
  optionCard: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    borderRadius: 24,
    padding: 12,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.10)",
    display: "grid",
    gap: 10,
    overflow: "hidden",
  },
  optionTop: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "start",
  },
  optionDateBlock: {
    minWidth: 0,
  },
  optionDate: {
    fontSize: 18,
    fontWeight: 950,
    letterSpacing: "-0.04em",
    whiteSpace: "nowrap",
  },
  optionWindow: {
    color: "#e4ef16",
    fontSize: 18,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  scoreStack: {
    display: "grid",
    justifyItems: "end",
    gap: 5,
    minWidth: 0,
  },
  countPill: {
    borderRadius: 999,
    padding: "7px 9px",
    background: "rgba(228,239,22,0.10)",
    color: "#e4ef16",
    border: "1px solid rgba(228,239,22,0.18)",
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  overlapPill: {
    borderRadius: 999,
    padding: "5px 8px",
    background: "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: 850,
    whiteSpace: "nowrap",
  },
  responseBox: {
    display: "grid",
    gap: 10,
  },
  inputGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },
  label: {
    display: "grid",
    gap: 6,
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: 850,
  },
  input: {
    width: "100%",
    minWidth: 0,
    minHeight: 44,
    borderRadius: 15,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: "0 10px",
    boxSizing: "border-box",
    fontSize: 14,
    outline: "none",
  },
  compactResponseActions: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto auto",
    gap: 8,
    alignItems: "center",
  },
  compactSelect: {
    width: "100%",
    minWidth: 0,
    minHeight: 42,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: "0 10px",
    boxSizing: "border-box",
    fontSize: 13,
    outline: "none",
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 13px",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  dangerButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,90,90,0.18)",
    background: "rgba(255,70,70,0.10)",
    color: "#ffb4b4",
    padding: "0 13px",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  organizerCompact: {
    display: "grid",
    gap: 10,
  },
  peoplePanel: {
    display: "grid",
    gap: 8,
    minWidth: 0,
  },
  avatarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 8,
    minWidth: 0,
  },
  personChip: {
    minWidth: 0,
    borderRadius: 16,
    padding: 8,
    background: "rgba(0,0,0,0.17)",
    display: "grid",
    gridTemplateColumns: "34px minmax(0, 1fr)",
    gap: 8,
    alignItems: "center",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    objectFit: "cover",
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    fontSize: 11,
    fontWeight: 950,
  },
  personText: {
    minWidth: 0,
    display: "grid",
    color: "rgba(255,255,255,0.76)",
    fontSize: 13,
  },
  declinedLine: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 12,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  finalCompact: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 96px auto",
    gap: 8,
    alignItems: "center",
    borderRadius: 18,
    padding: 10,
    background: "rgba(228,239,22,0.075)",
    border: "1px solid rgba(228,239,22,0.18)",
    minWidth: 0,
  },
  finalText: {
    minWidth: 0,
    display: "grid",
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: 850,
  },
  timeInput: {
    width: "100%",
    minWidth: 0,
    minHeight: 40,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: "0 8px",
    boxSizing: "border-box",
    fontSize: 14,
    outline: "none",
  },
  primaryButtonWide: {
    minHeight: 40,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
