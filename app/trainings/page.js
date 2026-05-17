"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import TrainingCard from "../../components/trainings/TrainingCard";
import { supabase } from "../../lib/supabase";
import {
  formatTrainingIntensity,
  formatTrainingTime,
  getPrimarySport,
  getSportLabel,
} from "../../lib/trainingHelpers";
import { getTrainingHeroImage } from "../../lib/sportImages";
import { canUserSeeTraining } from "../../lib/trainingVisibility";

const privilegedRoles = ["admin", "moderator"];

function isActionNeededTraining(training) {
  return training?.planning_type === "flexible" && !training?.final_starts_at;
}

function getFeedSortValue(training) {
  const value =
    training?.final_starts_at ||
    training?.starts_at ||
    (training?.flexible_date
      ? `${training.flexible_date}T${training.flexible_start_time || "00:00"}:00`
      : null) ||
    training?.created_at ||
    "9999-12-31T23:59:59";

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function sortTrainingFeed(a, b) {
  const aAction = isActionNeededTraining(a);
  const bAction = isActionNeededTraining(b);

  if (aAction !== bAction) return aAction ? -1 : 1;

  return getFeedSortValue(a) - getFeedSortValue(b);
}

export default function TrainingsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [preferredSportIds, setPreferredSportIds] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [participantCounts, setParticipantCounts] = useState({});
  const [creatorProfiles, setCreatorProfiles] = useState({});
  const [joinedSessionIds, setJoinedSessionIds] = useState(new Set());
  const [trainingInviteCount, setTrainingInviteCount] = useState(0);
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

      const { count: inviteCount } = await supabase
        .from("training_invites")
        .select("id", { count: "exact", head: true })
        .eq("invitee_id", user.id);

      setTrainingInviteCount(inviteCount || 0);

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

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayDate = today.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("training_sessions")
        .select("id,creator_id,title,description,sports,visibility,planning_type,starts_at,flexible_date,flexible_start_time,flexible_end_time,final_starts_at,start_location,distance_km,estimated_duration_min,intensity_label,pace_min,pace_max,speed_min,speed_max,max_participants,teaser_photo_url,route_id,workout_id,created_at")
        .or(`starts_at.gte.${today.toISOString()},flexible_date.gte.${todayDate},final_starts_at.gte.${today.toISOString()}`)
        .limit(120);

      if (error) throw error;

      const shouldSeeAll = privilegedRoles.includes(profileRow?.role);

      const rows = (data || [])
        .filter((training) => {
          const startValue = training.final_starts_at || training.starts_at || null;

          if (startValue) {
            const startDate = new Date(startValue);
            if (Number.isNaN(startDate.getTime())) return true;
            return startDate >= today;
          }

          if (training.planning_type === "flexible" && training.flexible_date) {
            return training.flexible_date >= todayDate;
          }

          return false;
        })
.sort(sortTrainingFeed);


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

    if (!query) return [...trainings].sort(sortTrainingFeed);

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
    }).sort(sortTrainingFeed);
  }, [trainings, searchTerm]);
  const actionNeededCount = visibleTrainings.filter(isActionNeededTraining).length;
  const upcomingCount = Math.max(visibleTrainings.length - actionNeededCount, 0);
  const empty = !loading && !errorText && trainings.length === 0;

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.hero}>
          <div>
            <div style={styles.kicker}>Training Sessions</div>
            <h1 style={styles.title}>Who is training<span style={styles.dot}>?</span></h1>
            <p style={styles.subtitle}>
              Find, create and join verified training sessions with your Endurance community.
            </p>
          </div>

          <button type="button" onClick={openCreateTraining} style={styles.heroCreateButton}>
            👤＋ Create training
          </button>
        </header>

        <section style={styles.focusCard}>
          <div style={styles.iconBubbleLime}>⚡</div>
          <div style={styles.cardCopy}>
            <h2 style={styles.cardTitle}>Train together</h2>
            <p style={styles.muted}>
              Create a session, invite people, agree a time and train together.
            </p>
          </div>
        </section>

        {!loading && !errorText && trainings.length > 0 ? (
          <section style={styles.filterCard}>
            <div style={styles.sectionIntroCompact}>
              <span style={styles.iconSmall}>🔎</span>
              <h2 style={styles.cardTitle}>Find training</h2>
            </div>

            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search training, location or sport..."
              style={styles.searchInput}
            />
          </section>
        ) : null}

        {!loading && trainingInviteCount > 0 ? (
          <section style={styles.inviteBanner}>
            <div>
              <div style={styles.kicker}>Training invites</div>
              <strong style={styles.inviteBannerTitle}>
                You have {trainingInviteCount} invite{trainingInviteCount === 1 ? "" : "s"}
              </strong>
              <p style={styles.inviteBannerText}>Open Team to join or decline invited sessions.</p>
            </div>

            <button type="button" onClick={() => router.push("/team")} style={styles.primaryButton}>
              Open Team
            </button>
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
            <div style={styles.managementHeader}>
              <div style={styles.sectionIntroCompact}>
                <span style={styles.iconSmall}>👥</span>
                <div>
                  <div style={styles.kicker}>Training Sessions</div>
                  <h2 style={styles.cardTitle}>Upcoming sessions</h2>
                </div>
              </div>

              <span style={styles.listCount}>
                {actionNeededCount ? `${actionNeededCount} action needed · ` : ""}{upcomingCount} upcoming
              </span>
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
                  training.distance_km !== null &&
                  training.distance_km !== undefined &&
                  training.distance_km !== "";
                const hasIntensity = intensity && intensity !== "Intensity not set";
                const hasRouteOrWorkout = Boolean(training.route_id || training.workout_id);
                const maxParticipants = training.max_participants ? Number(training.max_participants) : null;
                const spotsLeft = maxParticipants ? Math.max(maxParticipants - joinedCount, 0) : null;
                const creator = creatorProfiles[training.creator_id];
                const creatorName = creator?.displayName || (training.creator_id === currentUserId ? "You" : "Organizer");

                return (
                  <TrainingCard
                    key={training.id}
                    training={training}
                    sportLabel={sportLabel}
                    sportImage={sportImage}
                    creator={creator}
                    creatorName={creatorName}
                    time={time}
                    intensity={intensity}
                    participantCount={joinedCount}
                    maxParticipants={maxParticipants}
                    joined={alreadyJoined}
                    spotsLeft={spotsLeft}
                    busy={busySessionId === training.id}
                    onJoin={() => toggleJoinFromCard(training)}
                    onOpen={() => router.push(`/trainings/${training.id}`)}
                    onCreatorClick={() => router.push(`/profile/${training.creator_id}`)}
                    actionNeeded={isActionNeededTraining(training)}
                    actionLabel={training.creator_id === currentUserId ? "Time to decide" : "Availability needed"}
                  />
                );
              })}
            </section>
          </section>
        ) : null}

        <section style={styles.statsGrid} aria-label="Training dashboard">
          <article style={styles.statCard}>
            <span style={styles.statIconLime}>👥</span>
            <strong style={styles.statValue}>{loading ? "…" : visibleTrainings.length}</strong>
            <span style={styles.statTitle}>Shown</span>
            <span style={styles.statHint}>{trainings.length} total sessions</span>
          </article>

          <article style={styles.statCard}>
            <span style={styles.statIconBlue}>✉</span>
            <strong style={styles.statValue}>{trainingInviteCount || 0}</strong>
            <span style={styles.statTitle}>Invites</span>
            <span style={styles.statHint}>Open invites</span>
          </article>

          <article style={styles.statCard}>
            <span style={styles.statIconPurple}>⚡</span>
            <strong style={styles.statValue}>{actionNeededCount || 0}</strong>
            <span style={styles.statTitle}>Action</span>
            <span style={styles.statHint}>Need time</span>
          </article>

          <article style={styles.statCard}>
            <span style={styles.statIconOrange}>♛</span>
            <strong style={styles.statValue}>{canSeeAll ? "All" : preferredSportIds.length || "—"}</strong>
            <span style={styles.statTitle}>Sports</span>
            <span style={styles.statHint}>{preferredSportLabel}</span>
          </article>
        </section>
      </section>
    </main>
  );
}

