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
          <button type="button" onClick={openCreateTraining} style={styles.primaryButton}>
            Create →
          </button>
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
            <span style={styles.statHint}>Open training invites</span>
          </article>

          <article style={styles.statCard}>
            <span style={styles.statIconPurple}>⚡</span>
            <strong style={styles.statValue}>{actionNeededCount || 0}</strong>
            <span style={styles.statTitle}>Action</span>
            <span style={styles.statHint}>Need availability/time</span>
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
};

const styles = {

  hero: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "end",
    gap: 18,
    marginTop: 2,
    boxSizing: "border-box",
  },

  dot: {
    color: "#e4ef16",
  },

  subtitle: {
    margin: "10px 0 0",
    maxWidth: 680,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.55,
    fontSize: 18,
  },

  heroCreateButton: {
    ...baseButton,
    minHeight: 52,
    borderRadius: 999,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 22px",
    boxShadow: "0 18px 46px rgba(228,239,22,0.16)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  focusCard: {
    borderRadius: 28,
    padding: 18,
    background: "linear-gradient(145deg, rgba(255,255,255,0.095), rgba(255,255,255,0.035))",
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gridTemplateColumns: "64px minmax(0,1fr) auto",
    gap: 18,
    alignItems: "center",
  },

  filterCard: {
    borderRadius: 28,
    padding: 18,
    background: "linear-gradient(145deg, rgba(255,255,255,0.095), rgba(255,255,255,0.035))",
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
  },

  iconBubbleLime: {
    width: 64,
    height: 64,
    borderRadius: 22,
    display: "grid",
    placeItems: "center",
    color: "#e4ef16",
    background: "rgba(228,239,22,0.13)",
    border: "1px solid rgba(228,239,22,0.22)",
    fontSize: 32,
  },

  cardCopy: {
    display: "grid",
    gap: 4,
  },

  cardTitle: {
    margin: 0,
    fontSize: "clamp(25px, 6.5vw, 34px)",
    lineHeight: 1,
    letterSpacing: "-0.055em",
  },

  muted: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.48,
  },

  sectionIntroCompact: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },

  iconSmall: {
    color: "#e4ef16",
    fontSize: 26,
    lineHeight: 1,
  },

  managementHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },

  statCard: {
    minHeight: 150,
    borderRadius: 24,
    padding: 18,
    background: "linear-gradient(145deg, rgba(255,255,255,0.095), rgba(255,255,255,0.035))",
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    alignContent: "space-between",
    gap: 8,
    minWidth: 0,
  },

  statIconLime: { color: "#e4ef16", fontSize: 30 },
  statIconBlue: { color: "#3ea2ff", fontSize: 30 },
  statIconPurple: { color: "#a764ff", fontSize: 30 },
  statIconOrange: { color: "#ff9d1c", fontSize: 30 },

  statValue: {
    fontSize: 46,
    lineHeight: 0.9,
    letterSpacing: "-0.075em",
  },

  statTitle: { fontWeight: 950 },

  statHint: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
  },
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
    maxWidth: 1040,
    margin: "0 auto",
    display: "grid",
    gap: 18,
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
    fontSize: "clamp(46px, 13vw, 76px)",
    lineHeight: 0.92,
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
    borderRadius: 30,
    padding: 18,
    background: "linear-gradient(145deg, rgba(255,255,255,0.095), rgba(255,255,255,0.035))",
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 16,
    minWidth: 0,
    width: "100%",
    overflow: "hidden",
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
    gridTemplateColumns: "minmax(112px, 34%) minmax(0, 1fr)",
    alignItems: "stretch",
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
    minHeight: 190,
    height: "100%",
    overflow: "hidden",
    borderRight: "1px solid rgba(255,255,255,0.08)",
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
    padding: 14,
    display: "grid",
    gap: 9,
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
    fontSize: "clamp(23px, 6.8vw, 32px)",
    lineHeight: 1,
    letterSpacing: "-0.055em",
    overflowWrap: "anywhere",
  },

  creatorRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: 850,
    lineHeight: 1.2,
  },

  creatorAvatar: {
    width: 24,
    height: 24,
    minWidth: 24,
    borderRadius: "50%",
    objectFit: "cover",
    display: "block",
    border: "1px solid rgba(255,255,255,0.24)",
  },

  creatorFallback: {
    width: 24,
    height: 24,
    minWidth: 24,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.16)",
    border: "1px solid rgba(228,239,22,0.24)",
    color: "#e4ef16",
    fontSize: 11,
    fontWeight: 950,
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
    padding: "0 14px 14px",
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
