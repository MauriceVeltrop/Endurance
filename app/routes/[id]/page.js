// app/routes/[id]/page.js
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import BottomNav from "../../../components/BottomNav";
import OSMRouteMap from "../../../components/OSMRouteMap";
import RouteElevationProfile from "../../../components/routes/RouteElevationProfile";
import { calculateRouteMetrics } from "../../../lib/routeMetrics";
import { supabase } from "../../../lib/supabase";
import { getSportLabel } from "../../../lib/trainingHelpers";
import {
  getRoutePoints,
  getRoutePreviewStats,
  getElevationStats,
} from "../../../lib/routePreview";

function displayName(profile) {
  return profile?.name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Endurance athlete";
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function distanceText(route) {
  return route?.distance_km ? `${Number(route.distance_km).toFixed(1).replace(".0", "")} km` : "—";
}

function elevationGainText(route) {
  return route?.elevation_gain_m ? `${route.elevation_gain_m} m` : "—";
}

function estimateDuration(route) {
  const distance = Number(route?.distance_km || 0);
  const sport = String(route?.sport_id || "");

  if (!distance) return "—";

  if (sport.includes("cycling") || sport.includes("gravel") || sport.includes("mountain")) {
    const hours = distance / (sport.includes("road") ? 26 : sport.includes("mountain") ? 13 : 20);
    const minutes = Math.max(10, Math.round(hours * 60));
    return `${minutes} min`;
  }

  if (sport.includes("walking")) {
    return `${Math.max(10, Math.round(distance * 12))} min`;
  }

  return `${Math.max(10, Math.round(distance * 6.5))} min`;
}

function routeArea(route) {
  const text = `${route?.title || ""} ${route?.description || ""}`.toLowerCase();
  if (text.includes("landgraaf")) return "Landgraaf";
  if (text.includes("heerlen")) return "Heerlen";
  if (text.includes("brunssum")) return "Brunssum";
  if (text.includes("eifel")) return "Eifel";
  return "Saved route";
}

function canEditRoute(route, profile) {
  if (!route || !profile) return false;
  return route.creator_id === profile.id || profile.role === "admin" || profile.role === "moderator";
}

function makeRouteStartLocation(route) {
  const points = getRoutePoints(route?.route_points);
  const first = points?.[0];
  if (first?.lat && first?.lon) return `${Number(first.lat).toFixed(5)}, ${Number(first.lon).toFixed(5)}`;
  return routeArea(route);
}

function routePointsToGpx(route) {
  const points = getRoutePoints(route?.route_points);
  const name = route?.title || "Endurance route";

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Endurance" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(name)}</name></metadata>
  <trk><name>${escapeXml(name)}</name><trkseg>
${points
  .map((point) => `    <trkpt lat="${point.lat}" lon="${point.lon}">${Number.isFinite(Number(point.ele)) ? `<ele>${Number(point.ele).toFixed(1)}</ele>` : ""}</trkpt>`)
  .join("\n")}
  </trkseg></trk>
</gpx>`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadTextFile(filename, text, type = "application/gpx+xml") {
  if (typeof window === "undefined") return;

  const blob = new Blob([text], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 400);
}

function makeDistanceSyncedRouteTitle(route, distanceKm) {
  const distance = Number(distanceKm || 0);
  if (!Number.isFinite(distance) || distance <= 0) return route?.title || "";

  const distanceText = `${distance.toFixed(1).replace(".0", "")} km`;
  const currentTitle = String(route?.title || "").trim();
  const sportLabel = getSportLabel(route?.sport_id);

  if (/\d+(?:[.,]\d+)?\s*km/i.test(currentTitle)) {
    return currentTitle.replace(/\d+(?:[.,]\d+)?\s*km/i, distanceText);
  }

  const locationPart = currentTitle
    .replace(new RegExp(`\\s*-?\\s*${sportLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "")
    .trim();

  return `${locationPart || routeArea(route)} - ${distanceText} - ${sportLabel}`;
}

export default function RouteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [profile, setProfile] = useState(null);
  const [route, setRoute] = useState(null);
  const [creator, setCreator] = useState(null);
  const [linkedTrainings, setLinkedTrainings] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadRoute() {
    if (!id) return;

    setLoading(true);
    setMessage("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,first_name,last_name,email,avatar_url,role,onboarding_completed,blocked")
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
        setRoute(null);
        setMessage("Route not found.");
        return;
      }

      const allowed =
        routeRow.visibility === "public" ||
        routeRow.creator_id === user.id ||
        profileRow?.role === "admin" ||
        profileRow?.role === "moderator";

      if (!allowed) {
        setRoute(null);
        setMessage("You do not have access to this route yet.");
        return;
      }

      setRoute(routeRow);

      const [{ data: creatorRow }, { data: trainingRows }, { count: notificationCount }, { count: inviteCount }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id,name,first_name,last_name,avatar_url")
            .eq("id", routeRow.creator_id)
            .maybeSingle(),
          supabase
            .from("training_sessions")
            .select("id,title,starts_at,final_starts_at,planning_type,visibility")
            .eq("route_id", routeRow.id)
            .order("starts_at", { ascending: false, nullsFirst: false })
            .limit(6),
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .is("read_at", null),
          supabase
            .from("training_invites")
            .select("id", { count: "exact", head: true })
            .eq("invitee_id", user.id)
            .eq("status", "pending"),
        ]);

      setCreator(creatorRow || null);
      setLinkedTrainings(trainingRows || []);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    } catch (err) {
      console.error("Route detail error", err);
      setMessage(err?.message || "Could not load route.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoute();
  }, [id]);

  const points = useMemo(() => getRoutePoints(route?.route_points), [route?.route_points]);
  const pointStats = useMemo(() => getRoutePreviewStats(route?.route_points), [route?.route_points]);
  const elevationStats = useMemo(() => getElevationStats(route?.route_points), [route?.route_points]);
  const sportLabel = getSportLabel(route?.sport_id);
  const editable = canEditRoute(route, profile);

  function createTrainingFromRoute() {
    if (!route) return;
    router.push(`/trainings/new?route_id=${route.id}`);
  }

  function downloadRouteGpx() {
    if (!route) return;

    if (route.gpx_file_url) {
      window.open(route.gpx_file_url, "_blank", "noopener,noreferrer");
      return;
    }

    const safeName = String(route.title || "endurance-route").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "endurance-route";
    downloadTextFile(`${safeName}.gpx`, routePointsToGpx(route));
  }

  async function saveRoutePointChanges(nextPoints, nextControlPoints = null) {
    if (!route || !editable) return;

    try {
      setBusy(true);
      setMessage("");

      const safePoints = getRoutePoints(nextPoints);
      const safeControlPoints = getRoutePoints(nextControlPoints).length >= 2
        ? getRoutePoints(nextControlPoints)
        : getRoutePoints(route.route_points?.control_points || route.route_points?.waypoints);

      const nextRoutePoints = {
        ...(route.route_points && typeof route.route_points === "object" && !Array.isArray(route.route_points) ? route.route_points : {}),
        source: route.route_points?.source || "editable-osm-map",
        points: safePoints,
        waypoints: safeControlPoints,
        control_points: safeControlPoints,
        point_count: safePoints.length,
        control_point_count: safeControlPoints.length,
        edited_at: new Date().toISOString(),
      };

      const metrics = calculateRouteMetrics(safePoints);

      const nextDistanceKm = metrics.distance_km || route.distance_km || null;
      const payload = {
        title: makeDistanceSyncedRouteTitle(route, nextDistanceKm),
        route_points: nextRoutePoints,
        distance_km: nextDistanceKm,
        elevation_gain_m: metrics.elevation_gain_m || route.elevation_gain_m || 0,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("routes")
        .update(payload)
        .eq("id", route.id)
        .select("id,creator_id,sport_id,title,description,visibility,distance_km,elevation_gain_m,gpx_file_url,route_points,created_at,updated_at")
        .maybeSingle();

      if (error) throw error;

      setRoute(data || { ...route, ...payload });
      setMessage("Route updated.");
    } catch (error) {
      console.error("Could not update route points", error);
      setMessage(error?.message || "Could not update route.");
      throw error;
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="endurance-page">
        <AppHeader active="routes" />
        <section className="endurance-shell endurance-card notification-empty">
          Loading route...
        </section>
        <BottomNav unreadCount={unreadCount} />
      </main>
    );
  }

  if (!route) {
    return (
      <main className="endurance-page">
        <AppHeader active="routes" />
        <section className="endurance-shell endurance-card notification-empty">
          <h2>Route unavailable</h2>
          <p>{message || "This route could not be loaded."}</p>
          <Link href="/routes" className="primary-action">Back to routes</Link>
        </section>
        <BottomNav unreadCount={unreadCount} />
      </main>
    );
  }

  return (
    <main className="endurance-page route-detail-page">
      <AppHeader active="routes" />

      <section className="endurance-shell route-detail-hero endurance-card">
        <div className="route-detail-hero-copy">
          <div className="route-detail-badges">
            <span className="sport-badge">{sportLabel}</span>
            <span className="status-badge">{route.visibility}</span>
            <span className="status-badge">{pointStats.qualityLabel || "Route"}</span>
          </div>

          <h1>{route.title}</h1>

          <p>
            {route.description ||
              "A saved Endurance route. Open the map, inspect the elevation and plan a training with your team."}
          </p>

          <div className="route-detail-creator">
            <span className="route-detail-avatar">
              {creator?.avatar_url ? <img src={creator.avatar_url} alt="" /> : displayName(creator).slice(0, 1)}
            </span>
            <span>
              <b>{displayName(creator)}</b>
              <small>Created {formatDate(route.created_at)}</small>
            </span>
          </div>
        </div>

        <div className="route-detail-hero-stats">
          <div>
            <span>Distance</span>
            <strong>{distanceText(route)}</strong>
          </div>
          <div>
            <span>Elevation</span>
            <strong>{elevationStats.available ? `${elevationStats.gain} m` : elevationGainText(route)}</strong>
          </div>

        </div>
      </section>

      {message ? <section className="endurance-shell route-detail-message">{message}</section> : null}

      <section className="endurance-shell route-detail-action-bar">
        <button type="button" className="route-detail-primary" onClick={createTrainingFromRoute}>
          Plan training with this route
        </button>
        <button type="button" className="route-detail-secondary" onClick={downloadRouteGpx}>Download GPX</button>
        {editable ? (
          <button type="button" className="route-detail-secondary" onClick={() => router.push(`/routes/${route.id}/edit`)}>
            Edit details
          </button>
        ) : null}
      </section>

      <section className="endurance-shell route-map-panel route-map-panel-premium endurance-card">
        <div className="route-section-title">
          <div>
            <p className="eyebrow">Interactive map</p>
            <h2>Route on OpenStreetMap</h2>
          </div>
          <span>{points.length ? `${points.length} route points` : "No route points"}</span>
        </div>

        <OSMRouteMap
          routePoints={route.route_points}
          title={route.title}
          height={460}
          interactive
          showLegend
          showFullscreen
          showLayerControl
          defaultLayer="osm"
          sportId={route.sport_id}
          editable={editable}
          saving={busy}
          onSaveRoutePoints={saveRoutePointChanges}
          className="route-detail-map"
        />
      </section>

      <section className="endurance-shell route-detail-grid">
        <article className="route-detail-panel endurance-card">
          <div className="route-section-title">
            <div>
              <p className="eyebrow">Route stats</p>
              <h2>Performance profile</h2>
            </div>
          </div>

          <div className="route-stats-grid">
            <div><span>Sport</span><strong>{sportLabel}</strong></div>
            <div><span>Distance</span><strong>{distanceText(route)}</strong></div>
            <div><span>Elevation gain</span><strong>{elevationGainText(route)}</strong></div>

            <div><span>Control points</span><strong>{pointStats.controlPointCount || "—"}</strong></div>
            <div><span>Geometry points</span><strong>{pointStats.pointCount || 0}</strong></div>
            <div><span>Point density</span><strong>{pointStats.pointDensity ? `${pointStats.pointDensity}/km` : "—"}</strong></div>
            <div><span>Elevation data</span><strong>{pointStats.hasElevation ? `${elevationStats.sampleCount} samples` : "No"}</strong></div>
          </div>
        </article>

        <article className="route-detail-panel endurance-card">
          <div className="route-section-title">
            <div>
              <p className="eyebrow">Metadata</p>
              <h2>Route quality</h2>
            </div>
          </div>

          <div className="route-metadata-list">
            <span><b>Surface intelligence</b><small>Prepared for sport-specific scoring.</small></span>
            <span><b>Route architecture</b><small>{pointStats.controlPointCount ? "Control points + geometry" : "Geometry only"}</small></span>
            <span><b>Route source</b><small>{route.gpx_file_url ? "GPX imported" : "Manual / saved points"}</small></span>
            <span><b>Visibility</b><small>{route.visibility}</small></span>
            <span><b>Updated</b><small>{formatDate(route.updated_at || route.created_at)}</small></span>
          </div>
        </article>
      </section>

      <section className="endurance-shell route-elevation-panel endurance-card">
        <div className="route-section-title">
          <div>
            <p className="eyebrow">Elevation profile</p>
            <h2>Climbs & terrain</h2>
          </div>
          {elevationStats.available ? <span>{elevationStats.gain} m up / {elevationStats.loss} m down</span> : null}
        </div>

        <RouteElevationProfile routePoints={route.route_points} />
      </section>

      <section className="endurance-shell route-linked-trainings endurance-card">
        <div className="route-section-title">
          <div>
            <p className="eyebrow">Training usage</p>
            <h2>Sessions with this route</h2>
          </div>
        </div>

        {linkedTrainings.length ? (
          <div className="route-linked-list">
            {linkedTrainings.map((training) => (
              <Link href={`/trainings/${training.id}`} key={training.id}>
                <strong>{training.title}</strong>
                <span>{formatDate(training.final_starts_at || training.starts_at) || training.planning_type}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="route-detail-muted">No training session uses this route yet. Start one now and invite your team.</p>
        )}
      </section>

      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
