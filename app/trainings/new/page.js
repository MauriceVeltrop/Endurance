"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import { supabase } from "../../../lib/supabase";
import { getSportLabel } from "../../../lib/trainingHelpers";

const sportOptions = [
  { id: "running", metric: "pace", distance: true },
  { id: "trail_running", metric: "pace", distance: true },
  { id: "road_cycling", metric: "speed", distance: true },
  { id: "gravel_cycling", metric: "speed", distance: true },
  { id: "mountain_biking", metric: "speed", distance: true },
  { id: "walking", metric: "speed", distance: true },
  { id: "kayaking", metric: "speed", distance: true },
  { id: "strength_training", metric: "intensity", distance: false },
  { id: "crossfit", metric: "intensity", distance: false },
  { id: "hyrox", metric: "intensity", distance: false },
  { id: "bootcamp", metric: "intensity", distance: false },
  { id: "swimming", metric: "intensity", distance: false },
  { id: "padel", metric: "intensity", distance: false },
];

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function nextHourString() {
  const date = new Date();
  date.setHours(date.getHours() + 1);
  date.setMinutes(0, 0, 0);
  return date.toTimeString().slice(0, 5);
}

function defaultTitle(sportId) {
  return `${getSportLabel(sportId)} Training`;
}

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

function getInviteProfileId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("invite") || "";
}

