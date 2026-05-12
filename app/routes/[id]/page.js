"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import { supabase } from "../../../lib/supabase";
import { getSportLabel } from "../../../lib/trainingHelpers";
import { getTrainingHeroImage } from "../../../lib/sportImages";
import { formatRoutePointSummary } from "../../../lib/gpxUtils";
import { makeSvgPolyline, getRoutePreviewStats, makeElevationPolyline, getElevationStats } from "../../../lib/routePreview";

function makeGoogleMapsSearch(title) {
  if (!title) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;
}

export default function RouteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [profile, setProfile] = useState(null);
  const [route, setRoute] = useState(null);
  const [linkedTrainings, setLinkedTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadRoute = async () => {
    if (!id) return;

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

      setProfile(profileRow);

      const { data: routeRow, error: routeError } = await supabase
        .from("routes")
        .select("id,creator_id,sport_id,title,description,visibility,distance_km,elevation_gain_m,gpx_file_url,route_points,created_at,updated_at")
        .eq("id", id)
        .maybeSingle();

      if (routeError) throw routeError;

      if (!routeRow) {
        setMessage("Route not found.");
        setRoute(null);
        return;
      }

      setRoute(routeRow);

      const { data: trainingRows, error: trainingError } = await supabase
        .from("training_sessions")
        .select("id,title,starts_at,flexible_date,planning_type,start_location,distance_km,visibility")
        .eq("route_id", id)
        .order("starts_at", { ascending: true, nullsFirst: false })
        .limit(20);

      if (trainingError) {
        console.warn("Linked trainings skipped", trainingError);
        setLinkedTrainings([]);
      } else {
        setLinkedTrainings(trainingRows || []);
      }
    } catch (err) {
      console.error("Route detail error", err);
      setMessage(err?.message || "Could not load route.");
      setRoute(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoute();
  }, [id]);

  const sportLabel = route ? getSportLabel(route.sport_id) : "";
  const hero = route ? getTrainingHeroImage(null, route.sport_id) : null;
  const mapsUrl = route ? makeGoogleMapsSearch(route.title) : null;
  const canEdit = Boolean(profile?.id && route?.creator_id === profile.id);

  const routePointStats = useMemo(() => getRoutePreviewStats(route?.route_points), [route?.route_points]);
  const routePointCount = routePointStats.pointCount;
  const previewPolyline = useMemo(() => makeSvgPolyline(route?.route_points, 320, 180, 18), [route?.route_points]);
  const elevationPolyline = useMemo(() => makeElevationPolyline(route?.route_points, 320, 90, 10), [route?.route_points]);
  const elevationStats = useMemo(() => getElevationStats(route?.route_points), [route?.route_points]);

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <Link href="/routes" style={styles.backLink}>
          ← Back to routes
        </Link>

        {loading ? (
          <section style={styles.stateCard}>
            <div style={styles.stateTitle}>Loading route...</div>
            <p style={styles.stateText}>Opening route details.</p>
          </section>
        ) : null}

        {message ? (
          <section style={styles.messageCard}>
            <div style={styles.stateTitle}>{message}</div>
            <button type="button" onClick={loadRoute} style={styles.primaryButton}>
              Try again
            </button>
          </section>
        ) : null}

        {!loading && route ? (
          <>
            <article style={styles.heroCard}>
              <div
                style={{
                  ...styles.heroImage,
                  ...(hero?.src
                    ? {
                        backgroundImage: `url("${hero.src}")`,
                        backgroundSize: "cover",
                        backgroundPosition: hero.position || "center center",
                      }
                    : {}),
                }}
              >
                <div style={styles.heroOverlay} />
              </div>

              <div style={styles.heroBody}>
                <div style={styles.topRow}>
                  <span style={styles.sportBadge}>{sportLabel}</span>
                  <span style={styles.visibilityBadge}>{route.visibility}</span>
                </div>

                <h1 style={styles.title}>{route.title}</h1>

                {route.description ? <p style={styles.description}>{route.description}</p> : null}

                <div style={styles.factGrid}>
                  <div style={styles.factCard}>
                    <span>Distance</span>
                    <strong>{route.distance_km ? `${route.distance_km} km` : "Not set"}</strong>
                  </div>
                  <div style={styles.factCard}>
                    <span>Elevation</span>
                    <strong>{route.elevation_gain_m ? `${route.elevation_gain_m} m` : "Not set"}</strong>
                  </div>
                  <div style={styles.factCard}>
                    <span>Route points</span>
                    <strong>{routePointCount || "None"}</strong>
                  </div>
                  <div style={styles.factCard}>
                    <span>GPX</span>
                    <strong>{route.gpx_file_url ? "Linked" : "Not linked"}</strong>
                  </div>
                </div>

                <div style={styles.actionRow}>
                  <button type="button" onClick={() => router.push(`/trainings/new`)} style={styles.primaryButton}>
                    Create training
                  </button>
                  {canEdit ? (
                    <button type="button" onClick={() => router.push(`/routes/${route.id}/edit`)} style={styles.secondaryButton}>
                      Edit route
                    </button>
                  ) : null}
                  <button type="button" onClick={() => router.push(`/routes/new?from=${route.id}`)} style={styles.secondaryButton}>
                    Duplicate route
                  </button>
                </div>
              </div>
            </article>

            <section style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <div style={styles.kicker}>Route preview</div>
                  <h2 style={styles.panelTitle}>Map-ready foundation</h2>
                </div>
              </div>

              <div style={styles.routePreview}>
                {previewPolyline ? (
                  <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet" style={styles.routeSvg}>
                    <polyline points={previewPolyline} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points={previewPolyline} fill="none" stroke="#e4ef16" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <>
                    <div style={styles.routeLine} />
                    <div style={styles.routeNodeStart} />
                    <div style={styles.routeNodeEnd} />
                  </>
                )}
              </div>

              <p style={styles.panelText}>
                {formatRoutePointSummary(route.route_points)}
                {routePointStats.hasElevation ? " · elevation data available" : ""}. Route point editing comes next.
              </p>
            </section>

            <section style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <div style={styles.kicker}>Elevation profile</div>
                  <h2 style={styles.panelTitle}>Climb and terrain</h2>
                </div>
              </div>

              {elevationPolyline ? (
                <>
                  <div style={styles.elevationChart}>
                    <svg viewBox="0 0 320 90" preserveAspectRatio="none" style={styles.elevationSvg}>
                      <polyline points={elevationPolyline} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points={elevationPolyline} fill="none" stroke="#e4ef16" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div style={styles.elevationStats}>
                    <span>Min {elevationStats.min} m</span>
                    <span>Max {elevationStats.max} m</span>
                    <span>Range {elevationStats.range} m</span>
                  </div>
                </>
              ) : (
                <p style={styles.panelText}>
                  No elevation data found in this GPX. Routes without elevation still work normally.
                </p>
              )}
            </section>

            <section style={styles.actionGrid}>
              {route.gpx_file_url ? (
                <a href={route.gpx_file_url} target="_blank" rel="noreferrer" style={styles.actionCard}>
                  <div style={styles.actionIcon}>GPX</div>
                  <div>
                    <strong>Open GPX</strong>
                    <span>View linked GPX file</span>
                  </div>
                </a>
              ) : (
                <div style={styles.actionCardMuted}>
                  <div style={styles.actionIcon}>GPX</div>
                  <div>
                    <strong>No GPX yet</strong>
                    <span>Upload support comes next</span>
                  </div>
                </div>
              )}

              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noreferrer" style={styles.actionCard}>
                  <div style={styles.actionIcon}>↗</div>
                  <div>
                    <strong>Search map</strong>
                    <span>Open route title in Maps</span>
                  </div>
                </a>
              ) : null}

              <button type="button" onClick={() => router.push("/routes/new")} style={styles.actionButton}>
                <div style={styles.actionIcon}>+</div>
                <div>
                  <strong>New route</strong>
                  <span>Create another route</span>
                </div>
              </button>
            </section>

            <section style={styles.panel}>
              <div style={styles.kicker}>Linked trainings</div>
              <h2 style={styles.panelTitle}>Used by sessions</h2>

              {linkedTrainings.length ? (
                <div style={styles.trainingList}>
                  {linkedTrainings.map((training) => (
                    <button
                      key={training.id}
                      type="button"
                      onClick={() => router.push(`/trainings/${training.id}`)}
                      style={styles.trainingItem}
                    >
                      <span>
                        <strong>{training.title}</strong>
                        <small>{training.start_location || "Location not set"}</small>
                      </span>
                      <span style={styles.trainingPill}>{training.visibility}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={styles.panelText}>No training sessions use this route yet.</p>
              )}
            </section>
          </>
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
    padding: "18px 16px 42px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
  },
  shell: { width: "100%", maxWidth: 960, margin: "0 auto", display: "grid", gap: 18, overflow: "hidden" },
  backLink: { width: "fit-content", color: "#e4ef16", textDecoration: "none", fontWeight: 950, border: "1px solid rgba(228,239,22,0.24)", borderRadius: 999, padding: "10px 14px", background: "rgba(228,239,22,0.08)" },
  stateCard: { borderRadius: 28, padding: 22, background: glass, border: "1px solid rgba(255,255,255,0.12)" },
  messageCard: { borderRadius: 28, padding: 22, background: "rgba(80,10,10,0.50)", border: "1px solid rgba(255,80,80,0.20)", display: "grid", gap: 14 },
  stateTitle: { fontSize: 24, fontWeight: 950 },
  stateText: { color: "rgba(255,255,255,0.70)", lineHeight: 1.45 },
  heroCard: { overflow: "hidden", borderRadius: 34, background: glass, border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 28px 80px rgba(0,0,0,0.34)" },
  heroImage: { position: "relative", height: 292, background: "radial-gradient(circle at 78% 18%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #151915, #060706)", backgroundRepeat: "no-repeat" },
  heroOverlay: { position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.66)), radial-gradient(circle at 82% 15%, rgba(228,239,22,0.12), transparent 36%)" },
  heroBody: { padding: 22, display: "grid", gap: 16 },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sportBadge: { display: "inline-flex", width: "fit-content", borderRadius: 999, padding: "8px 12px", background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.28)", color: "#e4ef16", fontWeight: 950 },
  visibilityBadge: { display: "inline-flex", width: "fit-content", borderRadius: 999, padding: "8px 12px", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.80)", textTransform: "capitalize", fontWeight: 900 },
  title: { margin: 0, fontSize: "clamp(34px, 8vw, 58px)", lineHeight: 0.96, letterSpacing: "-0.06em" },
  description: { margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.55 },
  factGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 },
  factCard: { borderRadius: 20, padding: 13, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 4 },
  actionRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  primaryButton: { ...baseButton, minHeight: 48, borderRadius: 999, background: "#e4ef16", color: "#101406", padding: "0 18px" },
  secondaryButton: { ...baseButton, minHeight: 48, borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "white", padding: "0 18px" },
  panel: { borderRadius: 30, padding: 20, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gap: 14 },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 },
  kicker: { color: "#e4ef16", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12, fontWeight: 950 },
  panelTitle: { margin: 0, fontSize: 26, letterSpacing: "-0.045em" },
  panelText: { margin: 0, color: "rgba(255,255,255,0.66)", lineHeight: 1.5 },
  routePreview: { position: "relative", minHeight: 170, borderRadius: 26, overflow: "hidden", background: "radial-gradient(circle at 82% 18%, rgba(228,239,22,0.14), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025))", border: "1px solid rgba(255,255,255,0.10)" },
  routeSvg: { position: "absolute", inset: 0, width: "100%", height: "100%", filter: "drop-shadow(0 12px 28px rgba(228,239,22,0.18))" },
  routeLine: { position: "absolute", left: "12%", right: "12%", top: "55%", height: 5, borderRadius: 999, background: "linear-gradient(90deg, rgba(228,239,22,0.95), rgba(255,255,255,0.35))", transform: "rotate(-8deg)" },
  routeNodeStart: { position: "absolute", left: "12%", top: "54%", width: 16, height: 16, borderRadius: 999, background: "#e4ef16", boxShadow: "0 0 24px rgba(228,239,22,0.55)" },
  routeNodeEnd: { position: "absolute", right: "12%", top: "45%", width: 16, height: 16, borderRadius: 999, background: "white", boxShadow: "0 0 24px rgba(255,255,255,0.35)" },
  elevationChart: { position: "relative", minHeight: 96, borderRadius: 22, overflow: "hidden", background: "linear-gradient(180deg, rgba(228,239,22,0.10), rgba(255,255,255,0.035))", border: "1px solid rgba(255,255,255,0.10)" },
  elevationSvg: { position: "absolute", inset: 0, width: "100%", height: "100%", padding: 8, boxSizing: "border-box", filter: "drop-shadow(0 10px 22px rgba(228,239,22,0.16))" },
  elevationStats: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, color: "rgba(255,255,255,0.72)", fontWeight: 850, fontSize: 13 },
  actionGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 },
  actionCard: { minHeight: 96, borderRadius: 24, padding: 14, textDecoration: "none", color: "white", background: glass, border: "1px solid rgba(255,255,255,0.12)", display: "grid", gap: 8 },
  actionCardMuted: { minHeight: 96, borderRadius: 24, padding: 14, color: "rgba(255,255,255,0.54)", background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 8 },
  actionButton: { ...baseButton, minHeight: 96, borderRadius: 24, padding: 14, textAlign: "left", color: "white", background: glass, border: "1px solid rgba(255,255,255,0.12)", display: "grid", gap: 8 },
  actionIcon: { color: "#e4ef16", fontWeight: 950 },
  trainingList: { display: "grid", gap: 10 },
  trainingItem: { border: 0, cursor: "pointer", textAlign: "left", borderRadius: 20, padding: 14, background: "rgba(255,255,255,0.055)", color: "white", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" },
  trainingPill: { borderRadius: 999, padding: "7px 10px", background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.78)", textTransform: "capitalize", fontWeight: 850 },
};
