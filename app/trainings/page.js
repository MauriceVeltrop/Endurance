"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";
import {
  formatTrainingIntensity,
  formatTrainingTime,
  getPrimarySport,
  getSportLabel,
} from "../../lib/trainingHelpers";
import { getTrainingHeroImage } from "../../lib/sportImages";

const privilegedRoles = ["admin", "moderator"];

export default function TrainingsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [preferredSportIds, setPreferredSportIds] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [participantCounts, setParticipantCounts] = useState({});
  const [joinedSessionIds, setJoinedSessionIds] = useState(new Set());
  const [currentUserId, setCurrentUserId] = useState("");
  const [busySessionId, setBusySessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState("soonest");

  const canSeeAll = privilegedRoles.includes(profile?.role);

  const preferredSportLabel = useMemo(() => {
    if (canSeeAll) return "Admin/moderator view";
    if (!preferredSportIds.length) return "No preferred sports selected";
    return `${preferredSportIds.length} preferred sport${preferredSportIds.length === 1 ? "" : "s"}`;
  }, [canSeeAll, preferredSportIds.length]);

  useEffect(() => {
    loadTrainings();
  }, []);

  async function loadTrainings() {
    setLoading(true);
    setErrorText("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      setCurrentUserId(user.id);

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
        setTrainings([]);
        setErrorText("Your account is blocked. Contact an administrator.");
        return;
      }

      setProfile(profileRow);

      const { data: sportRows, error: sportError } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);

      if (sportError) throw sportError;

      const allowedSports = (sportRows || []).map((row) => row.sport_id).filter(Boolean);
      setPreferredSportIds(allowedSports);

      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("training_sessions")
        .select("id,creator_id,title,description,sports,visibility,planning_type,starts_at,flexible_date,flexible_start_time,flexible_end_time,final_starts_at,start_location,distance_km,estimated_duration_min,intensity_label,pace_min,pace_max,speed_min,speed_max,max_participants,teaser_photo_url,route_id,workout_id,created_at")
        .or(`starts_at.gte.${now},starts_at.is.null`)
        .order("starts_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) throw error;

      const rows = data || [];
      const shouldSeeAll = privilegedRoles.includes(profileRow?.role);

      let acceptedPartnerIds = new Set();
      let selectedVisibilitySessionIds = new Set();

      if (!shouldSeeAll) {
        const { data: partnerRows, error: partnerError } = await supabase
          .from("training_partners")
          .select("requester_id,addressee_id,status")
          .eq("status", "accepted")
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

        if (!partnerError) {
          acceptedPartnerIds = new Set(
            (partnerRows || []).map((relation) =>
              relation.requester_id === user.id ? relation.addressee_id : relation.requester_id
            )
          );
        } else {
          console.warn("Team visibility partners skipped", partnerError);
        }

        const selectedRows = rows.filter((training) => training.visibility === "selected");

        if (selectedRows.length) {
          const { data: visibilityRows, error: visibilityError } = await supabase
            .from("training_visibility_members")
            .select("session_id,user_id")
            .eq("user_id", user.id)
            .in("session_id", selectedRows.map((training) => training.id));

          if (!visibilityError) {
            selectedVisibilitySessionIds = new Set((visibilityRows || []).map((row) => row.session_id));
          } else {
            console.warn("Selected visibility filter skipped", visibilityError);
          }
        }
      }

      const filtered = shouldSeeAll
        ? rows
        : rows.filter((training) => {
            if (training.creator_id === user.id) return true;
            if (training.visibility === "private") return false;
            if (training.visibility === "team" && !acceptedPartnerIds.has(training.creator_id)) return false;
            if (training.visibility === "selected" && !selectedVisibilitySessionIds.has(training.id)) return false;

            const sports = Array.isArray(training.sports) ? training.sports : [];
            return sports.some((sportId) => allowedSports.includes(sportId));
          });

      setTrainings(filtered.slice(0, 30));

      const trainingIds = filtered.map((training) => training.id);

      if (trainingIds.length) {
        const { data: participantRows, error: participantError } = await supabase
          .from("session_participants")
          .select("session_id,user_id")
          .in("session_id", trainingIds);

        if (!participantError) {
          const counts = {};
          const joined = new Set();

          (participantRows || []).forEach((row) => {
            counts[row.session_id] = (counts[row.session_id] || 0) + 1;
            if (row.user_id === user.id) joined.add(row.session_id);
          });

          setParticipantCounts(counts);
          setJoinedSessionIds(joined);
        } else {
          console.warn("Participant counts skipped", participantError);
          setParticipantCounts({});
        }
      } else {
        setParticipantCounts({});
      }
    } catch (err) {
      console.error("Training feed error", err);
      setErrorText(err?.message || "Could not load training sessions.");
      setTrainings([]);
      setParticipantCounts({});
    } finally {
      setLoading(false);
    }
  }

  async function toggleJoinFromCard(training) {
    if (!currentUserId || !training?.id) return;

    const alreadyJoined = joinedSessionIds.has(training.id);
    const joinedCount = participantCounts[training.id] || 0;
    const maxParticipants = training.max_participants ? Number(training.max_participants) : null;

    if (!alreadyJoined && maxParticipants && joinedCount >= maxParticipants) return;

    try {
      setBusySessionId(training.id);

      if (alreadyJoined) {
        const { error } = await supabase
          .from("session_participants")
          .delete()
          .eq("session_id", training.id)
          .eq("user_id", currentUserId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("session_participants")
          .insert({ session_id: training.id, user_id: currentUserId });

        if (error) throw error;
      }

      await loadTrainings();
    } catch (error) {
      console.error("Quick join error", error);
      setErrorText(error?.message || "Could not update participation.");
    } finally {
      setBusySessionId("");
    }
  }

  const openCreateTraining = () => {
    router.push("/trainings/new");
  };

  const visibleTrainings = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const filtered = trainings.filter((training) => {
      const hasRoute = Boolean(training.route_id);
      const hasWorkout = Boolean(training.workout_id);
      const joinedCount = participantCounts[training.id] || 0;
      const maxParticipants = training.max_participants ? Number(training.max_participants) : null;
      const isFull = Boolean(maxParticipants && joinedCount >= maxParticipants);

      if (activeFilter === "routes" && !hasRoute) return false;
      if (activeFilter === "workouts" && !hasWorkout) return false;
      if (activeFilter === "open" && isFull) return false;
      if (activeFilter === "joined" && !joinedSessionIds.has(training.id)) return false;

      if (!query) return true;

      const haystack = [
        training.title,
        training.description,
        training.start_location,
        Array.isArray(training.sports) ? training.sports.join(" ") : "",
        training.visibility,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "distance") {
        return Number(a.distance_km || 999999) - Number(b.distance_km || 999999);
      }

      if (sortMode === "participants") {
        return (participantCounts[b.id] || 0) - (participantCounts[a.id] || 0);
      }

      const aTime = a.final_starts_at || a.starts_at || a.flexible_date || a.created_at || "";
      const bTime = b.final_starts_at || b.starts_at || b.flexible_date || b.created_at || "";

      return String(aTime).localeCompare(String(bTime));
    });
  }, [trainings, searchTerm, activeFilter, sortMode, participantCounts, joinedSessionIds]);

  const filterCounts = useMemo(() => {
    return {
      all: trainings.length,
      open: trainings.filter((training) => {
        const joinedCount = participantCounts[training.id] || 0;
        const maxParticipants = training.max_participants ? Number(training.max_participants) : null;
        return !(maxParticipants && joinedCount >= maxParticipants);
      }).length,
      routes: trainings.filter((training) => training.route_id).length,
      workouts: trainings.filter((training) => training.workout_id).length,
      joined: trainings.filter((training) => joinedSessionIds.has(training.id)).length,
    };
  }, [trainings, participantCounts, joinedSessionIds]);

  const nextTraining = visibleTrainings[0];
  const nextTrainingLabel = nextTraining ? formatTrainingTime(nextTraining) : "No session yet";
  const empty = !loading && !errorText && trainings.length === 0;

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Training Sessions</div>

          <div style={styles.titleRow}>
            <h1 style={styles.title}>Who is training?</h1>

            <button type="button" onClick={openCreateTraining} style={styles.createButton}>
              + Create
            </button>
          </div>

          <p style={styles.subtitle}>
            Swipe through upcoming sessions that match your preferred sports.
          </p>
        </header>

        <section style={styles.dashboardGrid} aria-label="Training dashboard">
          <div style={styles.dashboardCard}>
            <span style={styles.dashboardLabel}>Matching</span>
            <strong style={styles.dashboardValue}>{loading ? "—" : visibleTrainings.length}</strong>
            <span style={styles.dashboardHint}>shown · {trainings.length} total</span>
          </div>

          <div style={styles.dashboardCard}>
            <span style={styles.dashboardLabel}>Sports</span>
            <strong style={styles.dashboardValue}>{canSeeAll ? "All" : preferredSportIds.length || "—"}</strong>
            <span style={styles.dashboardHint}>{preferredSportLabel}</span>
          </div>

          <div style={styles.dashboardCardWide}>
            <span style={styles.dashboardLabel}>Next up</span>
            <strong style={styles.dashboardValueSmall}>{nextTraining?.title || "Create momentum"}</strong>
            <span style={styles.dashboardHint}>{nextTrainingLabel}</span>
          </div>
        </section>

        {!loading && !errorText && trainings.length > 0 ? (
          <section style={styles.trainingControls}>
            <div style={styles.searchRow}>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search trainings, location or sport..."
                style={styles.searchInput}
              />

              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
                style={styles.sortSelect}
              >
                <option value="soonest">Soonest</option>
                <option value="distance">Distance</option>
                <option value="participants">Most joined</option>
              </select>
            </div>

            <div style={styles.filterRow}>
              {[
                ["all", "All"],
                ["open", "Open"],
                ["routes", "Routes"],
                ["workouts", "Workouts"],
                ["joined", "Joined"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveFilter(key)}
                  style={activeFilter === key ? styles.filterActive : styles.filterButton}
                >
                  {label}
                  <span style={styles.filterCount}>{filterCounts[key] || 0}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {loading ? (
          <section style={styles.stateCard}>
            <div style={styles.stateTitle}>Loading trainings...</div>
            <p style={styles.stateText}>
              Fetching your profile, preferred sports and upcoming sessions.
            </p>
          </section>
        ) : null}

        {errorText ? (
          <section style={styles.errorCard}>
            <div style={styles.stateTitle}>Could not load trainings</div>
            <p style={styles.stateText}>{errorText}</p>

            <button type="button" onClick={loadTrainings} style={styles.retryButton}>
              Try again
            </button>
          </section>
        ) : null}

        {empty ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyIcon}>⚡</div>

            <div style={styles.stateTitle}>
              {preferredSportIds.length ? "No matching trainings yet" : "Choose your preferred sports"}
            </div>

            <p style={styles.stateText}>
              {preferredSportIds.length
                ? "Create a new session or broaden your preferred sports in your profile."
                : "Your feed is filtered by preferred sports. Add sports to your profile first."}
            </p>

            <div style={styles.emptyActions}>
              <button type="button" onClick={openCreateTraining} style={styles.primaryButton}>
                Create training
              </button>

              <button type="button" onClick={() => router.push("/profile")} style={styles.secondaryButton}>
                Edit profile
              </button>
            </div>
          </section>
        ) : null}

        {!loading && !errorText && trainings.length > 0 && visibleTrainings.length === 0 ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyIcon}>🔎</div>
            <div style={styles.stateTitle}>No trainings match your filters</div>
            <p style={styles.stateText}>Try another search term, filter or sort mode.</p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setActiveFilter("all");
                setSortMode("soonest");
              }}
              style={styles.primaryButton}
            >
              Reset filters
            </button>
          </section>
        ) : null}

        {!loading && !errorText && visibleTrainings.length > 0 ? (
          <section style={styles.carousel}>
            {visibleTrainings.map((training) => {
              const primarySport = getPrimarySport(training);
              const sportLabel = getSportLabel(primarySport);
              const sportImage = getTrainingHeroImage(training, primarySport);
              const time = formatTrainingTime(training);
              const intensity = formatTrainingIntensity(training);
              const joinedCount = participantCounts[training.id] || 0;
              const alreadyJoined = joinedSessionIds.has(training.id);

              return (
                <article key={training.id} style={styles.card}>
                  <button
                    type="button"
                    onClick={() => router.push(`/trainings/${training.id}`)}
                    style={styles.cardClickableArea}
                    aria-label={`Open ${training.title}`}
                  >
                    <div
                      style={{
                        ...styles.imageWrap,
                        ...(sportImage.src
                          ? {
                              backgroundImage: `url("${sportImage.src}")`,
                              backgroundSize: "cover",
                              backgroundPosition: sportImage.position || "center center",
                            }
                          : {}),
                      }}
                    >
                      <div style={styles.imageOverlay} />
                    </div>

                    <div style={styles.cardContent}>
                      <div>
                        <div style={styles.cardTop}>
                          <div style={styles.sportBadge}>{sportLabel}</div>
                          <div style={styles.visibilityBadge}>{training.visibility}</div>
                        </div>

                        <h2 style={styles.cardTitle}>{training.title}</h2>
                        <p style={styles.meta}>🕒 {time}</p>
                        <p style={styles.meta}>📍 {training.start_location || "Location not set"}</p>
                        {training.distance_km ? <p style={styles.meta}>↗ {training.distance_km} km</p> : null}
                        <div style={styles.featureRow}>
                          <span style={training.route_id ? styles.featureActive : styles.featureMuted}>
                            🧭 {training.route_id ? "Route" : "No route"}
                          </span>
                          <span style={training.workout_id ? styles.featureActive : styles.featureMuted}>
                            🏋️ {training.workout_id ? "Workout" : "No workout"}
                          </span>
                        </div>
                        <p style={styles.meta}>⚡ {intensity}</p>
                      </div>
                    </div>
                  </button>

                  <div style={styles.cardFooter}>
                    <span style={styles.joined}>
                      {joinedCount ? `${joinedCount} joined` : "No participants yet"}
                      {" · "}
                      {training.max_participants ? `Max ${training.max_participants}` : "Open session"}
                    </span>

                    <div style={styles.footerActions}>
                      <button
                        type="button"
                        onClick={() => toggleJoinFromCard(training)}
                        disabled={busySessionId === training.id || (!alreadyJoined && training.max_participants && joinedCount >= Number(training.max_participants))}
                        style={alreadyJoined ? styles.leaveSmallButton : styles.joinSmallButton}
                      >
                        {busySessionId === training.id ? "..." : alreadyJoined ? "Leave" : training.max_participants && joinedCount >= Number(training.max_participants) ? "Full" : "Join"}
                      </button>

                      <button
                        type="button"
                        onClick={() => router.push(`/trainings/${training.id}`)}
                        style={styles.openButton}
                      >
                        Open →
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}
      </section>
    </main>
  );
}

const baseButton = {
  border: 0,
  cursor: "pointer",
  fontWeight: 950,
};

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 18px 42px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: {
    width: "min(960px, 100%)",
    margin: "0 auto",
    display: "grid",
    gap: 22,
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
    display: "flex",
    justifyContent: "space-between",
    alignItems: "end",
    gap: 14,
    flexWrap: "wrap",
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
    maxWidth: 520,
  },
  dashboardGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 2,
  },
  dashboardCard: {
    minHeight: 104,
    borderRadius: 26,
    padding: 16,
    boxSizing: "border-box",
    background: "linear-gradient(145deg, rgba(255,255,255,0.11), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.13)",
    boxShadow: "0 18px 46px rgba(0,0,0,0.22)",
    display: "grid",
    alignContent: "space-between",
  },
  dashboardCardWide: {
    gridColumn: "1 / -1",
    minHeight: 104,
    borderRadius: 26,
    padding: 16,
    boxSizing: "border-box",
    background:
      "radial-gradient(circle at 90% 18%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.11), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.13)",
    boxShadow: "0 18px 46px rgba(0,0,0,0.22)",
    display: "grid",
    gap: 5,
  },
  dashboardLabel: {
    color: "rgba(255,255,255,0.54)",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  dashboardValue: {
    fontSize: 36,
    letterSpacing: "-0.06em",
    lineHeight: 0.95,
  },
  dashboardValueSmall: {
    fontSize: 23,
    letterSpacing: "-0.045em",
    lineHeight: 1.05,
  },
  dashboardHint: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    fontWeight: 800,
  },
  createButton: {
    ...baseButton,
    minHeight: 48,
    borderRadius: 999,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 18px",
    boxShadow: "0 18px 38px rgba(228,239,22,0.16)",
  },
  carousel: {
    display: "flex",
    gap: 16,
    overflowX: "auto",
    padding: "4px 2px 18px",
    scrollSnapType: "x mandatory",
    WebkitOverflowScrolling: "touch",
  },
  card: {
    minWidth: 326,
    maxWidth: 326,
    minHeight: 444,
    borderRadius: 32,
    boxSizing: "border-box",
    color: "white",
    background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
    scrollSnapAlign: "start",
    display: "grid",
    overflow: "hidden",
    userSelect: "none",
  },
  cardClickableArea: {
    display: "grid",
    textAlign: "left",
    border: 0,
    padding: 0,
    margin: 0,
    color: "white",
    background: "transparent",
    cursor: "pointer",
  },
  imageWrap: {
    position: "relative",
    height: 178,
    overflow: "hidden",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background:
      "radial-gradient(circle at 78% 18%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #151915, #060706)",
    backgroundRepeat: "no-repeat",
  },
  imageOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.55)), radial-gradient(circle at 78% 10%, rgba(228,239,22,0.18), transparent 36%)",
    pointerEvents: "none",
  },
  cardContent: {
    padding: 22,
    display: "grid",
    gap: 20,
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  sportBadge: {
    display: "inline-flex",
    width: "fit-content",
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.28)",
    color: "#e4ef16",
    fontWeight: 950,
    fontSize: 13,
  },
  visibilityBadge: {
    borderRadius: 999,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.72)",
    fontWeight: 850,
    fontSize: 12,
    textTransform: "capitalize",
  },
  cardTitle: {
    margin: "18px 0 10px",
    fontSize: 29,
    lineHeight: 1.02,
    letterSpacing: "-0.045em",
  },
  meta: {
    margin: "8px 0",
    color: "rgba(255,255,255,0.70)",
    fontSize: 15,
    lineHeight: 1.35,
  },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "0 22px 22px",
  },
  joined: {
    color: "rgba(255,255,255,0.70)",
    fontWeight: 800,
    fontSize: 13,
  },
  openButton: {
    ...baseButton,
    color: "#101406",
    background: "#e4ef16",
    borderRadius: 999,
    padding: "10px 13px",
    fontSize: 13,
  },
  stateCard: {
    borderRadius: 28,
    padding: 22,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  emptyCard: {
    borderRadius: 32,
    padding: 28,
    background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.14)",
    border: "1px solid rgba(228,239,22,0.25)",
    marginBottom: 16,
    fontSize: 24,
  },
  emptyActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 20,
  },
  errorCard: {
    borderRadius: 28,
    padding: 22,
    background: "rgba(140,20,20,0.18)",
    border: "1px solid rgba(255,90,90,0.22)",
  },
  stateTitle: {
    fontSize: 22,
    fontWeight: 950,
  },
  stateText: {
    color: "rgba(255,255,255,0.70)",
    lineHeight: 1.5,
    marginBottom: 0,
  },
  retryButton: {
    ...baseButton,
    minHeight: 42,
    borderRadius: 999,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 16px",
    marginTop: 12,
  },
  primaryButton: {
    ...baseButton,
    minHeight: 54,
    borderRadius: 20,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 18px",
    boxShadow: "0 18px 38px rgba(228,239,22,0.16)",
  },
  secondaryButton: {
    ...baseButton,
    minHeight: 54,
    borderRadius: 20,
    background: "rgba(255,255,255,0.08)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "0 18px",
  },
  trainingControls: {
    borderRadius: 28,
    padding: 14,
    background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.12)",
    display: "grid",
    gap: 12,
  },
  searchRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 140px",
    gap: 10,
  },
  searchInput: {
    minHeight: 46,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: "0 14px",
    outline: "none",
    fontSize: 15,
  },
  sortSelect: {
    minHeight: 46,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: "0 12px",
    outline: "none",
    fontWeight: 850,
  },
  filterRow: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 2,
  },
  filterButton: {
    minHeight: 40,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.72)",
    padding: "0 12px",
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  filterActive: {
    minHeight: 40,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.34)",
    background: "rgba(228,239,22,0.14)",
    color: "#e4ef16",
    padding: "0 12px",
    fontWeight: 950,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  filterCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    display: "inline-grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.10)",
    fontSize: 12,
  },
  featureRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 8,
  },
  featureActive: {
    borderRadius: 999,
    padding: "8px 10px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.22)",
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
  },
  featureMuted: {
    borderRadius: 999,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.52)",
    fontSize: 12,
    fontWeight: 900,
  },
  footerActions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  joinSmallButton: {
    ...baseButton,
    color: "#101406",
    background: "#e4ef16",
    borderRadius: 999,
    padding: "10px 13px",
    fontSize: 13,
  },
  leaveSmallButton: {
    ...baseButton,
    color: "white",
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 999,
    padding: "10px 13px",
    fontSize: 13,
  },

};
