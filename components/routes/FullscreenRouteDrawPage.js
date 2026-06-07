// components/routes/FullscreenRouteDrawPage.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RouteDrawMap from "./RouteDrawMap";
import { supabase } from "../../lib/supabase";
import { getSportLabel } from "../../lib/trainingHelpers";
import { calculateRouteMetrics, estimateTimeText, normalizeRoutePoints, simplifyRoutePoints } from "../../lib/routeMetrics";

function makeRoutePointPayload(points, source = "draw-fullscreen") {
  const normalized = normalizeRoutePoints(points);
  const metrics = calculateRouteMetrics(normalized);

  return {
    source,
    points: normalized,
    point_count: normalized.length,
    distance_km: metrics.distance_km || null,
    elevation_gain_m: metrics.elevation_gain_m || 0,
    elevation_loss_m: metrics.elevation_loss_m || 0,
    max_elevation_m: metrics.max_elevation_m || null,
    drawn_at: new Date().toISOString(),
  };
}

function defaultTitle(sportId) {
  return `${getSportLabel(sportId || "running")} Route`;
}

function pickPlaceNameFromLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean).filter((part) => !/^(netherlands|nederland)$/i.test(part));
  const postalCodeIndex = parts.findIndex((part) => /\b\d{4}\s?[A-Z]{2}\b/i.test(part));
  if (postalCodeIndex >= 0 && parts[postalCodeIndex + 1]) return parts[postalCodeIndex + 1];
  const likelyPlace = parts.find((part) => !/^(street|road|route|unnamed|current location|startlocatie)$/i.test(part) && !/\d/.test(part));
  return likelyPlace || parts[0] || "";
}

function cleanRouteLocationName(value) {
  const place = pickPlaceNameFromLabel(value);

  if (!place || /^(locatie bepalen|startlocatie|current location)$/i.test(place)) {
    return "";
  }

  return place;
}

function formatRouteDistanceLabel(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance) || distance <= 0) return "0.0 km";
  return `${distance.toFixed(1)} km`;
}

function buildAutomaticRouteTitle({ startLocation, distanceKm, sportId }) {
  const location = cleanRouteLocationName(startLocation) || "Locatie bepalen";

  return `${location} - ${formatRouteDistanceLabel(distanceKm)} - ${getSportLabel(sportId || "running")}`;
}


async function resolvePlaceNameFromCoordinates({ lat, lon }) {
  const safeLat = Number(lat);
  const safeLon = Number(lon);

  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLon)) return "";

  try {
    const response = await fetch(`/api/geocode/reverse?lat=${encodeURIComponent(safeLat)}&lon=${encodeURIComponent(safeLon)}`);

    if (!response.ok) return "";

    const data = await response.json();

    return cleanRouteLocationName(
      data?.place ||
      data?.city ||
      data?.town ||
      data?.village ||
      data?.municipality ||
      data?.locality ||
      data?.county ||
      data?.label ||
      data?.display_name ||
      ""
    );
  } catch (error) {
    console.warn("Could not resolve route start location", error);
    return "";
  }
}



function compactRoutePoints(points, maxPoints = 900) {
  const normalized = normalizeRoutePoints(points);
  const simplified = simplifyRoutePoints(normalized, normalized.length > 350 ? 6 : 2.5);

  if (simplified.length <= maxPoints) return simplified;

  const step = Math.ceil(simplified.length / maxPoints);
  const compacted = simplified.filter((_, index) => index % step === 0);
  const last = simplified[simplified.length - 1];

  if (last && compacted[compacted.length - 1] !== last) {
    compacted.push(last);
  }

  return compacted;
}

function compactControlPoints(points) {
  return normalizeRoutePoints(points).slice(0, 80);
}

function buildSafeDraftRoutePayload(payload, fallbackPoints) {
  const payloadPoints = normalizeRoutePoints(payload);
  const fallback = normalizeRoutePoints(fallbackPoints);
  const points = compactRoutePoints(payloadPoints.length ? payloadPoints : fallback);

  return {
    source: payload?.source || "draw-fullscreen",
    profile: payload?.profile || null,
    provider_url: payload?.provider_url || null,
    waypoints: Array.isArray(payload?.waypoints) ? compactRoutePoints(payload.waypoints, 80) : [],
    points,
    point_count: points.length,
    distance_km: payload?.distance_km || null,
    elevation_gain_m: payload?.elevation_gain_m || 0,
    route_quality: payload?.route_quality || null,
    routed_at: payload?.routed_at || payload?.drawn_at || payload?.edited_at || new Date().toISOString(),
  };
}

