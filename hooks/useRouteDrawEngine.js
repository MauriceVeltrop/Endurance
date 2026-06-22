import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeRoutePoints } from "../lib/routeMetrics";
import { buildRoutePayloadFromSegments, getControlSegments } from "../lib/routes/routeSegmentEngine";

function fallbackSegment(segment, reason = "Routing provider could not snap this segment.") {
  const geometry = normalizeRoutePoints(segment?.control || [segment?.from, segment?.to]);

  return {
    ...segment,
    geometry,
    points: geometry,
    routed: false,
    status: "failed",
    fallback_reason: reason,
    quality: null,
    updated_at: new Date().toISOString(),
  };
}

export default function useRouteDrawEngine({ sportId, initialPoints = [] }) {
  const [controlPoints, setControlPoints] = useState(() => normalizeRoutePoints(initialPoints));
  const [routeSegments, setRouteSegments] = useState([]);
  const [routePayload, setRoutePayload] = useState(null);
  const [routingStatus, setRoutingStatus] = useState("idle");
  const [routingError, setRoutingError] = useState("");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [mapFocusTarget, setMapFocusTarget] = useState(null);

  const segmentCacheRef = useRef(new Map());
  const syncIdRef = useRef(0);

  const routeSignature = useMemo(
    () => controlPoints.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`).join("|"),
    [controlPoints]
  );

  const routedGeometry = useMemo(
    () => normalizeRoutePoints(routePayload?.points),
    [routePayload]
  );

  const routeSegment = useCallback(async (segment, syncId) => {
    const cached = segmentCacheRef.current.get(segment.key);
    if (cached?.geometry?.length >= 2) return cached;

    try {
      const response = await fetch("/api/routes/reroute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport_id: sportId,
          points: segment.control,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (syncId !== syncIdRef.current) return null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Segment routing failed.");
      }

      const routed = data.route_points || data;
      const geometry = normalizeRoutePoints(routed?.points?.length ? routed.points : routed);
      if (geometry.length < 2) throw new Error("No segment geometry returned.");

      const nextSegment = {
        ...segment,
        geometry,
        points: geometry,
        routed: data?.routed !== false,
        status: data?.routed === false ? "failed" : "snapped",
        profile: routed?.provider_profile || routed?.profile || data?.profile || null,
        preference: routed?.preference || data?.preference || null,
        quality: routed?.quality || routed?.route_quality || data?.route_quality || null,
        fallback_reason: data?.routed === false ? routed?.fallback_reason || data?.warning || "Fallback geometry used." : null,
        updated_at: new Date().toISOString(),
      };

      segmentCacheRef.current.set(segment.key, nextSegment);
      return nextSegment;
    } catch (error) {
      if (syncId !== syncIdRef.current) return null;
      const failed = fallbackSegment(segment, error?.message || "Segment routing failed.");
      segmentCacheRef.current.set(segment.key, failed);
      return failed;
    }
  }, [sportId]);

  const syncSegments = useCallback(async (nextControlPoints = controlPoints, { silent = true } = {}) => {
    const controls = normalizeRoutePoints(nextControlPoints);

    if (controls.length < 2) {
      syncIdRef.current += 1;
      setRouteSegments([]);
      setRoutePayload(null);
      setRoutingStatus("idle");
      setRoutingError("");
      return null;
    }

    const syncId = syncIdRef.current + 1;
    syncIdRef.current = syncId;

    const definitions = getControlSegments(controls, sportId);
    const provisional = definitions.map((segment) => segmentCacheRef.current.get(segment.key) || {
      ...segment,
      geometry: segment.control,
      points: segment.control,
      routed: false,
      status: "pending",
    });

    setRouteSegments(provisional);
    setRoutePayload(buildRoutePayloadFromSegments({
      segments: provisional,
      controlPoints: controls,
      source: "segmented-routing-provisional",
      sportId,
    }));
    setRoutingStatus("routing");
    setRoutingError("");

    const routed = [];

    for (const segment of definitions) {
      if (syncId !== syncIdRef.current) return null;

      const result = await routeSegment(segment, syncId);
      if (!result) return null;
      routed.push(result);

      const pending = definitions.slice(routed.length).map((remaining) => segmentCacheRef.current.get(remaining.key) || {
        ...remaining,
        geometry: remaining.control,
        points: remaining.control,
        routed: false,
        status: "pending",
      });

      const progressSegments = [...routed, ...pending];
      setRouteSegments(progressSegments);
      setRoutePayload(buildRoutePayloadFromSegments({
        segments: progressSegments,
        controlPoints: controls,
        source: "segmented-routing-progress",
        sportId,
      }));
    }

    if (syncId !== syncIdRef.current) return null;

    const payload = buildRoutePayloadFromSegments({
      segments: routed,
      controlPoints: controls,
      source: "segmented-routing",
      sportId,
    });

    setRouteSegments(routed);
    setRoutePayload(payload);
    setRoutingStatus("done");
    setRoutingError("");

    const failedCount = routed.filter((segment) => segment.routed === false).length;
    if (!silent && failedCount) {
      setRoutingError(`${failedCount} segment${failedCount === 1 ? "" : "s"} could not snap and use a drawn fallback.`);
    }

    return payload;
  }, [controlPoints, routeSegment, sportId]);

  const setRouteControlPoints = useCallback((nextPoints) => {
    setControlPoints(normalizeRoutePoints(nextPoints));
  }, []);

  const requestCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition((position) => {
      const location = {
        lat: Number(position.coords.latitude.toFixed(6)),
        lon: Number(position.coords.longitude.toFixed(6)),
        focusedAt: Date.now(),
      };

      setCurrentLocation(location);
      setMapFocusTarget(location);
    });
  }, []);

  const focusLocation = useCallback((location) => {
    setMapFocusTarget({
      ...location,
      focusedAt: Date.now(),
    });
  }, []);

  useEffect(() => {
    if (controlPoints.length < 2) return;

    const timeout = window.setTimeout(() => {
      syncSegments(controlPoints, { silent: true });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [routeSignature, syncSegments]);

  return {
    controlPoints,
    routePoints: controlPoints,
    setControlPoints: setRouteControlPoints,
    setRoutePoints: setRouteControlPoints,
    routeSegments,
    routePayload,
    routedGeometry,
    routingStatus,
    routingError,
    currentLocation,
    requestCurrentLocation,
    mapFocusTarget,
    focusLocation,
    syncSegments,
  };
}
