"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";
import { getSportLabel } from "../../lib/trainingHelpers";
import { getTrainingHeroImage } from "../../lib/sportImages";

export default function RoutesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [preferredSportIds, setPreferredSportIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const loadRoutes = async () => {
    setMessage("");
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
        setRoutes([]);
        setMessage("Your account is blocked. Contact an administrator.");
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

      const { data, error } = await supabase
        .from("routes")
        .select("id,creator_id,sport_id,title,description,visibility,distance_km,elevation_gain_m,gpx_file_url,created_at,updated_at")
        .or(`visibility.eq.public,creator_id.eq.${user.id}`)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) throw error;

      const filtered = profileRow?.role === "admin" || profileRow?.role === "moderator"
        ? data || []
        : (data || []).filter((route) => allowedSports.includes(route.sport_id) || route.creator_id === user.id);

      setRoutes(filtered);
    } catch (err) {
      console.error("Routes load error", err);
      setMessage(err?.message || "Could not load routes.");
      setRoutes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRoutes();
  }, []);

  const routeSportsCount = useMemo(() => {
    return new Set(routes.map((route) => route.sport_id).filter(Boolean)).size;
  }, [routes]);

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Routes</div>
          <div style={styles.titleRow}>
            <h1 style={styles.title}>Build better routes.</h1>
            <button type="button" onClick={() => router.push("/routes/new")} style={styles.createButton}>
              + Route
            </button>
          </div>
          <p style={styles.subtitle}>
            Save GPX routes and prepare them for future training sessions. Sport-specific route generation comes next.
          </p>

          <div style={styles.actionRow}>
            <button type="button" onClick={loadRoutes} disabled={refreshing} style={styles.refreshButton}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" onClick={() => router.push("/trainings")} style={styles.secondaryButton}>
              Training sessions
            </button>
          </div>
        </header>

        <section style={styles.statsGrid}>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Routes</span>
            <strong style={styles.statValue}>{loading ? "…" : routes.length}</strong>
            <span style={styles.statHint}>available</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Sports</span>
            <strong style={styles.statValue}>{loading ? "…" : routeSportsCount}</strong>
            <span style={styles.statHint}>with routes</span>
          </div>
        </section>

        {message ? <section style={styles.message}>{message}</section> : null}

        {loading ? (
          <section style={styles.emptyCard}>
            <h2>Loading routes...</h2>
            <p>Fetching saved routes from Endurance.</p>
          </section>
        ) : null}

        {!loading && !message && routes.length === 0 ? (
          <section style={styles.emptyCard}>
            <h2>No routes yet.</h2>
            <p>
              Create your first route placeholder now. Later this will connect to the route wizard, GPX upload and sport-aware routing.
            </p>
            <button type="button" onClick={() => router.push("/routes/new")} style={styles.primaryButton}>
              Create first route
            </button>
          </section>
        ) : null}

        {!loading && routes.length > 0 ? (
          <section style={styles.grid}>
            {routes.map((route) => {
              const image = getTrainingHeroImage(null, route.sport_id);
              const sportLabel = getSportLabel(route.sport_id);

              return (
                <article
                  key={route.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/routes/${route.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/routes/${route.id}`);
                    }
                  }}
                  style={styles.routeCard}
                >
                  <div
                    style={{
                      ...styles.routeImage,
                      ...(image?.src
                        ? {
                            backgroundImage: `url("${image.src}")`,
                            backgroundSize: "cover",
                            backgroundPosition: image.position || "center center",
                          }
                        : {}),
                    }}
                  >
                    <div style={styles.routeOverlay} />
                  </div>

                  <div style={styles.routeBody}>
                    <div style={styles.cardTop}>
                      <span style={styles.sportBadge}>{sportLabel}</span>
                      <span style={styles.visibilityBadge}>{route.visibility}</span>
                    </div>

                    <h2 style={styles.cardTitle}>{route.title}</h2>
                    {route.description ? <p style={styles.cardText}>{route.description}</p> : null}

                    <div style={styles.routeFacts}>
                      <span>↗ {route.distance_km ? `${route.distance_km} km` : "Distance not set"}</span>
                      <span>⛰ {route.elevation_gain_m ? `${route.elevation_gain_m} m` : "Elevation not set"}</span>
                      <span>{route.gpx_file_url ? "GPX linked" : "No GPX yet"}</span>
                    </div>

                    <div style={styles.cardActions}>
                      <button
                        type="button"
                        style={styles.openButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/routes/${route.id}`);
                        }}
                      >
                        Open route →
                      </button>
                      <button
                        type="button"
                        style={styles.templateButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/routes/new?from=${route.id}`);
                        }}
                      >
                        Duplicate
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

const baseButton = { border: 0, cursor: "pointer", fontWeight: 950 };
const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 18px 42px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: { width: "min(960px, 100%)", margin: "0 auto", display: "grid", gap: 20 },
  header: { display: "grid", gap: 10 },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  titleRow: { display: "flex", justifyContent: "space-between", alignItems: "end", gap: 14, flexWrap: "wrap" },
  title: { margin: 0, fontSize: "clamp(38px, 10vw, 66px)", lineHeight: 0.96, letterSpacing: "-0.065em" },
  subtitle: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.5, maxWidth: 620 },
  actionRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 },
  createButton: { ...baseButton, minHeight: 48, borderRadius: 999, background: "#e4ef16", color: "#101406", padding: "0 18px", boxShadow: "0 18px 38px rgba(228,239,22,0.16)" },
  refreshButton: { minHeight: 42, borderRadius: 999, border: "1px solid rgba(228,239,22,0.28)", background: "rgba(228,239,22,0.08)", color: "#e4ef16", fontWeight: 950, padding: "0 16px", cursor: "pointer" },
  secondaryButton: { minHeight: 42, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "white", fontWeight: 950, padding: "0 16px", cursor: "pointer" },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  statCard: { minHeight: 112, borderRadius: 26, padding: 16, boxSizing: "border-box", background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", alignContent: "space-between" },
  statLabel: { color: "rgba(255,255,255,0.54)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em" },
  statValue: { fontSize: 42, letterSpacing: "-0.06em", lineHeight: 0.95 },
  statHint: { color: "rgba(255,255,255,0.62)", fontSize: 13, fontWeight: 800 },
  message: { borderRadius: 24, padding: 18, background: "rgba(80,10,10,0.50)", border: "1px solid rgba(255,80,80,0.20)", color: "rgba(255,255,255,0.82)" },
  emptyCard: { borderRadius: 30, padding: 24, background: glass, border: "1px solid rgba(255,255,255,0.13)" },
  primaryButton: { ...baseButton, minHeight: 48, borderRadius: 999, background: "#e4ef16", color: "#101406", padding: "0 18px" },
  grid: { display: "grid", gap: 16 },
  routeCard: { overflow: "hidden", borderRadius: 32, background: glass, border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 24px 70px rgba(0,0,0,0.30)" },
  routeImage: { position: "relative", height: 190, background: "radial-gradient(circle at 78% 18%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #151915, #060706)", backgroundRepeat: "no-repeat" },
  routeOverlay: { position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.62))" },
  routeBody: { padding: 20, display: "grid", gap: 14 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sportBadge: { display: "inline-flex", borderRadius: 999, padding: "8px 12px", background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.28)", color: "#e4ef16", fontWeight: 950 },
  visibilityBadge: { display: "inline-flex", borderRadius: 999, padding: "8px 12px", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.80)", textTransform: "capitalize", fontWeight: 900 },
  cardTitle: { margin: 0, fontSize: 30, letterSpacing: "-0.055em", lineHeight: 1 },
  cardText: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.45 },
  routeFacts: { display: "grid", gap: 7, color: "rgba(255,255,255,0.68)", fontWeight: 750 },
  cardActions: { display: "flex", gap: 10, flexWrap: "wrap" },
  openButton: { ...baseButton, justifySelf: "start", minHeight: 44, borderRadius: 999, background: "#e4ef16", color: "#101406", padding: "0 16px" },
  templateButton: { ...baseButton, justifySelf: "start", minHeight: 44, borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "white", padding: "0 16px" },
};
