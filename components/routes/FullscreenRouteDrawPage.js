// components/routes/FullscreenRouteDrawPage.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RouteDrawMap from "./RouteDrawMap";
import { getSportLabel } from "../../lib/trainingHelpers";
import { calculateRouteMetrics, normalizeRoutePoints } from "../../lib/routeMetrics";

const DEFAULT_CENTER = [50.887, 6.023];
const ROUTE_CACHE_PRECISION = 5;

function roundCoord(value) {
  return Number(Number(value).toFixed(ROUTE_CACHE_PRECISION));
}

function pointKey(point) {
  return `${roundCoord(point.lat)},${roundCoord(point.lon)}`;
}

function segmentKey(a, b, sportId) {
  return `${sportId}:${pointKey(a)}>${pointKey(b)}`;
}

function normalizeControlPoints(points) {
  return normalizeRoutePoints(points).map((point) => ({
    lat: Number(point.lat),
    lon: Number(point.lon),
    ele: Number.isFinite(Number(point.ele)) ? Number(point.ele) : null,
  }));
}

function joinSegmentPoints(segments) {
  const output = [];

  segments.forEach((segment) => {
    const points = normalizeRoutePoints(segment?.points);
    points.forEach((point, index) => {
      if (index === 0 && output.length) {
        const last = output[output.length - 1];
        if (Math.abs(last.lat - point.lat) < 0.00001 && Math.abs(last.lon - point.lon) < 0.00001) return;
      }
      output.push(point);
    });
  });

  return output;
}

function makeFallbackSegment(a, b, message = "Segment fallback") {
  return {
    routed: false,
    error: message,
    points: [a, b],
    quality: { score: 0, routed: false, message },
  };
}

function buildRoutePayload({ controlPoints, segments, sportId, title }) {
  const geometry = joinSegmentPoints(segments);
  const safeGeometry = geometry.length >= 2 ? geometry : controlPoints;
  const metrics = calculateRouteMetrics(safeGeometry);
  const routedSegments = segments.filter((segment) => segment?.routed).length;
  const failedSegments = Math.max(0, segments.length - routedSegments);

  return {
    source: "endurance-segmented-routebuilder-v1",
    sport_id: sportId,
    title,
    points: safeGeometry,
    waypoints: controlPoints,
    segments: segments.map((segment, index) => ({
      index,
      routed: Boolean(segment?.routed),
      point_count: Array.isArray(segment?.points) ? segment.points.length : 0,
      error: segment?.error || null,
      quality: segment?.quality || null,
    })),
    point_count: safeGeometry.length,
    waypoint_count: controlPoints.length,
    distance_km: metrics.distance_km || 0,
    elevation_gain_m: metrics.elevation_gain_m || 0,
    elevation_loss_m: metrics.elevation_loss_m || 0,
    max_elevation_m: metrics.max_elevation_m || null,
    routed_segment_count: routedSegments,
    failed_segment_count: failedSegments,
    routed: failedSegments === 0 && routedSegments > 0,
    routed_at: new Date().toISOString(),
  };
}

function readInitialSport() {
  if (typeof window === "undefined") return "running";
  const params = new URLSearchParams(window.location.search);
  return params.get("sport_id") || "running";
}

