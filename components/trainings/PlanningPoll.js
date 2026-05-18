"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { subscribeToTrainingRealtime, removeRealtimeChannel } from "../../lib/realtime";
import { createNotification, createNotificationsForUsers, NOTIFICATION_TYPES, trainingUrl } from "../../lib/notifications";

function displayName(person) {
  return person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.email || "Endurance user";
}

function initials(person) {
  return displayName(person)
    .split(" ")
    .filter(Boolean)
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

function formatDate(value) {
  if (!value) return "Date not set";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
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

function responseLabel(response) {
  const pref = response.preference === "best" ? "best" : response.preference === "not_preferred" ? "ok" : "possible";
  return `${formatTime(response.available_from)}–${formatTime(response.available_until)} · ${pref}`;
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

function getAvatar(person, size = 30) {
  if (person?.avatar_url) {
    return <img src={person.avatar_url} alt="" style={{ ...styles.avatar, width: size, height: size }} />;
  }

  return <span style={{ ...styles.avatarFallback, width: size, height: size }}>{initials(person)}</span>;
}

export default function PlanningPoll({ training, user, canManage, onChanged, onOptionsLoaded }) {

  // REALTIME_PLANNING_POLL: keep overlap and responses fresh without manual refresh.
  useEffect(() => {
    const sessionId = training?.id;
    if (!sessionId) return undefined;

    const channel = subscribeToTrainingRealtime(sessionId, () => {
      if (typeof onChanged === "function") {
        onChanged();
      }
    });

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [training?.id, onChanged]);

  const [options, setOptions] = useState([]);
  const [responses, setResponses] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [forms, setForms] = useState({});
  const [finalForms, setFinalForms] = useState({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [expandedOptionId, setExpandedOptionId] = useState("");

  const groupedResponses = useMemo(() => {
    const map = {};
    for (const option of options) map[option.id] = [];
    for (const response of responses) {
      if (!map[response.option_id]) map[response.option_id] = [];
      map[response.option_id].push(response);
    }
    return map;
  }, [options, responses]);

  const rankedOptions = useMemo(() => {
    return options
      .map((option) => {
        const optionResponses = groupedResponses[option.id] || [];
        const available = optionResponses.filter((row) => row.status === "available");
        const declined = optionResponses.filter((row) => row.status === "declined" || row.status === "unavailable");
        const bestVotes = available.filter((row) => row.preference === "best").length;
        const segments = getOverlapSegments(option, optionResponses);
        const bestSegment = segments[0] || null;

        return {
          option,
          responses: optionResponses,
          available,
          declined,
          bestVotes,
          segments,
          bestSegment,
          score: (bestSegment?.count || available.length) * 1000 + bestVotes * 100 + (bestSegment?.duration || 0),
        };
      })
      .sort((a, b) => b.score - a.score || `${a.option.starts_on}${a.option.window_start}`.localeCompare(`${b.option.starts_on}${b.option.window_start}`));
  }, [options, groupedResponses]);

  const bestRows = rankedOptions.filter((row) => row.bestSegment || row.available.length).slice(0, 3);

  const participantSummary = useMemo(() => {
    const ids = [...new Set(responses.map((row) => row.user_id).filter(Boolean))];
    return ids.map((id) => ({
      userId: id,
      profile: profiles[id],
      availableCount: responses.filter((row) => row.user_id === id && row.status === "available").length,
      bestCount: responses.filter((row) => row.user_id === id && row.preference === "best").length,
      declinedCount: responses.filter((row) => row.user_id === id && (row.status === "declined" || row.status === "unavailable")).length,
    }));
  }, [responses, profiles]);

  useEffect(() => {
    if (training?.id && user?.id) loadPoll();
  }, [training?.id, user?.id]);

  useEffect(() => {
    if (!expandedOptionId && rankedOptions[0]?.option?.id) setExpandedOptionId(rankedOptions[0].option.id);
  }, [expandedOptionId, rankedOptions]);

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

      const userIds = [...new Set([training.creator_id, ...loadedResponses.map((row) => row.user_id)].filter(Boolean))];

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
        const optionResponses = loadedResponses.filter((row) => row.option_id === option.id);
        const bestSegment = getOverlapSegments(option, optionResponses)[0];
        nextFinalForms[option.id] = {
          date: option.starts_on,
          time: bestSegment?.startText || option.window_start?.slice(0, 5) || "",
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
    setExpandedOptionId(option.id);
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

      const notifyUserIds = responses
        .map((response) => response.user_id)
        .filter((participantUserId) => participantUserId && participantUserId !== user.id);

      await createNotificationsForUsers(notifyUserIds, {
        actorId: user.id,
        type: NOTIFICATION_TYPES.FINAL_TIME_SET,
        sessionId: training.id,
        title: "Final start time selected",
        body: `${training.title} now has a final start time.`,
        actionUrl: trainingUrl(training.id),
        metadata: { final_starts_at: finalStartsAt, source: "planning_poll" },
      });

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
        <p style={styles.muted}>Best overlap first. Tap an option to see details or choose the final start.</p>
      </div>

      {message ? <div style={styles.message}>{message}</div> : null}

      {bestRows.length ? (
        <div style={styles.bestBox}>
          <div style={styles.bestHeader}>
            <span style={styles.kicker}>Most overlap</span>
            <span style={styles.bestHint}>{bestRows[0].bestSegment?.count || bestRows[0].available.length} available</span>
          </div>

          <div style={styles.bestGrid}>
            {bestRows.map((row, index) => {
              const segment = row.bestSegment;
              const isActive = expandedOptionId === row.option.id;
              return (
                <button
                  key={row.option.id}
                  type="button"
                  onClick={() => {
                    setExpandedOptionId(row.option.id);
                    if (segment) useOverlapSuggestion(row.option, segment);
                  }}
                  style={index === 0 ? styles.bestButtonPrimary : isActive ? styles.bestButtonActive : styles.bestButton}
                >
                  <span style={styles.bestRank}>#{index + 1}</span>
                  <strong>{formatDate(row.option.starts_on)}</strong>
                  <span>{segment ? `${segment.startText}–${segment.endText}` : `${formatTime(row.option.window_start)}–${formatTime(row.option.window_end)}`}</span>
                  <small>{segment?.count || row.available.length} available · {row.bestVotes} best</small>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {canManage && participantSummary.length ? (
        <div style={styles.participantStrip}>
          {participantSummary.map((row) => (
            <div key={row.userId} style={styles.summaryChip}>
              {getAvatar(row.profile, 28)}
              <span style={styles.summaryText}>
                <strong>{displayName(row.profile)}</strong>
                <small>{row.availableCount} options · {row.bestCount} best</small>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div style={styles.optionList}>
        {rankedOptions.map((row, index) => {
          const { option, responses: optionResponses, available, declined, bestSegment, segments } = row;
          const form = forms[option.id] || {};
          const finalForm = finalForms[option.id] || {};
          const own = optionResponses.find((response) => response.user_id === user?.id);
          const isExpanded = expandedOptionId === option.id;
          const chosenTime = finalForm.time || bestSegment?.startText || option.window_start?.slice(0, 5) || "";

          return (
            <article key={option.id} style={isExpanded ? styles.optionCardOpen : styles.optionCard}>
              <button type="button" onClick={() => setExpandedOptionId(isExpanded ? "" : option.id)} style={styles.optionTopButton}>
                <div style={styles.optionDateBlock}>
                  <div style={styles.optionMetaLine}>Option {index + 1}</div>
                  <div style={styles.optionDate}>{formatDate(option.starts_on)}</div>
                  <div style={styles.optionWindow}>{formatTime(option.window_start)} – {formatTime(option.window_end)}</div>
                </div>

                <div style={styles.scoreStack}>
                  <div style={styles.countPill}>{available.length}/{optionResponses.length || "–"} available</div>
                  {bestSegment ? <div style={styles.overlapPill}>{bestSegment.startText}–{bestSegment.endText}</div> : null}
                </div>
              </button>

              {canManage ? (
                <div style={styles.peoplePreview}>
                  {available.slice(0, 6).map((response) => (
                    <span key={response.id} style={styles.miniAvatarWrap} title={`${displayName(profiles[response.user_id])} · ${responseLabel(response)}`}>
                      {getAvatar(profiles[response.user_id], 30)}
                    </span>
                  ))}
                  {available.length > 6 ? <span style={styles.morePill}>+{available.length - 6}</span> : null}
                  {!available.length ? <span style={styles.emptySmall}>No responses yet</span> : null}
                </div>
              ) : own ? (
                <div style={own.status === "available" ? styles.ownStatusGood : styles.ownStatusBad}>
                  {own.status === "available" ? `You: ${responseLabel(own)}` : "You declined this option"}
                </div>
              ) : null}

              {isExpanded ? (
                <div style={styles.expandedArea}>
                  {canManage ? (
                    <>
                      {segments.length ? (
                        <div style={styles.segmentList}>
                          {segments.slice(0, 3).map((segment) => (
                            <button
                              key={`${segment.startText}-${segment.endText}`}
                              type="button"
                              onClick={() => useOverlapSuggestion(option, segment)}
                              style={styles.segmentButton}
                            >
                              <strong>{segment.startText}–{segment.endText}</strong>
                              <span>{segment.count} available · {segment.duration} min</span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div style={styles.avatarGrid}>
                        {available.map((response) => {
                          const person = profiles[response.user_id];
                          return (
                            <div key={response.id} style={styles.personChip}>
                              {getAvatar(person, 34)}
                              <span style={styles.personText}>
                                <strong>{displayName(person)}</strong>
                                <small>{responseLabel(response)}</small>
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {declined.length ? (
                        <div style={styles.declinedLine}>Declined: {declined.map((response) => displayName(profiles[response.user_id])).join(", ")}</div>
                      ) : null}

                      <div style={styles.finalCompact}>
                        <div style={styles.finalText}>
                          <span>Final start</span>
                          <strong>{formatDate(option.starts_on)}</strong>
                        </div>
                        <input
                          type="time"
                          value={chosenTime}
                          min={option.window_start?.slice(0, 5)}
                          max={option.window_end?.slice(0, 5)}
                          onChange={(event) => updateFinalForm(option.id, "time", event.target.value)}
                          style={styles.timeInput}
                        />
                        <button type="button" onClick={() => setFinalStart(option)} disabled={busyId === `final-${option.id}`} style={styles.primaryButtonWide}>
                          Choose final time
                        </button>
                      </div>
                    </>
                  ) : (
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
                  )}
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
    padding: 14,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 12,
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
  header: { display: "grid", gap: 8 },
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
  muted: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.35 },
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
  bestHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  bestHint: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: 850 },
  bestGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 8 },
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
  bestButtonActive: {
    border: "1px solid rgba(228,239,22,0.28)",
    borderRadius: 18,
    background: "rgba(228,239,22,0.09)",
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
    background: "rgba(228,239,22,0.14)",
    color: "white",
    padding: 10,
    textAlign: "left",
    display: "grid",
    gap: 2,
    cursor: "pointer",
  },
  bestRank: { color: "#e4ef16", fontSize: 11, fontWeight: 950 },
  participantStrip: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 2,
    scrollbarWidth: "none",
  },
  summaryChip: {
    flex: "0 0 auto",
    maxWidth: 210,
    borderRadius: 999,
    padding: "6px 10px 6px 6px",
    background: "rgba(0,0,0,0.20)",
    border: "1px solid rgba(255,255,255,0.10)",
    display: "grid",
    gridTemplateColumns: "28px minmax(0, 1fr)",
    gap: 8,
    alignItems: "center",
  },
  summaryText: { minWidth: 0, display: "grid", fontSize: 12, color: "white" },
  optionList: { display: "grid", gap: 9, minWidth: 0 },
  optionCard: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    borderRadius: 22,
    padding: 10,
    background: "rgba(255,255,255,0.052)",
    border: "1px solid rgba(255,255,255,0.09)",
    display: "grid",
    gap: 9,
    overflow: "hidden",
  },
  optionCardOpen: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    borderRadius: 24,
    padding: 10,
    background: "rgba(228,239,22,0.055)",
    border: "1px solid rgba(228,239,22,0.22)",
    display: "grid",
    gap: 10,
    overflow: "hidden",
  },
  optionTopButton: {
    width: "100%",
    minWidth: 0,
    border: 0,
    background: "transparent",
    color: "white",
    padding: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 8,
    alignItems: "start",
    textAlign: "left",
    cursor: "pointer",
  },
  optionDateBlock: { minWidth: 0 },
  optionMetaLine: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 11,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  optionDate: { fontSize: 18, fontWeight: 950, letterSpacing: "-0.04em", whiteSpace: "nowrap" },
  optionWindow: { color: "#e4ef16", fontSize: 18, fontWeight: 950, whiteSpace: "nowrap" },
  scoreStack: { display: "grid", justifyItems: "end", gap: 5, minWidth: 0 },
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
  peoplePreview: { display: "flex", alignItems: "center", gap: 5, minWidth: 0, flexWrap: "wrap" },
  miniAvatarWrap: { display: "inline-flex" },
  morePill: {
    minHeight: 30,
    padding: "0 9px",
    borderRadius: 999,
    display: "inline-grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.76)",
    fontSize: 12,
    fontWeight: 900,
  },
  emptySmall: { color: "rgba(255,255,255,0.52)", fontSize: 12, fontWeight: 850 },
  ownStatusGood: {
    borderRadius: 14,
    padding: "8px 10px",
    background: "rgba(228,239,22,0.08)",
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 850,
  },
  ownStatusBad: {
    borderRadius: 14,
    padding: "8px 10px",
    background: "rgba(255,70,70,0.08)",
    color: "#ffb4b4",
    fontSize: 12,
    fontWeight: 850,
  },
  expandedArea: { display: "grid", gap: 10, minWidth: 0 },
  segmentList: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 7 },
  segmentButton: {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    background: "rgba(0,0,0,0.18)",
    color: "white",
    padding: 9,
    textAlign: "left",
    display: "grid",
    gap: 1,
    cursor: "pointer",
  },
  avatarGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))", gap: 7, minWidth: 0 },
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
  avatar: { borderRadius: 999, objectFit: "cover", flex: "0 0 auto" },
  avatarFallback: {
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    fontSize: 10,
    fontWeight: 950,
    flex: "0 0 auto",
  },
  personText: { minWidth: 0, display: "grid", color: "rgba(255,255,255,0.76)", fontSize: 12 },
  declinedLine: { color: "rgba(255,255,255,0.52)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  finalCompact: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 92px",
    gap: 8,
    alignItems: "center",
    borderRadius: 18,
    padding: 10,
    background: "rgba(228,239,22,0.075)",
    border: "1px solid rgba(228,239,22,0.18)",
    minWidth: 0,
  },
  finalText: { minWidth: 0, display: "grid", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 850 },
  timeInput: {
    width: "100%",
    minWidth: 0,
    minHeight: 42,
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
    gridColumn: "1 / -1",
    minHeight: 44,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  responseBox: { display: "grid", gap: 10 },
  inputGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  label: { display: "grid", gap: 6, color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: 850 },
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
  compactResponseActions: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 8, alignItems: "center" },
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
};
