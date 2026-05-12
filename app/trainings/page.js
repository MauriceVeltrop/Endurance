"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";
import {
  formatTrainingIntensity,
  formatTrainingTime,
  getPrimarySport,
  getSportLabel,
} from "../../lib/trainingHelpers";
import { getTrainingImage } from "../../lib/sportImages";

const privilegedRoles = ["admin", "moderator"];

export default function TrainingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [preferredSportIds, setPreferredSportIds] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");

  const canSeeAll = privilegedRoles.includes(profile?.role);

  const loadTrainings = async () => {
    setErrorText("");
    setRefreshing(true);

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
        .select("id,title,description,sports,visibility,planning_type,starts_at,flexible_date,flexible_start_time,flexible_end_time,final_starts_at,start_location,distance_km,estimated_duration_min,intensity_label,pace_min,pace_max,speed_min,speed_max,max_participants,teaser_photo_url,created_at")
        .or(`starts_at.gte.${now},starts_at.is.null`)
        .order("starts_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) throw error;

      const shouldSeeAll = privilegedRoles.includes(profileRow?.role);
      const filtered = shouldSeeAll
        ? data || []
        : (data || []).filter((training) =>
            Array.isArray(training.sports) &&
            training.sports.some((sportId) => allowedSports.includes(sportId))
          );

      setTrainings(filtered.slice(0, 30));
    } catch (err) {
      console.error(err);
      setErrorText(err?.message || "Could not load training sessions.");
      setTrainings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTrainings();
  }, []);

  const nextTraining = trainings[0];
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
            <button type="button" onClick={() => router.push("/trainings/new")} style={styles.createButton}>
              + Create
            </button>
          </div>

          <p style={styles.subtitle}>Swipe through upcoming sessions that match your preferred sports.</p>

          <div style={styles.actionRow}>
            <button type="button" onClick={loadTrainings} disabled={refreshing} style={styles.refreshButton}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>

        <section style={styles.dashboardGrid} aria-label="Training dashboard">
          <div style={styles.dashboardCard}>
            <span style={styles.dashboardLabel}>Matching</span>
            <strong style={styles.dashboardValue}>{loading ? "—" : trainings.length}</strong>
            <span style={styles.dashboardHint}>sessions</span>
          </div>
          <div style={styles.dashboardCard}>
            <span style={styles.dashboardLabel}>Sports</span>
            <strong style={styles.dashboardValue}>{canSeeAll ? "All" : preferredSportIds.length || "—"}</strong>
            <span style={styles.dashboardHint}>preferred</span>
          </div>
          <div style={styles.dashboardCardWide}>
            <span style={styles.dashboardLabel}>Next up</span>
            <strong style={styles.dashboardValueSmall}>{nextTraining?.title || "Create momentum"}</strong>
            <span style={styles.dashboardHint}>{nextTrainingLabel}</span>
          </div>
        </section>

        {loading ? (
          <section style={styles.stateCard}>
            <div style={styles.stateTitle}>Loading trainings...</div>
            <p style={styles.stateText}>Fetching your profile, preferred sports and upcoming sessions.</p>
          </section>
        ) : null}

        {errorText ? (
          <section style={styles.errorCard}>
            <div style={styles.stateTitle}>Could not load trainings</div>
            <p style={styles.stateText}>{errorText}</p>
            <button type="button" onClick={loadTrainings} style={styles.retryButton}>Try again</button>
          </section>
        ) : null}

        {empty ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyIcon}>⚡</div>
            <div style={styles.stateTitle}>{preferredSportIds.length ? "No matching trainings yet" : "Choose your preferred sports"}</div>
            <p style={styles.stateText}>
              {preferredSportIds.length
                ? "Create a new session or broaden your preferred sports in your profile."
                : "Your feed is filtered by preferred sports. Add sports to your profile first."}
            </p>
            <div style={styles.emptyActions}>
              <button type="button" onClick={() => router.push("/trainings/new")} style={styles.primaryButton}>
                Create training
              </button>
              <button type="button" onClick={() => router.push("/profile")} style={styles.secondaryButton}>
                Edit profile
              </button>
            </div>
          </section>
        ) : null}

        {!loading && !errorText && trainings.length > 0 ? (
          <section style={styles.carousel}>
            {trainings.map((training) => {
              const sportLabel = getSportLabel(getPrimarySport(training));
              const trainingImage = getTrainingImage(training);
              const time = formatTrainingTime(training);
              const intensity = formatTrainingIntensity(training);

              return (
                <article
                  key={training.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/trainings/${training.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/trainings/${training.id}`);
                    }
                  }}
                  style={styles.card}
                >
                  <div style={styles.teaserWrap}>
                    <img src={trainingImage} alt="" style={styles.teaser} />
                    <div style={styles.teaserShade} />
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
                      <p style={styles.meta}>⚡ {intensity}</p>
                    </div>

                    <div style={styles.cardFooter}>
                      <span style={styles.joined}>
                        {training.max_participants ? `Max ${training.max_participants}` : "Open session"}
                      </span>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/trainings/${training.id}`);
                        }}
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
    background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 18px 42px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: { width: "min(960px, 100%)", margin: "0 auto", display: "grid", gap: 22 },
  header: { display: "grid", gap: 10 },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  titleRow: { display: "flex", justifyContent: "space-between", alignItems: "end", gap: 14, flexWrap: "wrap" },
  title: { margin: 0, fontSize: "clamp(38px, 10vw, 66px)", lineHeight: 0.96, letterSpacing: "-0.065em" },
  subtitle: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.5, maxWidth: 520 },
  actionRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 6 },
  dashboardGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 2 },
  dashboardCard: { minHeight: 104, borderRadius: 26, padding: 16, boxSizing: "border-box", background: "linear-gradient(145deg, rgba(255,255,255,0.11), rgba(255,255,255,0.045))", border: "1px solid rgba(255,255,255,0.13)", boxShadow: "0 18px 46px rgba(0,0,0,0.22)", display: "grid", alignContent: "space-between" },
  dashboardCardWide: { gridColumn: "1 / -1", minHeight: 104, borderRadius: 26, padding: 16, boxSizing: "border-box", background: "radial-gradient(circle at 90% 18%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.11), rgba(255,255,255,0.045))", border: "1px solid rgba(255,255,255,0.13)", boxShadow: "0 18px 46px rgba(0,0,0,0.22)", display: "grid", gap: 5 },
  dashboardLabel: { color: "rgba(255,255,255,0.54)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em" },
  dashboardValue: { fontSize: 36, letterSpacing: "-0.06em", lineHeight: 0.95 },
  dashboardValueSmall: { fontSize: 23, letterSpacing: "-0.045em", lineHeight: 1.05 },
  dashboardHint: { color: "rgba(255,255,255,0.62)", fontSize: 13, fontWeight: 800 },
  createButton: { ...baseButton, minHeight: 48, borderRadius: 999, background: "#e4ef16", color: "#101406", padding: "0 18px", boxShadow: "0 18px 38px rgba(228,239,22,0.16)" },
  refreshButton: { minHeight: 42, borderRadius: 999, border: "1px solid rgba(228,239,22,0.28)", background: "rgba(228,239,22,0.08)", color: "#e4ef16", fontWeight: 950, padding: "0 16px", cursor: "pointer" },
  carousel: { display: "flex", gap: 16, overflowX: "auto", padding: "4px 2px 18px", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" },
  card: { minWidth: 306, maxWidth: 306, minHeight: 300, borderRadius: 32, boxSizing: "border-box", color: "white", background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 24px 70px rgba(0,0,0,0.30)", scrollSnapAlign: "start", display: "grid", overflow: "hidden", cursor: "pointer", userSelect: "none" },
  teaserWrap: { position: "relative", height: 132, overflow: "hidden", borderBottom: "1px solid rgba(255,255,255,0.08)" },
  teaser: { width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0.96, transform: "scale(1.01)" },
  teaserShade: { position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.34))" },
  cardContent: { padding: 22, display: "grid", alignContent: "space-between", gap: 20 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sportBadge: { display: "inline-flex", width: "fit-content", borderRadius: 999, padding: "8px 12px", background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.28)", color: "#e4ef16", fontWeight: 950, fontSize: 13 },
  visibilityBadge: { borderRadius: 999, padding: "8px 10px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 12, textTransform: "capitalize" },
  cardTitle: { margin: "18px 0 10px", fontSize: 29, lineHeight: 1.02, letterSpacing: "-0.045em" },
  meta: { margin: "8px 0", color: "rgba(255,255,255,0.70)", fontSize: 15, lineHeight: 1.35 },
  cardFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  joined: { color: "rgba(255,255,255,0.70)", fontWeight: 800, fontSize: 14 },
  openButton: { ...baseButton, color: "#101406", background: "#e4ef16", borderRadius: 999, padding: "10px 13px", fontSize: 13 },
  stateCard: { borderRadius: 28, padding: 22, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" },
  emptyCard: { borderRadius: 32, padding: 28, background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 24px 70px rgba(0,0,0,0.30)" },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, display: "grid", placeItems: "center", background: "rgba(228,239,22,0.14)", border: "1px solid rgba(228,239,22,0.25)", marginBottom: 16, fontSize: 24 },
  emptyActions: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 },
  errorCard: { borderRadius: 28, padding: 22, background: "rgba(140,20,20,0.18)", border: "1px solid rgba(255,90,90,0.22)" },
  stateTitle: { fontSize: 22, fontWeight: 950 },
  stateText: { color: "rgba(255,255,255,0.70)", lineHeight: 1.5, marginBottom: 0 },
  retryButton: { ...baseButton, minHeight: 42, borderRadius: 999, background: "#e4ef16", color: "#101406", padding: "0 16px", marginTop: 12 },
  primaryButton: { ...baseButton, minHeight: 54, borderRadius: 20, background: "#e4ef16", color: "#101406", padding: "0 18px", boxShadow: "0 18px 38px rgba(228,239,22,0.16)" },
  secondaryButton: { ...baseButton, minHeight: 54, borderRadius: 20, background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.12)", padding: "0 18px" },
};
