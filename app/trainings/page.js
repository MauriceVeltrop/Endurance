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
  const [creatorProfiles, setCreatorProfiles] = useState({});
  const [joinedSessionIds, setJoinedSessionIds] = useState(new Set());
  const [currentUserId, setCurrentUserId] = useState("");
  const [busySessionId, setBusySessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

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

      const visibleRows = filtered.slice(0, 30);
      setTrainings(visibleRows);

      const creatorIds = [...new Set(visibleRows.map((training) => training.creator_id).filter(Boolean))];

      if (creatorIds.length) {
        const { data: creatorRows, error: creatorError } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,avatar_url")
          .in("id", creatorIds);

        if (!creatorError) {
          const mappedCreators = {};

          (creatorRows || []).forEach((creator) => {
            const fullName = [creator.first_name, creator.last_name].filter(Boolean).join(" ").trim();
            mappedCreators[creator.id] = {
              ...creator,
              displayName: fullName || creator.name || "Unknown organizer",
            };
          });

          setCreatorProfiles(mappedCreators);
        } else {
          console.warn("Creator profiles skipped", creatorError);
          setCreatorProfiles({});
        }
      } else {
        setCreatorProfiles({});
      }

      const trainingIds = visibleRows.map((training) => training.id);

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
      setCreatorProfiles({});
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

    if (!query) return trainings;

    return trainings.filter((training) => {
      const haystack = [
        training.title,
        training.description,
        training.start_location,
        Array.isArray(training.sports) ? training.sports.map(getSportLabel).join(" ") : "",
        Array.isArray(training.sports) ? training.sports.join(" ") : "",
        training.visibility,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [trainings, searchTerm]);
  const empty = !loading && !errorText && trainings.length === 0;

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.mobileHero}>
          <div style={styles.heroText}>
            <div style={styles.kicker}>Training Sessions</div>
            <h1 style={styles.title}>Who is training?</h1>
          </div>

          <button type="button" onClick={openCreateTraining} style={styles.createButton}>
            + Create
          </button>
        </header>

        {!loading && !errorText && trainings.length > 0 ? (
          <section style={styles.trainingControls}>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search trainings, location or sport..."
              style={styles.searchInput}
            />
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
            <div style={styles.stateTitle}>No trainings found</div>
            <p style={styles.stateText}>Try another search term.</p>
            <button type="button" onClick={() => setSearchTerm("")} style={styles.primaryButton}>
              Clear search
            </button>
          </section>
        ) : null}

        {!loading && !errorText && visibleTrainings.length > 0 ? (
          <section style={styles.trainingListBlock} aria-label="Training sessions list">
            <div style={styles.listHeader}>
              <span style={styles.kicker}>Training Sessions</span>
              <span style={styles.listCount}>{visibleTrainings.length} shown</span>
            </div>

            <section style={styles.trainingList}>
              {visibleTrainings.map((training) => {
                const primarySport = getPrimarySport(training);
                const sportLabel = getSportLabel(primarySport);
                const sportImage = getTrainingHeroImage(training, primarySport);
                const time = formatTrainingTime(training);
                const intensity = formatTrainingIntensity(training);
                const joinedCount = participantCounts[training.id] || 0;
                const alreadyJoined = joinedSessionIds.has(training.id);
                const hasDistance =

                  training.distance_km !== "";
                const maxParticipants = training.max_participants ? Number(training.max_participants) : null;
                const spotsLeft = maxParticipants ? Math.max(maxParticipants - joinedCount, 0) : null;
                const creator = creatorProfiles[training.creator_id];
                const creatorName = creator?.displayName || (training.creator_id === currentUserId ? "You" : "Organizer");

                return (
                  <article key={training.id} style={styles.card}>
                    <button
                      type="button"
                      onClick={() => router.push(`/trainings/${training.id}`)}
                      style={styles.cardMain}
                      aria-label={`Open ${training.title}`}
                    >
                      <div
                        style={{
                          ...styles.cardImage,
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

                      <div style={styles.cardBody}>
                        <div style={styles.badgeRow}>
                          <span style={styles.sportBadge}>{sportLabel}</span>
                          <span style={styles.visibilityBadge}>{training.visibility}</span>
                        </div>

                        <h2 style={styles.cardTitle}>{training.title}</h2>

                        <div style={styles.creatorRow}>
                          {creator?.avatar_url ? (
                            <img src={creator.avatar_url} alt="" style={styles.creatorAvatar} />
                          ) : (
                            <span style={styles.creatorFallback}>{creatorName.slice(0, 1).toUpperCase()}</span>
                          )}
                          <span>Created by {creatorName}</span>
                        </div>

                        <div style={styles.metaGrid}>
                          <span>🕒 {time}</span>
                          <span>📍 {training.start_location || "Location not set"}</span>
                        </div>

                        <div style={styles.metricRow}>
                          <span style={styles.metricPill}>↗ {hasDistance ? `${training.distance_km} km` : "Distance —"}</span>
                          <span style={styles.metricPill}>👥 {joinedCount}{maxParticipants ? `/${maxParticipants}` : ""}</span>
                          <span style={styles.metricPill}>⚡ {intensity}</span>
                        </div>

                        <div style={styles.featureRow}>
                          <span style={training.route_id ? styles.featureActive : styles.featureMuted}>
                            🧭 {training.route_id ? "Route" : ""}
                          </span>

                          <span style={training.workout_id ? styles.featureActive : styles.featureMuted}>
                            🏋️ {training.workout_id ? "Workout" : ""}
                          </span>
                        </div>
                      </div>
                    </button>

                    <div style={styles.cardFooter}>
                      <div style={styles.footerText}>
                        <span style={styles.joined}>
                          {alreadyJoined
                            ? "You joined"
                            : spotsLeft !== null
                              ? `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`
                              : "Open session"}
                        </span>
                        <span style={styles.footerSub}>
                          {joinedCount ? `${joinedCount} joined` : "No participants yet"}
                        </span>
                      </div>

                      <div style={styles.footerActions}>
                        <button
                          type="button"
                          onClick={() => toggleJoinFromCard(training)}
                          disabled={busySessionId === training.id || (!alreadyJoined && spotsLeft === 0)}
                          style={alreadyJoined ? styles.leaveSmallButton : styles.joinSmallButton}
                        >
                          {busySessionId === training.id
                            ? "..."
                            : alreadyJoined
                              ? "Leave"
                              : spotsLeft === 0
                                ? "Full"
                                : "Join"}
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
          </section>
        ) : null}

        <section style={styles.dashboardGrid} aria-label="Training dashboard">
          <div style={styles.dashboardCard}>
            <span style={styles.dashboardLabel}>Matching</span>
            <strong style={styles.dashboardValue}>{loading ? "—" : visibleTrainings.length}</strong>
            <span style={styles.dashboardHint}>shown · {trainings.length} total</span>
          </div>

          <div style={styles.dashboardCard}>
            <span style={styles.dashboardLabel}>Preferred Sports</span>
            <strong style={styles.dashboardValue}>{canSeeAll ? "All" : preferredSportIds.length || "—"}</strong>
            <span style={styles.dashboardHint}>{preferredSportLabel}</span>
          </div>
        </section>
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
    width: "100%",
    maxWidth: "100vw",
    overflowX: "hidden",
    background:
      "radial-gradient(circle at 100% 2%, rgba(228,239,22,0.13), transparent 31%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "14px 12px 42px",
    boxSizing: "border-box",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  shell: {
    width: "100%",
    maxWidth: 860,
    margin: "0 auto",
    display: "grid",
    gap: 16,
    overflow: "hidden",
    boxSizing: "border-box",
  },

  mobileHero: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "end",
    gap: 10,
    marginTop: 2,
    boxSizing: "border-box",
  },

  heroText: {
    minWidth: 0,
  },

  kicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },

  title: {
    margin: "6px 0 0",
    fontSize: "clamp(34px, 10vw, 54px)",
    lineHeight: 0.94,
    letterSpacing: "-0.07em",
    maxWidth: "100%",
  },

  createButton: {
    ...baseButton,
    minHeight: 44,
    maxWidth: 108,
    borderRadius: 999,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 14px",
    boxShadow: "0 18px 38px rgba(228,239,22,0.16)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  trainingControls: {
    width: "100%",
    boxSizing: "border-box",
  },

  searchInput: {
    minHeight: 46,
    width: "100%",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.24)",
    color: "white",
    padding: "0 18px",
    outline: "none",
    fontSize: 15,
    boxSizing: "border-box",
    boxShadow: "inset 0 0 0 1px rgba(228,239,22,0.04)",
  },

  trainingListBlock: {
    display: "grid",
    gap: 12,
    minWidth: 0,
    width: "100%",
  },

  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },

  listCount: {
    color: "rgba(255,255,255,0.58)",
    fontWeight: 850,
    fontSize: 13,
    whiteSpace: "nowrap",
  },

  trainingList: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
    width: "100%",
    minWidth: 0,
  },

  card: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    borderRadius: 28,
    boxSizing: "border-box",
    color: "white",
    background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
    display: "grid",
    overflow: "hidden",
  },

  cardMain: {
    display: "grid",
    textAlign: "left",
    border: 0,
    padding: 0,
    margin: 0,
    color: "white",
    background: "transparent",
    cursor: "pointer",
    width: "100%",
    minWidth: 0,
  },

  cardImage: {
    position: "relative",
    height: 142,
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
      "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.52)), radial-gradient(circle at 78% 10%, rgba(228,239,22,0.18), transparent 36%)",
    pointerEvents: "none",
  },

  cardBody: {
    padding: 16,
    display: "grid",
    gap: 11,
    minWidth: 0,
  },

  badgeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },

  sportBadge: {
    display: "inline-flex",
    minWidth: 0,
    maxWidth: "70%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    borderRadius: 999,
    padding: "8px 11px",
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
    flexShrink: 0,
  },

  cardTitle: {
    margin: 0,
    fontSize: "clamp(27px, 8vw, 34px)",
    lineHeight: 1,
    letterSpacing: "-0.055em",
    overflowWrap: "anywhere",
  },

  metaGrid: {
    display: "grid",
    gap: 6,
    color: "rgba(255,255,255,0.70)",
    fontSize: 14,
    lineHeight: 1.35,
    minWidth: 0,
  },

  metricRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },

  metricPill: {
    borderRadius: 999,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.065)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.78)",
    fontWeight: 850,
    fontSize: 12,
  },

  featureRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
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

  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "0 16px 16px",
    flexWrap: "wrap",
  },

  footerText: {
    display: "grid",
    gap: 3,
    minWidth: 0,
  },

  joined: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: 950,
    fontSize: 13,
  },

  footerSub: {
    color: "rgba(255,255,255,0.50)",
    fontWeight: 800,
    fontSize: 12,
  },

  footerActions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexShrink: 0,
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

  openButton: {
    ...baseButton,
    color: "#101406",
    background: "#e4ef16",
    borderRadius: 999,
    padding: "10px 13px",
    fontSize: 13,
  },

  dashboardGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 2,
    minWidth: 0,
  },

  dashboardCard: {
    minHeight: 102,
    borderRadius: 24,
    padding: 14,
    boxSizing: "border-box",
    background: "linear-gradient(145deg, rgba(255,255,255,0.11), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.13)",
    boxShadow: "0 18px 46px rgba(0,0,0,0.22)",
    display: "grid",
    alignContent: "space-between",
    minWidth: 0,
  },

  dashboardLabel: {
    color: "rgba(255,255,255,0.54)",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },

  dashboardValue: {
    fontSize: 34,
    letterSpacing: "-0.06em",
    lineHeight: 0.95,
  },

  dashboardHint: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.25,
  },

  stateCard: {
    borderRadius: 28,
    padding: 22,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
  },

  emptyCard: {
    borderRadius: 28,
    padding: 22,
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
    minHeight: 52,
    borderRadius: 20,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 18px",
    boxShadow: "0 18px 38px rgba(228,239,22,0.16)",
  },

  secondaryButton: {
    ...baseButton,
    minHeight: 52,
    borderRadius: 20,
    background: "rgba(255,255,255,0.08)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "0 18px",
  },
};