export default function CreateTrainingPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [allowedSportIds, setAllowedSportIds] = useState([]);
  const [partners, setPartners] = useState([]);
  const [selectedInviteIds, setSelectedInviteIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    sport_id: "",
    title: "",
    description: "",
    planning_type: "fixed",
    date: todayString(),
    start_time: nextHourString(),
    flexible_start_time: nextHourString(),
    flexible_end_time: "11:00",
    start_location: "",
    distance_km: "",
    estimated_duration_min: "",
    pace_min: "",
    pace_max: "",
    speed_min: "",
    speed_max: "",
    intensity_label: "Moderate",
    visibility: "team",
    max_participants: "",
  });

  const selectedSport = useMemo(() => {
    return sportOptions.find((sport) => sport.id === form.sport_id) || null;
  }, [form.sport_id]);

  const visibleSports = useMemo(() => {
    return sportOptions.filter((sport) => allowedSportIds.includes(sport.id));
  }, [allowedSportIds]);

  useEffect(() => {
    loadCreateData();
  }, []);

  async function loadCreateData() {
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
        setMessage("Your account is blocked. Contact an administrator.");
        return;
      }

      setProfile(profileRow);

      const { data: sportsRows } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);

      const ids = (sportsRows || []).map((row) => row.sport_id).filter(Boolean);
      setAllowedSportIds(ids);

      const firstSport = sportOptions.find((sport) => ids.includes(sport.id));
      if (firstSport) {
        setForm((current) => ({
          ...current,
          sport_id: firstSport.id,
          title: defaultTitle(firstSport.id),
        }));
      }

      const { data: relationRows } = await supabase
        .from("training_partners")
        .select("id,requester_id,addressee_id,status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      const partnerIds = (relationRows || [])
        .map((relation) =>
          relation.requester_id === user.id ? relation.addressee_id : relation.requester_id
        )
        .filter(Boolean);

      if (partnerIds.length) {
        const { data: partnerRows } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,email,avatar_url,role,location")
          .in("id", partnerIds);

        const loadedPartners = partnerRows || [];
        setPartners(loadedPartners);

        const inviteProfileId = getInviteProfileId();
        const invitedPartner = loadedPartners.find((person) => person.id === inviteProfileId);

        if (invitedPartner) {
          setSelectedInviteIds([invitedPartner.id]);
          setForm((current) => ({
            ...current,
            visibility: "selected",
          }));
          setMessage(`Invite prepared for ${displayName(invitedPartner)}.`);
        }
      } else {
        setPartners([]);
      }
    } catch (error) {
      console.error("Create training load error", error);
      setMessage(error?.message || "Could not load create training.");
    } finally {
      setLoading(false);
    }
  }

  function updateForm(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "sport_id") {
        next.title = defaultTitle(value);
        next.pace_min = "";
        next.pace_max = "";
        next.speed_min = "";
        next.speed_max = "";
        next.intensity_label = "Moderate";
        next.distance_km = "";
      }

      if (key === "visibility" && value !== "selected") {
        setSelectedInviteIds([]);
      }

      return next;
    });
  }

  function toggleInvite(profileId) {
    setSelectedInviteIds((current) => {
      if (current.includes(profileId)) return current.filter((id) => id !== profileId);
      return [...current, profileId];
    });
  }

  function buildTrainingPayload() {
    const isFixed = form.planning_type === "fixed";
    const startsAt = isFixed ? new Date(`${form.date}T${form.start_time}:00`).toISOString() : null;

    return {
      creator_id: profile.id,
      title: form.title.trim(),
      description: form.description.trim() || "",
      sports: [form.sport_id],
      visibility: form.visibility,
      planning_type: form.planning_type,
      starts_at: startsAt,
      flexible_date: isFixed ? null : form.date,
      flexible_start_time: isFixed ? null : form.flexible_start_time,
      flexible_end_time: isFixed ? null : form.flexible_end_time,
      start_location: form.start_location.trim() || null,
      distance_km: selectedSport?.distance && form.distance_km ? Number(form.distance_km) : null,
      estimated_duration_min: form.estimated_duration_min ? Number(form.estimated_duration_min) : null,
      pace_min: selectedSport?.metric === "pace" ? form.pace_min || null : null,
      pace_max: selectedSport?.metric === "pace" ? form.pace_max || null : null,
      speed_min: selectedSport?.metric === "speed" && form.speed_min ? Number(form.speed_min) : null,
      speed_max: selectedSport?.metric === "speed" && form.speed_max ? Number(form.speed_max) : null,
      intensity_label: selectedSport?.metric === "intensity" ? form.intensity_label || null : null,
      max_participants: form.max_participants ? Number(form.max_participants) : null,
      updated_at: new Date().toISOString(),
    };
  }

  async function createTraining(event) {
    event.preventDefault();

    if (!profile?.id || saving) return;

    setSaving(true);
    setMessage("");

    try {
      if (!form.sport_id) {
        setMessage("Choose a sport first.");
        return;
      }

      if (!form.title.trim()) {
        setMessage("Give the training a name.");
        return;
      }

      if (!form.date) {
        setMessage("Choose a date.");
        return;
      }

      if (form.planning_type === "fixed" && !form.start_time) {
        setMessage("Choose a start time.");
        return;
      }

      if (form.planning_type === "flexible" && (!form.flexible_start_time || !form.flexible_end_time)) {
        setMessage("Choose the possible start window.");
        return;
      }

      if (form.planning_type === "flexible" && form.flexible_start_time >= form.flexible_end_time) {
        setMessage("The flexible end time must be after the start time.");
        return;
      }

      const payload = buildTrainingPayload();

      const { data: trainingRow, error } = await supabase
        .from("training_sessions")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      const { error: creatorJoinError } = await supabase
        .from("session_participants")
        .insert({
          session_id: trainingRow.id,
          user_id: profile.id,
        });

      if (creatorJoinError) {
        console.warn("Creator auto-join skipped", creatorJoinError);
      }

      const inviteTargets =
        form.visibility === "selected"
          ? selectedInviteIds
          : selectedInviteIds.length
            ? selectedInviteIds
            : [];

      if (inviteTargets.length) {
        const inviteRows = inviteTargets.map((inviteeId) => ({
          session_id: trainingRow.id,
          inviter_id: profile.id,
          invitee_id: inviteeId,
        }));

        const { error: inviteError } = await supabase
          .from("training_invites")
          .insert(inviteRows);

        if (inviteError) {
          console.warn("Training invites skipped", inviteError);
        }

        if (form.visibility === "selected") {
          const visibilityRows = inviteTargets.map((userId) => ({
            session_id: trainingRow.id,
            user_id: userId,
          }));

          const { error: visibilityError } = await supabase
            .from("training_visibility_members")
            .insert(visibilityRows);

          if (visibilityError) {
            console.warn("Selected visibility members skipped", visibilityError);
          }
        }
      }

      router.replace(`/trainings/${trainingRow.id}`);
    } catch (error) {
      console.error("Create training error", error);
      setMessage(error?.message || "Could not create training.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Create training</div>
          <h1 style={styles.title}>Who is training?</h1>
          <p style={styles.subtitle}>
            Keep it simple: choose a sport, set a time, invite people and train together.
          </p>
        </header>

        {message ? <section style={styles.message}>{message}</section> : null}

        {loading ? (
          <section style={styles.card}>Loading create flow...</section>
        ) : !visibleSports.length ? (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Choose preferred sports first</h2>
            <p style={styles.muted}>Your create screen only shows your own preferred sports.</p>
            <button type="button" onClick={() => router.push("/onboarding")} style={styles.primaryButton}>
              Update profile
            </button>
          </section>
        ) : (
          <form onSubmit={createTraining} style={styles.form}>
            <section style={styles.cardHot}>
              <div style={styles.cardKicker}>Step 1</div>
              <h2 style={styles.cardTitle}>Sport</h2>

              <div style={styles.sportGrid}>
                {visibleSports.map((sport) => (
                  <button
                    key={sport.id}
                    type="button"
                    onClick={() => updateForm("sport_id", sport.id)}
                    style={form.sport_id === sport.id ? styles.sportButtonActive : styles.sportButton}
                  >
                    {getSportLabel(sport.id)}
                  </button>
                ))}
              </div>
            </section>

            <section style={styles.card}>
              <div style={styles.cardKicker}>Step 2</div>
              <h2 style={styles.cardTitle}>Basics</h2>

              <label style={styles.label}>
                Training name
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  style={styles.input}
                />
              </label>

              <label style={styles.label}>
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="Optional. What should people know?"
                  style={styles.textarea}
                />
              </label>

              <label style={styles.label}>
                Start location
                <input
                  value={form.start_location}
                  onChange={(event) => updateForm("start_location", event.target.value)}
                  placeholder="Street, place or meeting point"
                  style={styles.input}
                />
              </label>
            </section>

            <section style={styles.card}>
              <div style={styles.cardKicker}>Step 3</div>
              <h2 style={styles.cardTitle}>Time</h2>

              <div style={styles.segmented}>
                <button
                  type="button"
                  onClick={() => updateForm("planning_type", "fixed")}
                  style={form.planning_type === "fixed" ? styles.segmentActive : styles.segment}
                >
                  Fixed time
                </button>

                <button
                  type="button"
                  onClick={() => updateForm("planning_type", "flexible")}
                  style={form.planning_type === "flexible" ? styles.segmentActive : styles.segment}
                >
                  Flexible window
                </button>
              </div>

              <label style={styles.label}>
                Date
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => updateForm("date", event.target.value)}
                  style={styles.input}
                />
              </label>

              {form.planning_type === "fixed" ? (
                <label style={styles.label}>
                  Start time
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(event) => updateForm("start_time", event.target.value)}
                    style={styles.input}
                  />
                </label>
              ) : (
                <div style={styles.twoColumns}>
                  <label style={styles.label}>
                    Possible from
                    <input
                      type="time"
                      value={form.flexible_start_time}
                      onChange={(event) => updateForm("flexible_start_time", event.target.value)}
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.label}>
                    Possible until
                    <input
                      type="time"
                      value={form.flexible_end_time}
                      onChange={(event) => updateForm("flexible_end_time", event.target.value)}
                      style={styles.input}
                    />
                  </label>
                </div>
              )}
            </section>

            <section style={styles.card}>
              <div style={styles.cardKicker}>Step 4</div>
              <h2 style={styles.cardTitle}>Training details</h2>

              {selectedSport?.distance ? (
                <label style={styles.label}>
                  Distance in km
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.distance_km}
                    onChange={(event) => updateForm("distance_km", event.target.value)}
                    placeholder="Optional"
                    style={styles.input}
                  />
                </label>
              ) : null}

              <label style={styles.label}>
                Estimated duration in minutes
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.estimated_duration_min}
                  onChange={(event) => updateForm("estimated_duration_min", event.target.value)}
                  placeholder="Optional"
                  style={styles.input}
                />
              </label>

              {selectedSport?.metric === "pace" ? (
                <div style={styles.twoColumns}>
                  <label style={styles.label}>
                    Pace min
                    <input
                      value={form.pace_min}
                      onChange={(event) => updateForm("pace_min", event.target.value)}
                      placeholder="5:00"
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.label}>
                    Pace max
                    <input
                      value={form.pace_max}
                      onChange={(event) => updateForm("pace_max", event.target.value)}
                      placeholder="5:30"
                      style={styles.input}
                    />
                  </label>
                </div>
              ) : null}

              {selectedSport?.metric === "speed" ? (
                <div style={styles.twoColumns}>
                  <label style={styles.label}>
                    Speed min
                    <input
                      type="number"
                      step="0.1"
                      value={form.speed_min}
                      onChange={(event) => updateForm("speed_min", event.target.value)}
                      placeholder="25"
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.label}>
                    Speed max
                    <input
                      type="number"
                      step="0.1"
                      value={form.speed_max}
                      onChange={(event) => updateForm("speed_max", event.target.value)}
                      placeholder="30"
                      style={styles.input}
                    />
                  </label>
                </div>
              ) : null}

              {selectedSport?.metric === "intensity" ? (
                <label style={styles.label}>
                  Intensity
                  <select
                    value={form.intensity_label}
                    onChange={(event) => updateForm("intensity_label", event.target.value)}
                    style={styles.input}
                  >
                    <option value="Easy">Easy</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Hard">Hard</option>
                    <option value="Race pace">Race pace</option>
                  </select>
                </label>
              ) : null}
            </section>

            <section style={styles.card}>
              <div style={styles.cardKicker}>Step 5</div>
              <h2 style={styles.cardTitle}>Who can see it?</h2>

              <div style={styles.visibilityGrid}>
                {[
                  ["public", "Public", "All Endurance users"],
                  ["team", "Team", "Team Up partners"],
                  ["selected", "Selected", "Only invited people"],
                  ["private", "Private", "Only me"],
                ].map(([value, label, description]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateForm("visibility", value)}
                    style={form.visibility === value ? styles.visibilityActive : styles.visibilityButton}
                  >
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </button>
                ))}
              </div>

              <label style={styles.label}>
                Max participants
                <input
                  type="number"
                  min="0"
                  value={form.max_participants}
                  onChange={(event) => updateForm("max_participants", event.target.value)}
                  placeholder="Optional"
                  style={styles.input}
                />
              </label>
            </section>

            <section style={styles.card}>
              <div style={styles.cardKicker}>Step 6</div>
              <h2 style={styles.cardTitle}>Invite people</h2>
              <p style={styles.muted}>Selected people receive an invite in their Inbox.</p>

              {partners.length ? (
                <div style={styles.partnerList}>
                  {partners.map((partner) => {
                    const selected = selectedInviteIds.includes(partner.id);

                    return (
                      <button
                        key={partner.id}
                        type="button"
                        onClick={() => toggleInvite(partner.id)}
                        style={selected ? styles.partnerActive : styles.partnerButton}
                      >
                        {partner.avatar_url ? (
                          <img src={partner.avatar_url} alt="" style={styles.avatar} />
                        ) : (
                          <span style={styles.avatarFallback}>{initials(partner)}</span>
                        )}

                        <span style={styles.partnerText}>
                          <strong>{displayName(partner)}</strong>
                          <span>{selected ? "Will receive invite" : "Tap to invite"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p style={styles.muted}>No Team Up partners yet. You can invite people later.</p>
              )}
            </section>

            <section style={styles.submitBar}>
              <button type="button" onClick={() => router.push("/trainings")} style={styles.secondaryButton}>
                Cancel
              </button>

              <button type="submit" disabled={saving} style={styles.primaryButton}>
                {saving ? "Creating..." : "Create training"}
              </button>
            </section>
          </form>
        )}
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
    padding: "18px 16px 56px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
  },
  shell: {
    width: "100%",
    maxWidth: 880,
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
  title: {
    margin: 0,
    fontSize: "clamp(42px, 12vw, 76px)",
    lineHeight: 0.92,
    letterSpacing: "-0.075em",
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
    maxWidth: 680,
  },
  message: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  form: {
    display: "grid",
    gap: 14,
  },
  card: {
    borderRadius: 30,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
  },
  cardHot: {
    borderRadius: 30,
    padding: 18,
    background: "linear-gradient(145deg, rgba(228,239,22,0.13), rgba(255,255,255,0.045))",
    border: "1px solid rgba(228,239,22,0.24)",
    display: "grid",
    gap: 14,
    boxShadow: "0 0 34px rgba(228,239,22,0.10)",
  },
  cardKicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  cardTitle: {
    margin: 0,
    fontSize: "clamp(28px, 8vw, 46px)",
    lineHeight: 0.96,
    letterSpacing: "-0.065em",
  },
  muted: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
  },
  sportGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  sportButton: {
    minHeight: 44,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  sportButtonActive: {
    minHeight: 44,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.30)",
    background: "#e4ef16",
    color: "#101406",
    padding: "0 13px",
    fontWeight: 950,
    cursor: "pointer",
  },
  label: {
    display: "grid",
    gap: 8,
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    fontWeight: 850,
  },
  input: {
    width: "100%",
    minHeight: 52,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.045)",
    color: "white",
    padding: "0 14px",
    boxSizing: "border-box",
    fontSize: 16,
    outline: "none",
  },
  textarea: {
    width: "100%",
    minHeight: 92,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.045)",
    color: "white",
    padding: 14,
    boxSizing: "border-box",
    fontSize: 16,
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
  },
  twoColumns: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  segmented: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  segment: {
    minHeight: 46,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.07)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  segmentActive: {
    minHeight: 46,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.30)",
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    cursor: "pointer",
  },
  visibilityGrid: {
    display: "grid",
    gap: 10,
  },
  visibilityButton: {
    minHeight: 70,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.055)",
    color: "white",
    padding: 12,
    display: "grid",
    gap: 4,
    textAlign: "left",
    cursor: "pointer",
  },
  visibilityActive: {
    minHeight: 70,
    borderRadius: 22,
    border: "1px solid rgba(228,239,22,0.30)",
    background: "rgba(228,239,22,0.13)",
    color: "white",
    padding: 12,
    display: "grid",
    gap: 4,
    textAlign: "left",
    cursor: "pointer",
  },
  partnerList: {
    display: "grid",
    gap: 10,
  },
  partnerButton: {
    width: "100%",
    border: 0,
    borderRadius: 22,
    padding: 10,
    background: "rgba(255,255,255,0.055)",
    color: "white",
    display: "grid",
    gridTemplateColumns: "46px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
  },
  partnerActive: {
    width: "100%",
    border: "1px solid rgba(228,239,22,0.28)",
    borderRadius: 22,
    padding: 10,
    background: "rgba(228,239,22,0.12)",
    color: "white",
    display: "grid",
    gridTemplateColumns: "46px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    objectFit: "cover",
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.14)",
    color: "#e4ef16",
    fontWeight: 950,
  },
  partnerText: {
    display: "grid",
    gap: 3,
    color: "rgba(255,255,255,0.62)",
  },
  submitBar: {
    position: "sticky",
    bottom: 14,
    zIndex: 5,
    borderRadius: 26,
    padding: 12,
    background: "rgba(9,12,9,0.92)",
    border: "1px solid rgba(255,255,255,0.12)",
    backdropFilter: "blur(18px)",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "pointer",
  },
};