function nearestGeometryIndex(target, geometry) {
  const points = normalizeRoutePoints(geometry);
  const needle = normalizeRoutePoints([target])[0];

  if (!needle || !points.length) return -1;

  let bestIndex = -1;
  let bestDistance = Infinity;

  points.forEach((point, index) => {
    const distance = Math.hypot(Number(point.lat) - Number(needle.lat), Number(point.lon) - Number(needle.lon));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function mergeLocalSegmentGeometry(existingGeometry, previousControlPoints, nextControlPoints, insertAt, segmentGeometry) {
  const existing = normalizeRoutePoints(existingGeometry);
  const previous = normalizeRoutePoints(previousControlPoints);
  const next = normalizeRoutePoints(nextControlPoints);
  const segment = normalizeRoutePoints(segmentGeometry);

  if (!next.length) return [];

  const safeInsertAt = Math.max(1, Math.min(Number(insertAt) || next.length - 1, next.length - 1));
  const previousPoint = previous[safeInsertAt - 1] || next[safeInsertAt - 1];
  const nextPoint = previous[safeInsertAt] || next[safeInsertAt + 1];
  const promotedPoint = next[safeInsertAt];
  const replacement = segment.length >= 2
    ? segment
    : [previousPoint, promotedPoint, nextPoint].filter(Boolean);

  if (existing.length < 2 || !previousPoint || !nextPoint) {
    return next;
  }

  let startIndex = nearestGeometryIndex(previousPoint, existing);
  let endIndex = nearestGeometryIndex(nextPoint, existing);

  if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) {
    return next;
  }

  if (startIndex > endIndex) {
    [startIndex, endIndex] = [endIndex, startIndex];
  }

  const before = existing.slice(0, startIndex);
  const after = existing.slice(endIndex + 1);
  const merged = [...before, ...replacement, ...after];

  return compactRoutePoints(merged, 900);
}

function routePayloadFromGeometry(points, waypoints, source = "local-segment-reroute") {
  const geometry = compactRoutePoints(points);
  const metrics = calculateRouteMetrics(geometry);

  return {
    source,
    points: geometry,
    waypoints: compactControlPoints(waypoints),
    control_points: compactControlPoints(waypoints),
    geometry_points: geometry,
    point_count: geometry.length,
    distance_km: metrics.distance_km || null,
    elevation_gain_m: metrics.elevation_gain_m || 0,
    elevation_loss_m: metrics.elevation_loss_m || 0,
    edited_at: new Date().toISOString(),
  };
}


function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function routePointsToGpx(points, name = "Endurance Route") {
  const normalized = normalizeRoutePoints(points);
  const trackPoints = normalized
    .map((point) => {
      const ele = Number.isFinite(Number(point.ele)) ? `\n        <ele>${Number(point.ele).toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${Number(point.lat).toFixed(6)}" lon="${Number(point.lon).toFixed(6)}">${ele}\n      </trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Endurance" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata>\n    <name>${xmlEscape(name)}</name>\n    <time>${new Date().toISOString()}</time>\n  </metadata>\n  <trk>\n    <name>${xmlEscape(name)}</name>\n    <trkseg>\n${trackPoints}\n    </trkseg>\n  </trk>\n</gpx>`;
}

function downloadTextFile({ filename, text, type = "application/gpx+xml" }) {
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

function makeRouteDraft({ sportId, title, method = "draw", profileId, metrics, routePayload }) {
  return {
    sport_id: sportId,
    title: title?.trim() || defaultTitle(sportId),
    description: "",
    method,
    distance_km: metrics.distance_km || routePayload.distance_km || "",
    elevation_gain_m: metrics.elevation_gain_m || routePayload.elevation_gain_m || "",
    estimated_time: estimateTimeText(metrics.distance_km || routePayload.distance_km, sportId),
    route_points: routePayload,
    created_by: profileId || null,
    saved_at: new Date().toISOString(),
  };
}


const MAP_STYLE_OPTIONS = [
  { id: "standard", name: "Standard", provider: "OpenStreetMap", description: "Clear everyday map with streets and parks.", icon: "🗺️" },
  { id: "minimal", name: "Minimal", provider: "Carto Positron", description: "Clean light map for running and city routes.", icon: "◻️" },
  { id: "outdoor", name: "Outdoor", provider: "OpenTopoMap", description: "Terrain, paths and contours for trail and hiking.", icon: "⛰️" },
  { id: "cycling", name: "Cycling", provider: "CyclOSM", description: "Cycle-friendly map with cycling infrastructure.", icon: "🚴" },
  { id: "satellite", name: "Satellite", provider: "Esri World Imagery", description: "Aerial view for forests, fields and landmarks.", icon: "🛰️" },
  { id: "dark", name: "Dark", provider: "Carto Dark Matter", description: "Low-glare dark map for evening planning.", icon: "🌙" },
];

function defaultMapStyleForSport() {
  return "standard";
}

function safeReadEditDraft() {
  try {
    if (typeof window === "undefined") return null;

    const params = new URLSearchParams(window.location.search);
    if (params.get("editDraft") !== "1") return null;

    const raw = window.sessionStorage.getItem("endurance_route_edit_draft");
    if (!raw) return null;

    const draft = JSON.parse(raw);
    const points = normalizeRoutePoints(draft?.route_points);

    if (!points.length) return null;

    return {
      ...draft,
      route_points: {
        ...(draft.route_points && typeof draft.route_points === "object" && !Array.isArray(draft.route_points) ? draft.route_points : {}),
        points,
        point_count: points.length,
      },
    };
  } catch (error) {
    console.error("Could not load route edit draft", error);
    return null;
  }
}


function ElevationMiniStrip({ points = [] }) {
  const normalized = normalizeRoutePoints(points);
  const elevationPoints = normalized.filter((point) => Number.isFinite(Number(point.ele)));

  if (normalized.length < 2) return null;

  const values = elevationPoints.length >= 2
    ? normalized.map((point) => Number.isFinite(Number(point.ele)) ? Number(point.ele) : null)
    : normalized.map((_, index) => Math.sin((index / Math.max(1, normalized.length - 1)) * Math.PI) * 0.25 + 0.5);

  const numericValues = values.filter((value) => Number.isFinite(Number(value)));
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = Math.max(1, max - min);
  const width = 220;
  const height = 38;

  const path = values
    .map((value, index) => {
      const safe = Number.isFinite(Number(value)) ? Number(value) : min;
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - 5 - ((safe - min) / range) * (height - 10);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <section className="route-draw-elevation-mini" aria-label="Elevation preview">
      <span>Elevation</span>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={`${path} L ${width} ${height} L 0 ${height} Z`} className="fill" />
        <path d={path} className="line" />
      </svg>
    </section>
  );
}

function metersToPercentMap(summary = {}) {
  const entries = Object.entries(summary || {}).map(([label, meters]) => [label, Number(meters || 0)]);
  const total = entries.reduce((sum, [, meters]) => sum + meters, 0);

  if (!total) return [];

  return entries
    .filter(([, meters]) => meters > 0)
    .map(([label, meters]) => ({ label, meters, percent: Math.round((meters / total) * 100) }))
    .sort((a, b) => b.meters - a.meters);
}

function getRouteQuality(payload = {}, sportId = "") {
  const quality = payload?.route_quality;
  if (!quality) return null;

  const surfaceQuality = quality.surface_quality || {};
  const pavedRatio = Number(surfaceQuality.ideal_ratio || 0) + Number(surfaceQuality.acceptable_ratio || 0);
  const unsuitableRatio = Number(surfaceQuality.avoid_ratio || 0);
  const unknownRatio = Number(surfaceQuality.unknown_ratio || 0);
  const score = Number.isFinite(Number(quality.suitability_score))
    ? Math.max(0, Math.min(100, Math.round(Number(quality.suitability_score))))
    : Math.max(0, Math.min(100, Math.round((pavedRatio * 88) + ((1 - unsuitableRatio) * 12))));

  const warnings = [];
  const key = String(sportId || quality.sport_id || "").toLowerCase();

  if (["running", "road_cycling", "roadcycling"].includes(key) && unsuitableRatio >= 0.18) {
    warnings.push("Contains a lot of unpaved surface for this sport.");
  }

  if (["trail_running", "trailrunning", "mountain_biking", "mtb", "gravel", "gravel_cycling"].includes(key) && pavedRatio >= 0.75) {
    warnings.push("This route is quite paved for the selected sport.");
  }

  if (unknownRatio >= 0.35) {
    warnings.push("A large part of the surface is unknown in OSM/ORS data.");
  }

  return {
    score,
    pavedPercent: Math.round(pavedRatio * 100),
    unsuitablePercent: Math.round(unsuitableRatio * 100),
    unknownPercent: Math.round(unknownRatio * 100),
    detourFactor: Number(quality.detour_factor || 1),
    candidates: Number(quality.candidates_considered || 0),
    surfaces: metersToPercentMap(quality.surfaces).slice(0, 4),
    waytypes: metersToPercentMap(quality.waytypes).slice(0, 4),
    warnings,
  };
}

function humanizeRouteLabel(value = "") {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\w/g, (char) => char.toUpperCase());
}

function RouteQualityPanel({ payload, sportId, onClose }) {
  const quality = getRouteQuality(payload, sportId);

  if (!quality) return null;

  return (
    <section className="route-quality-panel-expanded" aria-label="Route quality">
      <div className="route-quality-panel-header">
        <span>◎</span>
        <strong>Route quality</strong>
        <b>{quality.score}/100</b>
        <button type="button" onClick={onClose} aria-label="Close route quality">×</button>
      </div>

      <div className="route-quality-grid">
        <div><span>Paved / suitable</span><b>{quality.pavedPercent}%</b></div>
        <div><span>Unsuitable</span><b>{quality.unsuitablePercent}%</b></div>
        <div><span>Unknown</span><b>{quality.unknownPercent}%</b></div>
        <div><span>Detour</span><b>{quality.detourFactor.toFixed(2)}×</b></div>
      </div>

      {quality.warnings.length ? (
        <div className="route-quality-warning">{quality.warnings[0]}</div>
      ) : (
        <div className="route-quality-ok">Looks suitable for {getSportLabel(sportId || "running")}.</div>
      )}

      <div className="route-quality-breakdown">
        <div>
          <small>Surface</small>
          {quality.surfaces.length ? quality.surfaces.map((item) => (
            <p key={`surface-${item.label}`}><span>{humanizeRouteLabel(item.label)}</span><b>{item.percent}%</b></p>
          )) : <p><span>Unknown</span><b>—</b></p>}
        </div>
        <div>
          <small>Waytype</small>
          {quality.waytypes.length ? quality.waytypes.map((item) => (
            <p key={`waytype-${item.label}`}><span>{humanizeRouteLabel(item.label)}</span><b>{item.percent}%</b></p>
          )) : <p><span>Unknown</span><b>—</b></p>}
        </div>
      </div>
    </section>
  );
}


export default function FullscreenRouteDrawPage() {
  const router = useRouter();
  const loadedDraftRef = useRef(false);
  const currentLocationRequestedRef = useRef(false);
  const draftSavedMessageTimerRef = useRef(null);
  const routeStartLookupRef = useRef("");
  const routingAbortRef = useRef(null);
  const routingRequestIdRef = useRef(0);

  const [profile, setProfile] = useState(null);
  const [sportId, setSportId] = useState("");
  const [title, setTitle] = useState("Draw Route");
  const [pointsPayload, setPointsPayload] = useState(null);
  const [drawInsertMode, setDrawInsertMode] = useState(false);
  const [drawLayer, setDrawLayer] = useState("standard");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(true);
  const [showPointPanel, setShowPointPanel] = useState(false);
  const [showElevationPanel, setShowElevationPanel] = useState(false);
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [routedPayload, setRoutedPayload] = useState(null);
  const [routingStatus, setRoutingStatus] = useState("idle");
  const [routingError, setRoutingError] = useState("");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [routeStartLocation, setRouteStartLocation] = useState("Locatie bepalen");
  const [titleEditedManually, setTitleEditedManually] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [targetLocation, setTargetLocation] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const controlPoints = useMemo(() => normalizeRoutePoints(pointsPayload), [pointsPayload]);
  const routedPoints = useMemo(() => normalizeRoutePoints(routedPayload), [routedPayload]);
  const points = controlPoints;
  const activeRoutePayload = routedPayload || pointsPayload;
  const routeQuality = useMemo(() => getRouteQuality(routedPayload || activeRoutePayload, sportId), [routedPayload, activeRoutePayload, sportId]);
  const metrics = useMemo(() => calculateRouteMetrics(activeRoutePayload), [activeRoutePayload]);
  const canContinue = points.length >= 2;
  const routeSignature = useMemo(
    () => points.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`).join("|"),
    [points]
  );

  // route-start-location-reverse-lookup
  useEffect(() => {
    const firstPoint = points[0] || routedPoints[0];

    if (!firstPoint) {
      routeStartLookupRef.current = "";
      if (!titleEditedManually) {
        setRouteStartLocation("Locatie bepalen");
      }
      return;
    }

    const lat = Number(firstPoint.lat);
    const lon = Number(firstPoint.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;

    if (routeStartLookupRef.current === key) return;

    routeStartLookupRef.current = key;

    let cancelled = false;

    resolvePlaceNameFromCoordinates({ lat, lon }).then((placeName) => {
      if (cancelled) return;

      if (placeName) {
        setRouteStartLocation(placeName);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [points, routedPoints, titleEditedManually]);

  useEffect(() => {
    async function bootstrap() {
      setChecking(true);

      try {
        const params = new URLSearchParams(window.location.search);
        const editDraft = safeReadEditDraft();
        const initialSport = params.get("sport_id") || editDraft?.sport_id;

        if (!initialSport) {
          router.replace("/routes/new");
          return;
        }

        setSportId(initialSport);
        setDrawLayer((current) => current || defaultMapStyleForSport(initialSport));
        if (!editDraft?.route_points?.points?.length) {
          setDrawLayer(defaultMapStyleForSport(initialSport));
        }
        setTitle(editDraft?.title || defaultTitle(initialSport));

        if (editDraft?.route_points?.points?.length) {
          loadedDraftRef.current = true;
          const geometry = normalizeRoutePoints(editDraft.route_points.points);
          const savedWaypoints = normalizeRoutePoints(editDraft.route_points.waypoints);
          const editableControlPoints = savedWaypoints.length >= 2
            ? savedWaypoints
            : geometry.length >= 2
              ? [geometry[0], geometry[geometry.length - 1]]
              : geometry;

          setPointsPayload(makeRoutePointPayload(editableControlPoints, "draw-edit-control-points"));
          setRoutedPayload({
            ...editDraft.route_points,
            points: geometry,
            waypoints: editableControlPoints,
            point_count: geometry.length,
          });
          setMessage("");
          window.sessionStorage.removeItem("endurance_route_edit_draft");
        }

        const { data } = await supabase.auth.getUser();
        const user = data?.user;

        if (!user?.id) {
          router.replace("/login");
          return;
        }

        const { data: profileRow, error } = await supabase
          .from("profiles")
          .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (!profileRow?.onboarding_completed) {
          router.replace("/onboarding");
          return;
        }

        if (profileRow?.blocked) {
          setMessage("Your account is blocked. Contact an administrator.");
          return;
        }

        setProfile(profileRow);
      } catch (error) {
        console.error("Draw route bootstrap error", error);
        setMessage(error?.message || "Could not open draw editor.");
      } finally {
        setChecking(false);
      }
    }

    bootstrap();
  }, [router]);


  useEffect(() => {
    if (checking || !sportId) return;
    if (currentLocationRequestedRef.current) return;

    currentLocationRequestedRef.current = true;

    const shouldFocusCurrentLocation = !loadedDraftRef.current && points.length === 0 && routedPoints.length === 0;
    requestCurrentLocation({ focus: shouldFocusCurrentLocation, quiet: true });
  }, [checking, sportId, points.length, routedPoints.length]);

  function requestCurrentLocation({ focus = true, quiet = false, allowRouteFocus = false } = {}) {
    if (!navigator.geolocation) {
      if (!quiet) setMessage("Geolocation is not available on this device.");
      return;
    }

    if (!quiet) setMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: Number(position.coords.latitude.toFixed(6)),
          lon: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy || 35),
          label: "Current location",
        };

        setCurrentLocation(location);

        const hasRoute = points.length >= 2 || routedPoints.length >= 2;
        const mayFocus = focus && (!loadedDraftRef.current || allowRouteFocus) && (!hasRoute || allowRouteFocus);

        if (mayFocus) {
          setTargetLocation({
            ...location,
            selectedAt: Date.now(),
            zoom: 15,
          });
        }

        if (!quiet) {
          setMessage("");
        }
      },
      () => {
        if (!quiet) setMessage("Could not access current location. You can still search or draw manually.");
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  }

  async function rerouteLocalSegment({ previousControlPoints, nextControlPoints, insertAt }) {
    const previous = normalizeRoutePoints(previousControlPoints);
    const next = compactControlPoints(nextControlPoints);
    const safeInsertAt = Math.max(1, Math.min(Number(insertAt) || next.length - 1, next.length - 1));

    const segmentControlPoints = [
      next[safeInsertAt - 1],
      next[safeInsertAt],
      next[safeInsertAt + 1],
    ].filter(Boolean);

    if (segmentControlPoints.length < 2) return;

    try {
      setRoutingStatus("routing");

      const response = await fetch("/api/routes/reroute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sport_id: sportId,
          points: segmentControlPoints,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Local rerouting failed.");
      }

      const routed = data.route_points || data;
      const segmentGeometry = normalizeRoutePoints(routed?.points?.length ? routed.points : routed);

      if (segmentGeometry.length < 2) {
        throw new Error("No local segment geometry returned.");
      }

      const baseGeometry = routedPoints.length ? routedPoints : previous;
      const mergedGeometry = mergeLocalSegmentGeometry(
        baseGeometry,
        previous,
        next,
        safeInsertAt,
        segmentGeometry
      );

      setRoutedPayload({
        ...routePayloadFromGeometry(mergedGeometry, next, data?.routed === false ? "manual-local-segment" : "local-segment-reroute"),
        profile: routed?.profile || null,
        provider_url: routed?.provider_url || null,
        route_quality: routed?.route_quality || data?.route_quality || null,
        routed_at: new Date().toISOString(),
      });
      setRoutingStatus("done");
      setRoutingError("");
      if (data?.routed === false) {
        setMessage(data?.warning || "No snapped path found. Using the drawn line.");
      }
    } catch (error) {
      console.error("Local segment rerouting failed", error);
      setRoutingStatus("error");
      setRoutingError(error?.message || "Local rerouting failed.");
      setMessage(error?.message || "Could not snap this segment to roads/paths.");
    }
  }

  function handlePointsChange(nextPoints, meta = {}) {
    const previousControlPoints = points;
    const safeControlPoints = compactControlPoints(nextPoints);
    loadedDraftRef.current = false;
    setPointsPayload(makeRoutePointPayload(safeControlPoints));
    setRoutingStatus("idle");
    setRoutingError("");

    if (safeControlPoints.length < 2) {
      setRoutedPayload(null);
      return;
    }

    // Keep the last routed geometry visible while the debounced route request runs.
    // Professional routebuilders avoid clearing the route on every tiny edit because
    // that makes snapping feel slow and jumpy on mobile.
    setRoutingStatus("routing");
  }

  function undoPoint() {
    handlePointsChange(points.slice(0, -1));
  }

  function clearRoute() {
    setPointsPayload(null);
    setRoutedPayload(null);
    setRoutingStatus("idle");
    setRoutingError("");
    setDrawInsertMode(false);
    setMessage("");
    setShowPointPanel(false);
  }

  function removePoint(indexToRemove) {
    handlePointsChange(points.filter((_, index) => index !== indexToRemove));
  }

  function closeLoop() {
    if (points.length < 3) {
      setMessage("Add at least three points before closing the loop.");
      return;
    }

    const first = points[0];
    const last = points[points.length - 1];

    if (first.lat === last.lat && first.lon === last.lon) {
      setMessage("This route is already closed.");
      return;
    }

    handlePointsChange([...points, { ...first }]);
  }

  function useCurrentLocation() {
    if (currentLocation?.lat && currentLocation?.lon) {
      setTargetLocation({
        ...currentLocation,
        label: "Current location",
        selectedAt: Date.now(),
        zoom: 15,
      });
      setMessage("");
      return;
    }

    requestCurrentLocation({ focus: true, quiet: false, allowRouteFocus: true });
  }


  async function rerouteControlPoints(controlPoints, { silent = false } = {}) {
    const control = compactControlPoints(controlPoints);
    if (control.length < 2) return;

    const requestId = routingRequestIdRef.current + 1;
    routingRequestIdRef.current = requestId;

    if (routingAbortRef.current) {
      routingAbortRef.current.abort();
    }

    const controller = new AbortController();
    routingAbortRef.current = controller;

    try {
      setRoutingStatus("routing");

      const response = await fetch("/api/routes/reroute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sport_id: sportId,
          points: control,
        }),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (requestId !== routingRequestIdRef.current) return;

      if (!response.ok || !data?.ok) {
        const fallbackPayload = routePayloadFromGeometry(control, control, "drawn-fallback");
        setRoutedPayload({
          ...fallbackPayload,
          routed: false,
          fallback_reason: data?.error || "Routing failed.",
          routed_at: new Date().toISOString(),
        });
        setRoutingStatus("done");
        setRoutingError("");
        if (!silent) setMessage("Could not snap this route. Using the drawn line as a fallback.");
        return;
      }

      const routed = data.route_points || data;

      if (!routed?.points?.length && !Array.isArray(routed)) {
        throw new Error("No routed geometry returned.");
      }

      const geometry = normalizeRoutePoints(routed?.points?.length ? routed.points : routed);
      const routePayload = geometry.length >= 2
        ? {
            ...routePayloadFromGeometry(geometry, control, data?.routed === false ? "drawn-fallback" : "full-controlpoint-reroute"),
            profile: routed?.profile || data?.profile || null,
            provider_url: routed?.provider_url || data?.provider_url || null,
            route_quality: routed?.route_quality || data?.route_quality || null,
            routed: data?.routed !== false,
            fallback_reason: data?.routed === false ? data?.warning || "Routing provider used fallback geometry." : null,
            routed_at: new Date().toISOString(),
          }
        : routed;

      setRoutedPayload(routePayload);
      setRoutingStatus("done");
      setRoutingError("");

      if (data?.routed === false) {
        if (!silent) setMessage(data?.warning || "No snapped path found. Using the drawn line.");
      } else if (!silent) {
        setMessage("");
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (requestId !== routingRequestIdRef.current) return;

      console.error("Routing failed", error);
      const fallbackPayload = routePayloadFromGeometry(control, control, "drawn-fallback");
      setRoutedPayload({
        ...fallbackPayload,
        routed: false,
        fallback_reason: error?.message || "Routing failed.",
        routed_at: new Date().toISOString(),
      });
      setRoutingStatus("done");
      setRoutingError("");
      if (!silent) setMessage("Could not snap this route. Using the drawn line as a fallback.");
    } finally {
      if (requestId === routingRequestIdRef.current && routingAbortRef.current === controller) {
        routingAbortRef.current = null;
      }
    }
  }

  async function rerouteRoute({ silent = false } = {}) {
    return rerouteControlPoints(points, { silent });
  }


  function buildCurrentDraft() {
    const safePayload = buildSafeDraftRoutePayload(
      routedPayload?.points?.length ? routedPayload : makeRoutePointPayload(points),
      points
    );

    safePayload.waypoints = compactControlPoints(points);
    safePayload.control_points = compactControlPoints(points);
    safePayload.geometry_points = safePayload.points;
    safePayload.start_location = cleanRouteLocationName(routeStartLocation) || "Locatie bepalen";

    return makeRouteDraft({
      sportId,
      title,
      method: "draw",
      profileId: profile?.id,
      metrics,
      routePayload: safePayload,
    });
  }

  function saveDraftLocally() {
    if (!canContinue) {
      setMessage("Add at least two routepoints before saving a draft.");
      return;
    }

    try {
      const draft = buildCurrentDraft();
      window.sessionStorage.setItem("endurance_route_draft", JSON.stringify(draft));
      window.localStorage.setItem("endurance_route_draft_backup", JSON.stringify(draft));
      setMessage("Draft saved.");

      if (draftSavedMessageTimerRef.current) {
        window.clearTimeout(draftSavedMessageTimerRef.current);
      }
      draftSavedMessageTimerRef.current = window.setTimeout(() => setMessage(""), 1200);
    } catch (error) {
      console.error("Could not save route draft", error);
      setMessage("Could not save this route draft.");
    }
  }

  function downloadGpx() {
    const exportPoints = normalizeRoutePoints(routedPayload?.points?.length ? routedPayload.points : activeRoutePayload);

    if (exportPoints.length < 2) {
      setMessage("Add at least two routepoints before downloading GPX.");
      return;
    }

    const safeTitle = (title?.trim() || defaultTitle(sportId)).replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "endurance-route";
    const gpx = routePointsToGpx(exportPoints, title?.trim() || defaultTitle(sportId));
    downloadTextFile({ filename: `${safeTitle}.gpx`, text: gpx });
  }

  function continueToDetails() {
    if (!canContinue) {
      setMessage("Add at least two routepoints before continuing.");
      return;
    }

    if (routingStatus === "routing") {
      setMessage("Route is still snapping to roads/paths. Wait a moment and try again.");
      return;
    }

    if (points.length >= 2 && !routedPayload?.points?.length) {
      setRoutedPayload(routePayloadFromGeometry(points, points, "drawn-fallback"));
    }

    try {
      const draft = buildCurrentDraft();
      window.sessionStorage.setItem("endurance_route_draft", JSON.stringify(draft));
      window.localStorage.setItem("endurance_route_draft_backup", JSON.stringify(draft));

      const params = new URLSearchParams(window.location.search);
      const detailsParams = new URLSearchParams({ routeDraft: "1" });
      const returnTo = params.get("returnTo");
      const step = params.get("step");
      if (returnTo) detailsParams.set("returnTo", returnTo);
      if (step) detailsParams.set("step", step);

      window.location.assign(`/routes/new?${detailsParams.toString()}`);
    } catch (error) {
      console.error("Could not save route draft", error);
      setMessage("Could not prepare the route details. Try again with fewer routepoints.");
    }
  }



  useEffect(() => {
    const query = searchText.trim();

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        setSearching(true);

        const response = await fetch(`/api/geocode/search?text=${encodeURIComponent(query)}`);
        const data = await response.json();

        setSearchResults(Array.isArray(data?.features) ? data.features : []);
      } catch (error) {
        console.error("Location search failed", error);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchText]);

  function flyToLocation(result) {
    const location = {
      lat: Number(result.lat),
      lon: Number(result.lon),
      label: result.label || "Selected location",
      forceFocusAt: Date.now(),
    };

    setTargetLocation(location);
    setSearchResults([]);
    setSearchText(result.label || "");
    setSearchOpen(false);
  }


  useEffect(() => {
    if (points.length < 2 || !routeSignature) return;

    const timeout = window.setTimeout(() => {
      rerouteRoute({ silent: true });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [routeSignature, sportId]);


  useEffect(() => {
    if (titleEditedManually) return;

    const distanceKm = metrics.distance_km || routedPayload?.distance_km || pointsPayload?.distance_km || 0;

    setTitle(buildAutomaticRouteTitle({
      startLocation: routeStartLocation,
      distanceKm,
      sportId,
    }));
  }, [
    titleEditedManually,
    routeStartLocation,
    metrics.distance_km,
    routedPayload?.distance_km,
    pointsPayload?.distance_km,
    sportId,
  ]);



  function dispatchMapControl(action) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("endurance:route-map-control", {
        detail: { action },
      })
    );
  }

  if (checking) {
    return (
      <main className="route-draw-fullscreen">
        <div className="route-draw-loading">Opening fullscreen editor...</div>
      </main>
    );
  }

  return (
    <main className="route-draw-fullscreen route-draw-polished route-draw-immersive">
      <section className="route-draw-topbar">
        <button type="button" className="route-draw-round-btn" onClick={() => router.push("/routes/new")} aria-label="Close draw editor">
          ←
        </button>

        <div className="route-draw-title-block route-draw-title-block-single route-draw-title-block-two-line">
          <textarea
            value={title}
            rows={2}
            onChange={(event) => {
              setTitleEditedManually?.(true);
              setTitle(event.target.value);
            }}
            aria-label="Route title"
          />
        </div>

        <button
          type="button"
          className="route-draw-save-btn"
          onClick={continueToDetails}
          disabled={!canContinue}
        >
          Save & continue
        </button>
      </section>

      {searchOpen ? (
        <div className="route-search-bar route-search-bar-expanded">
          <div className="route-search-input-wrap">
            <span className="route-search-icon">⌕</span>
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search address, café, restaurant or place"
              autoFocus
            />
            <button
              type="button"
              className="route-search-close"
              onClick={() => {
                setSearchOpen(false);
                setSearchResults([]);
              }}
              aria-label="Close search"
            >
              ×
            </button>
          </div>

          {searchResults.length ? (
            <div className="route-search-results">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => flyToLocation(result)}
                >
                  <b>{result.label}</b>
                  <small>
                    {Number(result.lat).toFixed(5)}, {Number(result.lon).toFixed(5)}
                  </small>
                </button>
              ))}
            </div>
          ) : null}

          {searching ? (
            <div className="route-search-loading">Searching locations...</div>
          ) : null}
        </div>
      ) : null}

      <RouteDrawMap
        points={points}
        routedPoints={routedPoints.length ? routedPoints : points}
        onChange={handlePointsChange}
        height="100vh"
        title={title || "Draw route"}
        insertMode={drawInsertMode}
        layer="standard"
        routeMode={routedPoints.length ? "routed" : "drawn"}
        currentLocation={currentLocation}
        focusCurrentLocation={!points.length && !loadedDraftRef.current}
        targetLocation={targetLocation}
        onTargetLocationHandled={() => setTargetLocation(null)}
      />
      <section className="route-draw-bottom-hud route-draw-bottom-hud-final route-draw-bottom-hud-elevation-only" aria-label="Route elevation">
        <div className="route-draw-hud-metrics route-draw-hud-metrics-final route-draw-hud-metrics-elevation-only">
          <div>
            <i className="route-hud-icon route-hud-elevation" aria-hidden="true"></i>
            <span>Elevation</span>
            <b>{metrics.elevation_gain_m || 0} m+</b>
          </div>
        </div>
      </section>


      {/* Map style picker removed: map style is selected automatically per sport. */}

      {routingError && points.length < 2 ? <section className="route-draw-routing-error">{routingError}</section> : null}

      {routedPoints.length ? (
        <section className="route-draw-routing-status">
          
        </section>
      ) : null}

      {showElevationPanel ? (
        <section className="route-elevation-panel-expanded" aria-label="Elevation profile">
          <div className="route-elevation-panel-header">
            <span>△</span>
            <strong>Elevation profile</strong>
            <button type="button" onClick={() => setShowElevationPanel(false)} aria-label="Close elevation profile">⌃</button>
          </div>
          <ElevationMiniStrip points={activeRoutePayload} />
        </section>
      ) : null}

      {showQualityPanel ? (
        <RouteQualityPanel
          payload={routedPayload || activeRoutePayload}
          sportId={sportId}
          onClose={() => setShowQualityPanel(false)}
        />
      ) : null}



      {showPointPanel ? (
        <section className="route-draw-point-panel">
          <div>
            <strong>Route points</strong>
            <button type="button" onClick={() => setShowPointPanel(false)}>×</button>
          </div>

          {points.length ? (
            points.map((point, index) => (
              <button key={`${point.lat}-${point.lon}-${index}`} type="button" onClick={() => removePoint(index)}>
                <span>{index + 1}</span>
                <small>{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</small>
                <b>Remove</b>
              </button>
            ))
          ) : (
            <p>Tap on the map to add your first point.</p>
          )}
        </section>
      ) : null}

      <section className="route-draw-tip">
        Tap map to add points · tap route line to shape · drag points to reshape
      </section>


      <section className="route-editor-control-layer" aria-label="Route editor controls">

        <div className="route-editor-left-rail route-editor-left-rail-labeled route-editor-left-rail-compact" aria-label="Route tools">
          <button type="button" onClick={useCurrentLocation} aria-label="Current Location">
            <b>⌖</b><span>Current<br />Location</span>
          </button>
          <button type="button" onClick={() => setSearchOpen((value) => !value)} className={searchOpen ? "active" : ""} aria-label="Search">
            <b>⌕</b><span>Search</span>
          </button>
          <button type="button" onClick={closeLoop} disabled={points.length < 3} aria-label="Loop">
            <b>◌</b><span>Loop</span>
          </button>
          <button type="button" onClick={undoPoint} disabled={!points.length} aria-label="Undo">
            <b>↶</b><span>Undo</span>
          </button>
          <button type="button" onClick={clearRoute} disabled={!points.length} aria-label="Clear">
            <b className="route-tool-danger">⌫</b><span>Clear</span>
          </button>
          <button type="button" onClick={() => setShowQualityPanel((value) => !value)} className={showQualityPanel ? "active" : ""} disabled={!routeQuality} aria-label="Route quality">
            <b>◎</b><span>Quality</span>
          </button>
          <button type="button" onClick={() => setShowElevationPanel((value) => !value)} className={showElevationPanel ? "active" : ""} aria-label="Elevation profile">
            <b>△</b><span>Elevation</span>
          </button>
        </div>


</section>

      {message ? <section className="route-draw-toast">{message}</section> : null}
    </main>
  );
}