const baseButton = {
  border: 0,
  cursor: "pointer",
  fontWeight: 950,
  fontFamily: "inherit",
};

const glassCard = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.035))",
  boxShadow: "0 22px 70px rgba(0,0,0,0.28)",
};

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    maxWidth: "100vw",
    overflowX: "hidden",
    background:
      "radial-gradient(circle at 96% 0%, rgba(228,239,22,0.18), transparent 28%), radial-gradient(circle at 0% 18%, rgba(55,125,255,0.10), transparent 30%), linear-gradient(180deg, #07100b 0%, #050706 58%, #020202 100%)",
    color: "white",
    padding: "12px max(12px, env(safe-area-inset-left)) 44px max(12px, env(safe-area-inset-right))",
    boxSizing: "border-box",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  shell: {
    width: "100%",
    maxWidth: 1080,
    margin: "0 auto",
    display: "grid",
    gap: 14,
    minWidth: 0,
    overflow: "hidden",
    boxSizing: "border-box",
  },

  hero: {
    ...glassCard,
    borderRadius: 32,
    padding: "clamp(18px, 5vw, 34px)",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    alignItems: "end",
    gap: 18,
    position: "relative",
    overflow: "hidden",
  },

  kicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },

  title: {
    margin: "7px 0 0",
    fontSize: "clamp(42px, 11vw, 78px)",
    lineHeight: 0.92,
    letterSpacing: "-0.075em",
    maxWidth: "100%",
  },

  dot: {
    color: "#e4ef16",
  },

  subtitle: {
    margin: "12px 0 0",
    maxWidth: 620,
    color: "rgba(255,255,255,0.70)",
    fontSize: "clamp(15px, 3.8vw, 18px)",
    lineHeight: 1.45,
    fontWeight: 750,
  },

  heroCreateButton: {
    ...baseButton,
    minHeight: 54,
    width: "100%",
    maxWidth: 260,
    justifySelf: "end",
    borderRadius: 20,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 20px",
    boxShadow: "0 18px 44px rgba(228,239,22,0.20)",
    whiteSpace: "nowrap",
  },

  focusCard: {
    ...glassCard,
    borderRadius: 26,
    padding: 14,
    display: "grid",
    gridTemplateColumns: "48px minmax(0, 1fr)",
    alignItems: "center",
    gap: 12,
  },

  iconBubbleLime: {
    width: 48,
    height: 48,
    borderRadius: 17,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.13)",
    border: "1px solid rgba(228,239,22,0.26)",
    fontSize: 22,
  },

  cardCopy: {
    minWidth: 0,
  },

  cardTitle: {
    margin: 0,
    fontSize: "clamp(20px, 5vw, 28px)",
    lineHeight: 1,
    letterSpacing: "-0.05em",
  },

  muted: {
    margin: "5px 0 0",
    color: "rgba(255,255,255,0.64)",
    lineHeight: 1.35,
    fontWeight: 750,
  },

  filterCard: {
    ...glassCard,
    borderRadius: 26,
    padding: 14,
    display: "grid",
    gap: 12,
  },

  sectionIntroCompact: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },

  iconSmall: {
    width: 34,
    height: 34,
    borderRadius: 13,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.075)",
    border: "1px solid rgba(255,255,255,0.10)",
    flexShrink: 0,
  },

  searchInput: {
    minHeight: 48,
    width: "100%",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.28)",
    color: "white",
    padding: "0 16px",
    outline: "none",
    fontSize: 15,
    boxSizing: "border-box",
  },

  inviteBanner: {
    ...glassCard,
    borderRadius: 26,
    padding: 16,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
    gap: 14,
    alignItems: "center",
  },

  inviteBannerTitle: {
    display: "block",
    marginTop: 4,
    fontSize: 20,
    letterSpacing: "-0.04em",
  },

  inviteBannerText: {
    margin: "5px 0 0",
    color: "rgba(255,255,255,0.62)",
    fontWeight: 750,
  },

  trainingListBlock: {
    ...glassCard,
    borderRadius: 30,
    padding: 12,
    display: "grid",
    gap: 12,
    overflow: "hidden",
  },

  managementHeader: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },

  listCount: {
    color: "rgba(255,255,255,0.58)",
    fontWeight: 850,
    fontSize: 12,
    whiteSpace: "normal",
    textAlign: "right",
  },

  trainingList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
    gap: 12,
    width: "100%",
    minWidth: 0,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))",
    gap: 10,
    width: "100%",
    minWidth: 0,
  },

  statCard: {
    ...glassCard,
    minHeight: 128,
    borderRadius: 24,
    padding: 14,
    display: "grid",
    alignContent: "space-between",
    gap: 8,
    overflow: "hidden",
  },

  statIconLime: {
    width: 34,
    height: 34,
    borderRadius: 13,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.13)",
    border: "1px solid rgba(228,239,22,0.25)",
  },

  statIconBlue: {
    width: 34,
    height: 34,
    borderRadius: 13,
    display: "grid",
    placeItems: "center",
    background: "rgba(80,150,255,0.13)",
    border: "1px solid rgba(80,150,255,0.22)",
  },

  statIconPurple: {
    width: 34,
    height: 34,
    borderRadius: 13,
    display: "grid",
    placeItems: "center",
    background: "rgba(190,120,255,0.13)",
    border: "1px solid rgba(190,120,255,0.22)",
  },

  statIconOrange: {
    width: 34,
    height: 34,
    borderRadius: 13,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,165,80,0.13)",
    border: "1px solid rgba(255,165,80,0.22)",
  },

  statValue: {
    fontSize: "clamp(28px, 8vw, 40px)",
    lineHeight: 0.9,
    letterSpacing: "-0.07em",
  },

  statTitle: {
    color: "white",
    fontSize: 13,
    fontWeight: 950,
  },

  statHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.25,
    overflowWrap: "anywhere",
  },

  stateCard: {
    ...glassCard,
    borderRadius: 28,
    padding: 22,
  },

  emptyCard: {
    ...glassCard,
    borderRadius: 28,
    padding: 22,
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
    marginTop: 18,
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
    letterSpacing: "-0.04em",
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
    minHeight: 50,
    borderRadius: 18,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 18px",
    boxShadow: "0 18px 38px rgba(228,239,22,0.16)",
    width: "100%",
  },

  secondaryButton: {
    ...baseButton,
    minHeight: 50,
    borderRadius: 18,
    background: "rgba(255,255,255,0.08)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "0 18px",
  },
};