function readEditDraft() {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  if (params.get("editDraft") !== "1") return null;

  try {
    const raw = window.sessionStorage.getItem("endurance_route_edit_draft");
    if (!raw) return null;
    const draft = JSON.parse(raw);
    const routePoints = draft?.route_points;
    const points = Array.isArray(routePoints)
      ? normalizeControlPoints(routePoints)
      : normalizeControlPoints(routePoints?.waypoints?.length ? routePoints.waypoints : routePoints?.points);
    if (points.length < 2) return null;
    return { ...draft, controlPoints: points };
  } catch (_) {
    return null;
  }
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

export default function FullscreenRouteDrawPage() {
  const editDraft = useMemo(() => readEditDraft(), []);
  const [sportId] = useState(editDraft?.sport_id || readInitialSport());
  const [controlPoints, setControlPoints] = useState(() => editDraft?.controlPoints || []);
  const [segmentsByKey, setSegmentsByKey] = useState({});
  const [segmentOrder, setSegmentOrder] = useState([]);
  const [routing, setRouting] = useState(false);
  const [message, setMessage] = useState("");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [focusCurrentLocation, setFocusCurrentLocation] = useState(false);
  const [mapLayer, setMapLayer] = useState("standard");
  const [showQuality, setShowQuality] = useState(false);
  const requestVersionRef = useRef(0);
  const segmentsByKeyRef = useRef({});

  const debouncedControlPoints = useDebouncedValue(controlPoints, controlPoints.length > 10 ? 650 : 350);

  const segments = useMemo(
    () => segmentOrder.map((key) => segmentsByKey[key]).filter(Boolean),
    [segmentOrder, segmentsByKey]
  );

  useEffect(() => {
    segmentsByKeyRef.current = segmentsByKey;
  }, [segmentsByKey]);

  const routedPoints = useMemo(() => joinSegmentPoints(segments), [segments]);
  const routePayload = useMemo(
    () =>
      buildRoutePayload({
        controlPoints,
        segments,
        sportId,
        title: `${getSportLabel(sportId)} Route`,
      }),
    [controlPoints, segments, sportId]
  );

  const metrics = useMemo(
    () => calculateRouteMetrics(routedPoints.length >= 2 ? routedPoints : controlPoints),
    [routedPoints, controlPoints]
  );

  const failedSegments = routePayload.failed_segment_count || 0;
  const qualityScore = useMemo(() => {
    const scores = segments
      .map((segment) => Number(segment?.quality?.score))
      .filter((score) => Number.isFinite(score) && score > 0);
    if (!scores.length) return null;
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }, [segments]);

  useEffect(() => {
    if (editDraft?.controlPoints?.length >= 2) {
      setMessage("Route loaded. You can continue editing.");
    }
  }, [editDraft]);

  useEffect(() => {
    if (!navigator?.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: Number(position.coords.latitude),
          lon: Number(position.coords.longitude),
        };
        if (Number.isFinite(next.lat) && Number.isFinite(next.lon)) {
          setCurrentLocation(next);
          if (!controlPoints.length) setFocusCurrentLocation(true);
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const points = normalizeControlPoints(debouncedControlPoints);
    const nextKeys = [];

    for (let index = 1; index < points.length; index += 1) {
      nextKeys.push(segmentKey(points[index - 1], points[index], sportId));
    }

    setSegmentOrder(nextKeys);

    if (points.length < 2) {
      setSegmentsByKey({});
      setRouting(false);
      return;
    }

    const missing = nextKeys
      .map((key, index) => ({ key, index, a: points[index], b: points[index + 1] }))
      .filter(({ key }) => !segmentsByKeyRef.current[key]);

    if (!missing.length) return;

    const version = requestVersionRef.current + 1;
    requestVersionRef.current = version;
    let cancelled = false;

    async function routeMissingSegments() {
      setRouting(true);

      const updates = {};
      const queue = missing.slice();
      const workerCount = Math.min(3, queue.length);

      async function worker() {
        while (queue.length && !cancelled && version === requestVersionRef.current) {
          const item = queue.shift();

          try {
            const response = await fetch("/api/routes/reroute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sport_id: sportId,
                points: [item.a, item.b],
              }),
            });

            const data = await response.json().catch(() => ({}));
            const route = data?.route_points || {};
            const points = normalizeControlPoints(route?.points);

            updates[item.key] =
              response.ok && data?.ok && points.length >= 2
                ? {
                    routed: Boolean(data.routed),
                    points,
                    quality: route.quality || null,
                    profile: data.profile || route.provider_profile || null,
                    error: data.routed === false ? data.error || route.fallback_reason || null : null,
                  }
                : makeFallbackSegment(item.a, item.b, data?.error || "Routing failed");
          } catch (error) {
            updates[item.key] = makeFallbackSegment(item.a, item.b, error?.message || "Routing failed");
          }

          if (!cancelled && version === requestVersionRef.current) {
            setSegmentsByKey((current) => {
              const next = { ...current, ...updates };
              segmentsByKeyRef.current = next;
              return next;
            });
          }
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      if (!cancelled && version === requestVersionRef.current) {
        setRouting(false);
        const failed = Object.values(updates).filter((segment) => !segment?.routed).length;
        if (failed > 0) {
          setMessage(`${failed} segment${failed === 1 ? "" : "s"} could not be snapped. Move those points closer to a road or path.`);
        } else {
          setMessage("");
        }
      }
    }

    routeMissingSegments();

    return () => {
      cancelled = true;
    };
  }, [debouncedControlPoints, sportId]);

  function handlePointsChange(nextPoints) {
    const next = normalizeControlPoints(nextPoints);
    setControlPoints(next);

    // Remove cached segments that are no longer present. Keep all still-valid segments.
    const validKeys = new Set();
    for (let index = 1; index < next.length; index += 1) {
      validKeys.add(segmentKey(next[index - 1], next[index], sportId));
    }

    setSegmentsByKey((current) => {
      const cleaned = {};
      for (const [key, value] of Object.entries(current)) {
        if (validKeys.has(key)) cleaned[key] = value;
      }
      segmentsByKeyRef.current = cleaned;
      return cleaned;
    });
  }

  function undoPoint() {
    handlePointsChange(controlPoints.slice(0, -1));
  }

  function clearRoute() {
    setControlPoints([]);
    setSegmentsByKey({});
    segmentsByKeyRef.current = {};
    setSegmentOrder([]);
    setMessage("");
    setShowQuality(false);
  }

  function centerOnMe() {
    if (!currentLocation) {
      setMessage("Current location is not available.");
      return;
    }
    setFocusCurrentLocation(true);
    window.setTimeout(() => setFocusCurrentLocation(false), 500);
  }

  function saveAndContinue() {
    if (routePayload.points.length < 2) {
      setMessage("Draw at least two route points first.");
      return;
    }

    try {
      const draft = {
        sport_id: sportId,
        title: `${getSportLabel(sportId)} Route`,
        description: "",
        distance_km: metrics.distance_km || routePayload.distance_km || 0,
        elevation_gain_m: metrics.elevation_gain_m || routePayload.elevation_gain_m || 0,
        route_points: routePayload,
        saved_at: new Date().toISOString(),
      };

      window.sessionStorage.setItem("endurance_route_draft", JSON.stringify(draft));
      window.localStorage.setItem("endurance_route_draft_backup", JSON.stringify(draft));

      const params = new URLSearchParams(window.location.search);
      const next = new URLSearchParams({ routeDraft: "1" });
      if (params.get("returnTo")) next.set("returnTo", params.get("returnTo"));
      if (params.get("step")) next.set("step", params.get("step"));

      window.location.assign(`/routes/new?${next.toString()}`);
    } catch (error) {
      console.error("Could not prepare route draft", error);
      setMessage("Could not prepare route details.");
    }
  }

  return (
    <main className="route-draw-fullscreen">
      <RouteDrawMap
        points={controlPoints}
        routedPoints={routedPoints}
        onChange={handlePointsChange}
        height="100vh"
        center={currentLocation ? [currentLocation.lat, currentLocation.lon] : DEFAULT_CENTER}
        title="Draw route"
        layer={mapLayer}
        onLayerChange={setMapLayer}
        currentLocation={currentLocation}
        focusCurrentLocation={focusCurrentLocation}
      />

      <section className="route-draw-topbar">
        <button type="button" onClick={() => window.history.back()} aria-label="Back">
          ←
        </button>
        <div>
          <h1>
            {`Nieuwenhagen - ${(metrics.distance_km || 0).toFixed(1)} km -`}
            <br />
            {getSportLabel(sportId)}
          </h1>
          <p>
            {routing ? "Snapping segments..." : `${controlPoints.length} points · ${routePayload.routed_segment_count || 0}/${Math.max(0, controlPoints.length - 1)} snapped`}
          </p>
        </div>
        <button type="button" className="route-draw-save" onClick={saveAndContinue}>
          Save & continue
        </button>
      </section>

      <section className="route-draw-tools" aria-label="Route tools">
        <button type="button" onClick={centerOnMe} aria-label="Current location">
          <b>⌖</b>
          <span>Current Location</span>
        </button>
        <button type="button" disabled aria-label="Search disabled">
          <b>⌕</b>
          <span>Search</span>
        </button>
        <button type="button" disabled aria-label="Loop disabled">
          <b>○</b>
          <span>Loop</span>
        </button>
        <button type="button" onClick={undoPoint} disabled={!controlPoints.length} aria-label="Undo">
          <b>↶</b>
          <span>Undo</span>
        </button>
        <button type="button" onClick={clearRoute} disabled={!controlPoints.length} aria-label="Clear">
          <b className="route-tool-danger">⌫</b>
          <span>Clear</span>
        </button>
        <button type="button" onClick={() => setShowQuality((value) => !value)} disabled={!segments.length} className={showQuality ? "active" : ""} aria-label="Quality">
          <b>◎</b>
          <span>Quality</span>
        </button>
      </section>

      <section className="route-draw-elevation">
        <span>ELEVATION</span>
        <strong>{Math.round(metrics.elevation_gain_m || 0)} m+</strong>
      </section>

      {showQuality ? (
        <section className="route-quality-panel route-quality-panel-clean">
          <header>
            <h2>Route quality</h2>
            <strong>{qualityScore == null ? "—" : `${qualityScore}/100`}</strong>
            <button type="button" onClick={() => setShowQuality(false)} aria-label="Close quality">
              ×
            </button>
          </header>

          <div className="route-quality-grid">
            <div>
              <span>Distance</span>
              <strong>{(metrics.distance_km || 0).toFixed(1)} km</strong>
            </div>
            <div>
              <span>Elevation</span>
              <strong>{Math.round(metrics.elevation_gain_m || 0)} m+</strong>
            </div>
            <div>
              <span>Segments</span>
              <strong>{`${routePayload.routed_segment_count || 0}/${Math.max(0, controlPoints.length - 1)}`}</strong>
            </div>
            <div>
              <span>Fallback</span>
              <strong>{failedSegments}</strong>
            </div>
          </div>

          {failedSegments ? (
            <p className="route-quality-warning">
              Some segments could not be snapped. Move the related points closer to visible roads or paths.
            </p>
          ) : (
            <p className="route-quality-good">All segments are snapped independently.</p>
          )}
        </section>
      ) : null}

      {message ? <section className="route-draw-toast">{message}</section> : null}
    </main>
  );
}
