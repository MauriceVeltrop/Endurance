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


async function getAcceptedTeamPartnerIds(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("training_partners")
    .select("requester_id,addressee_id,status")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq("status", "accepted");

  if (error || !Array.isArray(data)) {
    console.warn("Could not load accepted team partners", error);
    return [];
  }

  return Array.from(
    new Set(
      data
        .map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id))
        .filter(Boolean)
    )
  );
}

function canViewTeamItem(item, userId, teamPartnerIds = [], profile = null) {
  if (!item || !userId) return false;

  if (item.creator_id === userId) return true;
  if (item.visibility === "public") return true;
  if (profile?.role === "admin" || profile?.role === "moderator") return true;

  if (item.visibility === "team") {
    return teamPartnerIds.includes(item.creator_id);
  }

  return false;
}

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

function coordinateLabel(point) {
  if (!point?.lat || !point?.lon) return "";
  return `${Number(point.lat).toFixed(5)}, ${Number(point.lon).toFixed(5)}`;
}


function mapsSearchUrl(label, fallbackPoint) {
  const text = String(label || "").trim();
  const fallback = coordinateLabel(fallbackPoint);
  const query = text || fallback;
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function isCoordinateOnlyLabel(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(text);
}

function cleanHumanLocationLabel(value) {
  const text = String(value || "").trim();
  if (!text || isCoordinateOnlyLabel(text)) return "";

  return text
    .replace(/,?\s*(Nederland|Netherlands)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pickReverseLocationLabel(data) {
  const raw = data?.label || data?.name || data?.place || data?.city || data?.town || data?.village || data?.municipality || data?.locality || data?.county || "";
  return cleanHumanLocationLabel(raw);
}

async function reverseGeocodeRoutePoint(point) {
  if (!point?.lat || !point?.lon) return "";

  try {
    const params = new URLSearchParams({
      lat: String(point.lat),
      lon: String(point.lon),
    });

    const response = await fetch(`/api/geocode/reverse?${params.toString()}`);
    if (!response.ok) return "";

    const data = await response.json();
    return pickReverseLocationLabel(data);
  } catch (error) {
    console.warn("Could not reverse geocode route point", error);
    return "";
  }
}

function getRouteLocationLabels(route) {
  const points = getRoutePoints(route?.route_points);
  const first = points?.[0];
  const last = points?.[points.length - 1];
  const meta = route?.route_points && typeof route.route_points === "object" && !Array.isArray(route.route_points)
    ? route.route_points
    : {};

  const startStored = cleanHumanLocationLabel(meta.start_location_label || meta.start_address || meta.start_location);
  const finishStored = cleanHumanLocationLabel(meta.finish_location_label || meta.finish_address || meta.finish_location);

  return {
    start: startStored || coordinateLabel(first) || routeArea(route),
    finish: finishStored || coordinateLabel(last) || routeArea(route),
  };
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

function formatAutoRouteDistance(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance) || distance <= 0) return "0.0 km";
  return `${distance.toFixed(1)} km`;
}

function buildAutoRouteTitle({ place, distanceKm, sportId }) {
  const safePlace = String(place || "").trim() || "Locatie bepalen";
  return `${safePlace} - ${formatAutoRouteDistance(distanceKm)} - ${getSportLabel(sportId || "running")}`;
}

function makeDistanceSyncedRouteTitle(route, distanceKm) {
  if (route?.title_is_auto === false) return route?.title || "";

  const startLocation =
    cleanHumanLocationLabel(route?.route_points?.start_location_label) ||
    cleanHumanLocationLabel(route?.route_points?.start_location) ||
    routeArea(route);

  return buildAutoRouteTitle({
    place: startLocation,
    distanceKm,
    sportId: route?.sport_id,
  });
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
  const [locationDraft, setLocationDraft] = useState({ start: "", finish: "" });
  const [locationSaving, setLocationSaving] = useState(false);
  const [routeSettingsDraft, setRouteSettingsDraft] = useState({ title: "", visibility: "team" });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [deletingRoute, setDeletingRoute] = useState(false);

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
        .select("id,creator_id,sport_id,title,title_is_auto,description,visibility,distance_km,elevation_gain_m,gpx_file_url,route_points,created_at,updated_at")
        .eq("id", id)
        .maybeSingle();

      if (routeError) throw routeError;

      if (!routeRow) {
        setRoute(null);
        setMessage("Route not found.");
        return;
      }

      const teamPartnerIds = await getAcceptedTeamPartnerIds(user.id);
      const allowed = canViewTeamItem(routeRow, user.id, teamPartnerIds, profileRow);

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

  useEffect(() => {
    if (!route) return;
    setRouteSettingsDraft({
      title: route.title || "",
      visibility: route.visibility || "team",
    });
  }, [route?.id, route?.title, route?.visibility]);

  useEffect(() => {
    if (!route) return;

    let cancelled = false;

    async function hydrateRouteLocationLabels() {
      const labels = getRouteLocationLabels(route);
      const routePoints = getRoutePoints(route?.route_points);
      const first = routePoints?.[0];
      const last = routePoints?.[routePoints.length - 1];

      const [resolvedStart, resolvedFinish] = await Promise.all([
        isCoordinateOnlyLabel(labels.start) ? reverseGeocodeRoutePoint(first) : Promise.resolve(""),
        isCoordinateOnlyLabel(labels.finish) ? reverseGeocodeRoutePoint(last) : Promise.resolve(""),
      ]);

      if (cancelled) return;

      setLocationDraft({
        start: resolvedStart || labels.start,
        finish: resolvedFinish || labels.finish,
      });
    }

    hydrateRouteLocationLabels();

    return () => {
      cancelled = true;
    };
  }, [route?.id, route?.route_points]);

  const points = useMemo(() => getRoutePoints(route?.route_points), [route?.route_points]);
  const startPoint = points?.[0];
  const finishPoint = points?.[points.length - 1];
  const startMapsUrl = mapsSearchUrl(locationDraft.start, startPoint);
  const finishMapsUrl = mapsSearchUrl(locationDraft.finish, finishPoint);
  const pointStats = useMemo(() => getRoutePreviewStats(route?.route_points), [route?.route_points]);
  const elevationStats = useMemo(() => getElevationStats(route?.route_points), [route?.route_points]);
  const sportLabel = getSportLabel(route?.sport_id);
  const editable = canEditRoute(route, profile);

  async function saveRouteLocationLabels() {
    if (!route || !editable) return;

    try {
      setLocationSaving(true);
      setMessage("");

      const currentRoutePoints =
        route.route_points && typeof route.route_points === "object" && !Array.isArray(route.route_points)
          ? route.route_points
          : { points: getRoutePoints(route.route_points) };

      const nextRoutePoints = {
        ...currentRoutePoints,
        start_location_label: String(locationDraft.start || "").trim(),
        finish_location_label: String(locationDraft.finish || "").trim(),
        location_labels_updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("routes")
        .update({
          route_points: nextRoutePoints,
          updated_at: new Date().toISOString(),
        })
        .eq("id", route.id)
        .select("id,creator_id,sport_id,title,title_is_auto,description,visibility,distance_km,elevation_gain_m,gpx_file_url,route_points,created_at,updated_at")
        .maybeSingle();

      if (error) throw error;

      setRoute(data || { ...route, route_points: nextRoutePoints });
      setMessage("Start and finish location updated. The route geometry was not changed.");
    } catch (error) {
      console.error("Could not update route locations", error);
      setMessage(error?.message || "Could not update route locations.");
    } finally {
      setLocationSaving(false);
    }
  }

  async function saveRouteSettings() {
    if (!route || !editable) return;

    const nextTitle = String(routeSettingsDraft.title || "").trim();
    const nextVisibility = String(routeSettingsDraft.visibility || "team");

    if (!nextTitle) {
      setMessage("Route name is required.");
      return;
    }

    try {
      setSettingsSaving(true);
      setMessage("");

      const titleChanged = nextTitle !== String(route.title || "").trim();
      const payload = {
        title: nextTitle,
        title_is_auto: titleChanged ? false : route.title_is_auto !== false,
        visibility: nextVisibility,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("routes")
        .update(payload)
        .eq("id", route.id)
        .select("id,creator_id,sport_id,title,title_is_auto,description,visibility,distance_km,elevation_gain_m,gpx_file_url,route_points,created_at,updated_at")
        .maybeSingle();

      if (error) throw error;

      setRoute(data || { ...route, ...payload });
      setMessage("Route settings updated.");
    } catch (error) {
      console.error("Could not update route settings", error);
      setMessage(error?.message || "Could not update route settings.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function deleteCurrentRoute() {
    if (!route || !editable || deletingRoute) return;

    const confirmed = window.confirm(
      "Delete this route? Linked training sessions will keep existing, but the route will be detached."
    );

    if (!confirmed) return;

    try {
      setDeletingRoute(true);
      setMessage("");

      const { error: detachError } = await supabase
        .from("training_sessions")
        .update({ route_id: null, updated_at: new Date().toISOString() })
        .eq("route_id", route.id);

      if (detachError) throw detachError;

      const { error: deleteError } = await supabase
        .from("routes")
        .delete()
        .eq("id", route.id);

      if (deleteError) throw deleteError;

      router.replace("/routes");
    } catch (error) {
      console.error("Could not delete route", error);
      setMessage(error?.message || "Could not delete route.");
      setDeletingRoute(false);
    }
  }

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

  function openRouteDrawEditor() {
    if (!route || !editable) return;

    try {
      const routePoints =
        route.route_points && typeof route.route_points === "object"
          ? route.route_points
          : { points: getRoutePoints(route.route_points) };

      const points = getRoutePoints(routePoints);
      const controlPoints = getRoutePoints(
        routePoints.control_points || routePoints.waypoints || routePoints.controlPoints
      );

      window.sessionStorage.setItem(
        "endurance_route_edit_draft",
        JSON.stringify({
          edit_route_id: route.id,
          return_to: `/routes/${route.id}`,
          sport_id: route.sport_id,
          title: route.title,
          title_is_auto: route.title_is_auto !== false,
          description: route.description || "",
          visibility: route.visibility,
          distance_km: route.distance_km || "",
          elevation_gain_m: route.elevation_gain_m || "",
          route_points: {
            ...(routePoints && typeof routePoints === "object" && !Array.isArray(routePoints) ? routePoints : {}),
            points,
            waypoints: controlPoints.length >= 2 ? controlPoints : routePoints.waypoints,
            control_points: controlPoints.length >= 2 ? controlPoints : routePoints.control_points,
            point_count: points.length,
          },
          saved_at: new Date().toISOString(),
        })
      );

      router.push(`/routes/draw?editDraft=1&routeId=${route.id}&returnTo=${encodeURIComponent(`/routes/${route.id}`)}`);
    } catch (error) {
      console.error("Could not open route draw editor", error);
      setMessage("Could not open the route editor.");
    }
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
        .select("id,creator_id,sport_id,title,title_is_auto,description,visibility,distance_km,elevation_gain_m,gpx_file_url,route_points,created_at,updated_at")
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

      <section className="endurance-shell route-detail-916-shell">
        <article className="route-detail-916-hero">
          <div className="route-detail-916-map-frame">
            <OSMRouteMap
              routePoints={route.route_points}
              title={route.title}
              height="100%"
              interactive={false}
              showLegend={false}
              showFullscreen
              showLayerControl={false}
              defaultLayer="osm"
              sportId={route.sport_id}
              editable={false}
              saving={busy}
              onSaveRoutePoints={null}
              fullscreenLabel={editable ? "Edit route" : "Fullscreen"}
              onFullscreenClick={editable ? openRouteDrawEditor : null}
              className="route-detail-916-map"
            />
          </div>

          <div className="route-detail-916-gradient" />

          <div className="route-detail-916-topbar">
            <Link href="/routes" className="route-detail-916-round-button" aria-label="Back to routes">←</Link>
            </div>

          <div className="route-detail-916-content">
            <div className="route-detail-badges">
              <span className="sport-badge">{sportLabel}</span>
              <span className="status-badge">{route.visibility}</span>
              <span className="status-badge">{pointStats.qualityLabel || "Route"}</span>
            </div>

            <h1>{route.title}</h1>
<div className="route-detail-creator route-detail-916-creator">
              <span className="route-detail-avatar">
                {creator?.avatar_url ? <img src={creator.avatar_url} alt="" /> : displayName(creator).slice(0, 1)}
              </span>
              <span>
                <b>{displayName(creator)}</b>
                <small>Created {formatDate(route.created_at)}</small>
              </span>
            </div>

            <p>
              {route.description ||
                "A saved Endurance route. Open the map, inspect the elevation and plan a training with your team."}
            </p>

            <div className="route-detail-916-actions">
              <button type="button" className="route-detail-916-primary" onClick={createTrainingFromRoute}>
                Plan training with this route
              </button>
              <button type="button" className="route-detail-916-secondary" onClick={downloadRouteGpx}>
                ⇩ Download GPX
              </button>
              {editable ? (
                <button type="button" className="route-detail-916-secondary" onClick={() => router.push(`/routes/${route.id}/edit`)}>
                  ✓ Saved
                </button>
              ) : null}
            </div>
          </div>
        </article>
      </section>

      {message ? <section className="endurance-shell route-detail-message">{message}</section> : null}

      <section className="endurance-shell route-detail-grid route-detail-grid-single">
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
            <div><span>Visibility</span><strong>{route.visibility}</strong></div>
          </div>

          {editable ? (
            <div className="route-settings-editor">
              <label className="route-settings-field">
                <span>Route name</span>
                <input
                  type="text"
                  value={routeSettingsDraft.title}
                  onChange={(event) => setRouteSettingsDraft((current) => ({ ...current, title: event.target.value }))}
                  disabled={settingsSaving || deletingRoute}
                  placeholder="Route name"
                />
              </label>

              <label className="route-settings-field">
                <span>Visibility</span>
                <select
                  value={routeSettingsDraft.visibility}
                  onChange={(event) => setRouteSettingsDraft((current) => ({ ...current, visibility: event.target.value }))}
                  disabled={settingsSaving || deletingRoute}
                >
                  <option value="private">Private · Only you</option>
                  <option value="team">Team · Training partners</option>
                  <option value="selected">Selected · Invited athletes</option>
                  <option value="group">Group</option>
                  <option value="public">Public · Community</option>
                </select>
              </label>

              <div className="route-settings-actions">
                <button
                  type="button"
                  className="route-location-save-button"
                  onClick={saveRouteSettings}
                  disabled={settingsSaving || deletingRoute}
                >
                  {settingsSaving ? "Saving..." : "Save route details"}
                </button>
                <button
                  type="button"
                  className="route-delete-button"
                  onClick={deleteCurrentRoute}
                  disabled={settingsSaving || deletingRoute}
                >
                  {deletingRoute ? "Deleting..." : "Delete route"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="route-location-editor">
            <label className="route-location-field">
              <span>Start location</span>
              <textarea
                rows={2}
                value={locationDraft.start}
                onChange={(event) => setLocationDraft((current) => ({ ...current, start: event.target.value }))}
                disabled={!editable || locationSaving}
                placeholder="Start location"
              />
              {startMapsUrl ? (
                <a className="route-location-map-link" href={startMapsUrl} target="_blank" rel="noreferrer">
                  Open start in Maps ↗
                </a>
              ) : null}
            </label>

            <label className="route-location-field">
              <span>Finish location</span>
              <textarea
                rows={2}
                value={locationDraft.finish}
                onChange={(event) => setLocationDraft((current) => ({ ...current, finish: event.target.value }))}
                disabled={!editable || locationSaving}
                placeholder="Finish location"
              />
              {finishMapsUrl ? (
                <a className="route-location-map-link" href={finishMapsUrl} target="_blank" rel="noreferrer">
                  Open finish in Maps ↗
                </a>
              ) : null}
            </label>

            {editable ? (
              <button
                type="button"
                className="route-location-save-button"
                onClick={saveRouteLocationLabels}
                disabled={locationSaving}
              >
                {locationSaving ? "Saving..." : "Save locations"}
              </button>
            ) : null}
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
