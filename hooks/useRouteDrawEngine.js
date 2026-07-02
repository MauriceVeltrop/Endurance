import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeRoutePoints } from "../lib/routeMetrics";
import { buildRoutePayloadFromSegments, getControlSegments, hydrateSegmentsFromRoutePayload } from "../lib/routes/routeSegmentEngine";

const SEGMENT_TIMEOUT_MS = 12000;
const AUTO_SYNC_DELAY_MS = 350;
const BACKGROUND_OPTIMIZE_DELAY_MS = 900;
const BACKGROUND_OPTIMIZE_MIN_SCORE_GAIN = 6;
const BACKGROUND_OPTIMIZE_TIMEOUT_MS = 24000;


function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLon = toRad(Number(b.lon) - Number(a.lon));
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeDistanceMeters(points = []) {
  const geometry = normalizeRoutePoints(points);
  let total = 0;
  for (let index = 1; index < geometry.length; index += 1) {
    total += haversineMeters(geometry[index - 1], geometry[index]);
  }
  return total;
}

function nearestGeometryIndex(target, geometry = []) {
  const point = normalizeRoutePoints([target])[0];
  const points = normalizeRoutePoints(geometry);
  if (!point || points.length < 2) return -1;

  let bestIndex = -1;
  let bestMeters = Infinity;
  points.forEach((candidate, index) => {
    const meters = haversineMeters(point, candidate);
    if (meters < bestMeters) {
      bestMeters = meters;
      bestIndex = index;
    }
  });

  return bestMeters <= 160 ? bestIndex : -1;
}

function weightedWindowScore(segments = []) {
  let scoreMeters = 0;
  let metersTotal = 0;
  let badMeters = 0;
  let pathMeters = 0;

  segments.forEach((segment) => {
    const geometry = normalizeRoutePoints(segment?.geometry || segment?.points || segment?.control);
    const meters = Math.max(1, routeDistanceMeters(geometry));
    const score = routeQualityScore(segment);
    if (score !== null) scoreMeters += score * meters;
    metersTotal += meters;

    const bad = qualityNumber(segment, "bad_surface_percent");
    const path = qualityNumber(segment, "path_percent");
    if (bad !== null) badMeters += (bad / 100) * meters;
    if (path !== null) pathMeters += (path / 100) * meters;
  });

  if (!metersTotal) return null;
  return {
    score: Math.round(scoreMeters / metersTotal),
    bad: Math.round((badMeters / metersTotal) * 100),
    path: Math.round((pathMeters / metersTotal) * 100),
    meters: metersTotal,
  };
}

function shouldUseOptimizedWindow(currentSegments = [], optimizedWindow) {
  const optimizedScore = routeQualityScore(optimizedWindow);
  if (optimizedScore === null || optimizedWindow?.routed === false) return false;

  const current = weightedWindowScore(currentSegments);
  if (!current) return optimizedScore >= 45;

  const optimizedBad = qualityNumber(optimizedWindow, "bad_surface_percent");
  const optimizedPath = qualityNumber(optimizedWindow, "path_percent");

  if (optimizedScore >= current.score + 10) return true;
  if (optimizedBad !== null && optimizedBad <= current.bad - 10 && optimizedScore >= current.score - 3) return true;
  if (optimizedPath !== null && optimizedPath <= current.path - 12 && optimizedScore >= current.score - 3) return true;

  return false;
}

function splitOptimizedWindow({ windowSegment, firstDefinition, secondDefinition }) {
  const geometry = normalizeRoutePoints(windowSegment?.geometry || windowSegment?.points);
  if (geometry.length < 3) return null;

  const splitIndex = nearestGeometryIndex(firstDefinition?.to, geometry);
  if (splitIndex <= 0 || splitIndex >= geometry.length - 1) return null;

  let firstGeometry = geometry.slice(0, splitIndex + 1);
  let secondGeometry = geometry.slice(splitIndex);

  const middle = normalizeRoutePoints([firstDefinition.to])[0];
  if (middle) {
    firstGeometry = [...firstGeometry.slice(0, -1), middle];
    secondGeometry = [middle, ...secondGeometry.slice(1)];
  }

  const quality = {
    ...(windowSegment.quality || {}),
    route_kind: "window-optimized-split",
    window_optimized: true,
  };

  return [
    {
      ...firstDefinition,
      geometry: firstGeometry,
      points: firstGeometry,
      routed: true,
      status: "snapped",
      source: "window-background-optimized",
      quality,
      updated_at: new Date().toISOString(),
    },
    {
      ...secondDefinition,
      geometry: secondGeometry,
      points: secondGeometry,
      routed: true,
      status: "snapped",
      source: "window-background-optimized",
      quality,
      updated_at: new Date().toISOString(),
    },
  ];
}

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

function controlSignature(points = []) {
  return normalizeRoutePoints(points)
    .map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`)
    .join("|");
}

function inflightBaseKey(key = "") {
  const text = String(key || "");
  return text.includes("::") ? text.split("::").slice(1).join("::") : text;
}

function routeQualityScore(segment) {
  const value = Number(segment?.quality?.score);
  return Number.isFinite(value) ? value : null;
}

function qualityNumber(segment, key) {
  const value = Number(segment?.quality?.[key]);
  return Number.isFinite(value) ? value : null;
}

function shouldUseOptimizedSegment(currentSegment, optimizedSegment) {
  const optimizedGeometry = normalizeRoutePoints(optimizedSegment?.geometry || optimizedSegment?.points);
  if (optimizedGeometry.length < 2 || optimizedSegment?.routed === false) return false;
  if (!currentSegment || currentSegment?.routed === false) return true;

  const currentScore = routeQualityScore(currentSegment);
  const optimizedScore = routeQualityScore(optimizedSegment);
  if (optimizedScore === null) return false;
  if (currentScore === null) return optimizedScore >= 35;
  if (optimizedScore >= currentScore + BACKGROUND_OPTIMIZE_MIN_SCORE_GAIN) return true;

  const currentBad = qualityNumber(currentSegment, "bad_surface_percent");
  const optimizedBad = qualityNumber(optimizedSegment, "bad_surface_percent");
  if (currentBad !== null && optimizedBad !== null && optimizedBad <= currentBad - 10 && optimizedScore >= currentScore - 4) return true;

  const currentPath = qualityNumber(currentSegment, "path_percent");
  const optimizedPath = qualityNumber(optimizedSegment, "path_percent");
  if (currentPath !== null && optimizedPath !== null && optimizedPath <= currentPath - 12 && optimizedScore >= currentScore - 4) return true;

  return false;
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
  const segmentInflightRef = useRef(new Map());
  const segmentAbortRef = useRef(new Map());
  const syncIdRef = useRef(0);
  const progressTimerRef = useRef(null);
  const latestProgressRef = useRef(null);
  const hydratedRouteSignatureRef = useRef("");
  const staleSegmentDisplayRef = useRef(new Map());
  const optimizeTimerRef = useRef(null);
  const optimizeInflightRef = useRef("");
  const optimizedSignatureRef = useRef("");

  const routeSignature = useMemo(
    () => controlSignature(controlPoints),
    [controlPoints]
  );

  const routedGeometry = useMemo(
    () => normalizeRoutePoints(routePayload?.points),
    [routePayload]
  );

  const pendingSegment = useCallback((segment) => {
    const cached = segmentCacheRef.current.get(segment.key);
    if (cached?.geometry?.length >= 2) return cached;

    const staleDisplay = staleSegmentDisplayRef.current.get(segment.key);
    const staleGeometry = normalizeRoutePoints(staleDisplay?.geometry || staleDisplay?.points);
    if (staleGeometry.length >= 2) {
      return {
        ...segment,
        geometry: staleGeometry,
        points: staleGeometry,
        routed: false,
        status: segmentInflightRef.current.has(segment.key) ? "routing" : "pending",
        stale: true,
        stale_source: staleDisplay?.source || "previous-segment-display",
      };
    }

    return {
      ...segment,
      geometry: segment.control,
      points: segment.control,
      routed: false,
      status: segmentInflightRef.current.has(segment.key) ? "routing" : "pending",
    };
  }, []);

  const buildSegmentState = useCallback((definitions, routedOverrides = new Map()) => definitions.map((segment) => {
    const override = routedOverrides.get(segment.key);
    if (override?.geometry?.length >= 2) return override;
    return pendingSegment(segment);
  }), [pendingSegment]);

  const clearProgressQueue = useCallback(() => {
    if (progressTimerRef.current) {
      window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    latestProgressRef.current = null;
  }, []);

  const clearOptimizeTimer = useCallback(() => {
    if (optimizeTimerRef.current) {
      window.clearTimeout(optimizeTimerRef.current);
      optimizeTimerRef.current = null;
    }
  }, []);

  const abortObsoleteSegments = useCallback((activeKeys = new Set()) => {
    segmentAbortRef.current.forEach((controller, key) => {
      if (activeKeys.has(inflightBaseKey(key))) return;
      try {
        controller?.abort?.();
      } catch (_) {}
      segmentAbortRef.current.delete(key);
      segmentInflightRef.current.delete(key);
    });
  }, []);

  const primeSegmentCache = useCallback((segments = [], { replace = false } = {}) => {
    if (replace) segmentCacheRef.current = new Map();

    (Array.isArray(segments) ? segments : []).forEach((segment) => {
      if (!segment?.key || !segment?.geometry?.length) return;
      segmentCacheRef.current.set(segment.key, segment);
    });
  }, []);

  const routeSegment = useCallback((segment, { mode = "live", force = false, cacheResult = true } = {}) => {
    const cached = !force ? segmentCacheRef.current.get(segment.key) : null;
    if (cached?.geometry?.length >= 2) return Promise.resolve(cached);

    const inflightKey = mode === "live" ? segment.key : `${mode}::${segment.key}`;
    const inflight = segmentInflightRef.current.get(inflightKey);
    if (inflight) return inflight;

    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = mode === "live" ? SEGMENT_TIMEOUT_MS : BACKGROUND_OPTIMIZE_TIMEOUT_MS;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch (_) {}
    }, timeoutMs);

    segmentAbortRef.current.set(inflightKey, controller);

    const promise = (async () => {
      try {
        const response = await fetch("/api/routes/reroute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sport_id: sportId,
            points: segment.control,
            mode,
          }),
          signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));

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

        if (cacheResult) segmentCacheRef.current.set(segment.key, nextSegment);
        return nextSegment;
      } catch (error) {
        if (error?.name === "AbortError" && !timedOut) return null;

        const reason = timedOut
          ? "Segment routing timed out and uses a drawn fallback."
          : error?.message || "Segment routing failed.";

        const failed = fallbackSegment(segment, reason);
        if (cacheResult) segmentCacheRef.current.set(segment.key, failed);
        return failed;
      } finally {
        window.clearTimeout(timeout);
        segmentInflightRef.current.delete(inflightKey);
        segmentAbortRef.current.delete(inflightKey);
      }
    })();

    segmentInflightRef.current.set(inflightKey, promise);
    return promise;
  }, [sportId]);

  const flushProgressUpdate = useCallback(() => {
    const snapshot = latestProgressRef.current;
    latestProgressRef.current = null;
    if (!snapshot) return;

    setRouteSegments(snapshot.segments);
    setRoutePayload(buildRoutePayloadFromSegments({
      segments: snapshot.segments,
      controlPoints: snapshot.controls,
      source: snapshot.source || "segmented-routing-progress-throttled",
      sportId,
    }));
  }, [sportId]);

  const scheduleProgressUpdate = useCallback((segments, controls) => {
    latestProgressRef.current = { segments, controls };
    if (progressTimerRef.current) return;

    progressTimerRef.current = window.setTimeout(() => {
      progressTimerRef.current = null;
      flushProgressUpdate();
    }, 220);
  }, [flushProgressUpdate]);

  const optimizeSegmentsInBackground = useCallback(async (controlsSnapshot = [], liveSegmentsSnapshot = []) => {
    const controls = normalizeRoutePoints(controlsSnapshot);
    if (controls.length < 2) return null;

    const signature = controlSignature(controls);
    if (optimizedSignatureRef.current === signature) return null;

    optimizeInflightRef.current = signature;
    const definitions = getControlSegments(controls, sportId);
    const nextByKey = new Map();

    (Array.isArray(liveSegmentsSnapshot) ? liveSegmentsSnapshot : []).forEach((segment) => {
      if (segment?.key) nextByKey.set(segment.key, segment);
    });

    definitions.forEach((definition) => {
      const cached = segmentCacheRef.current.get(definition.key);
      if (cached?.geometry?.length >= 2 && !nextByKey.has(definition.key)) {
        nextByKey.set(definition.key, cached);
      }
    });

    let optimizedAny = false;

    // Whole-route aware pass: optimize adjacent two-segment windows before
    // falling back to individual A→B optimization. This lets Endurance replace
    // a locally bad A→B + B→C pair with a better A→C corridor while keeping the
    // user control point B as a split point when the optimized geometry passes
    // close enough to it. If the window does not pass near B, it is rejected to
    // avoid surprising control-point jumps.
    for (let index = 0; index < definitions.length - 1; index += 1) {
      if (optimizeInflightRef.current !== signature) return null;

      const firstDefinition = definitions[index];
      const secondDefinition = definitions[index + 1];
      const currentFirst = nextByKey.get(firstDefinition.key) || segmentCacheRef.current.get(firstDefinition.key);
      const currentSecond = nextByKey.get(secondDefinition.key) || segmentCacheRef.current.get(secondDefinition.key);
      const currentWindow = [currentFirst, currentSecond].filter(Boolean);

      const windowDefinition = {
        index,
        from: firstDefinition.from,
        to: secondDefinition.to,
        key: `window2::${firstDefinition.key}::${secondDefinition.key}`,
        control: [firstDefinition.from, secondDefinition.to],
      };

      const optimizedWindow = await routeSegment(windowDefinition, {
        mode: "optimize",
        force: true,
        cacheResult: false,
      });

      if (!optimizedWindow || optimizeInflightRef.current !== signature) return null;
      if (!shouldUseOptimizedWindow(currentWindow, optimizedWindow)) continue;

      const splitSegments = splitOptimizedWindow({
        windowSegment: optimizedWindow,
        firstDefinition,
        secondDefinition,
      });

      if (!splitSegments) continue;

      segmentCacheRef.current.set(firstDefinition.key, splitSegments[0]);
      segmentCacheRef.current.set(secondDefinition.key, splitSegments[1]);
      nextByKey.set(firstDefinition.key, splitSegments[0]);
      nextByKey.set(secondDefinition.key, splitSegments[1]);
      optimizedAny = true;

      const nextSegments = buildSegmentState(definitions, nextByKey);
      setRouteSegments(nextSegments);
      setRoutePayload(buildRoutePayloadFromSegments({
        segments: nextSegments,
        controlPoints: controls,
        source: "segmented-routing-window-background-optimized",
        sportId,
      }));
    }

    for (const definition of definitions) {
      if (optimizeInflightRef.current !== signature) return null;
      const currentSegment = nextByKey.get(definition.key) || segmentCacheRef.current.get(definition.key);
      const optimizedSegment = await routeSegment(definition, {
        mode: "optimize",
        force: true,
        cacheResult: false,
      });

      if (!optimizedSegment || optimizeInflightRef.current !== signature) return null;
      if (!shouldUseOptimizedSegment(currentSegment, optimizedSegment)) continue;

      segmentCacheRef.current.set(definition.key, optimizedSegment);
      nextByKey.set(definition.key, optimizedSegment);
      optimizedAny = true;

      const nextSegments = buildSegmentState(definitions, nextByKey);
      setRouteSegments(nextSegments);
      setRoutePayload(buildRoutePayloadFromSegments({
        segments: nextSegments,
        controlPoints: controls,
        source: "segmented-routing-background-optimized",
        sportId,
      }));
    }

    if (optimizeInflightRef.current === signature) {
      optimizedSignatureRef.current = signature;
      optimizeInflightRef.current = "";
    }

    if (optimizedAny) setRoutingStatus("done");
    return optimizedAny;
  }, [buildSegmentState, routeSegment, sportId]);

  const scheduleBackgroundOptimize = useCallback((controlsSnapshot = [], liveSegmentsSnapshot = []) => {
    if (String(sportId || "").toLowerCase() !== "running") return;
    const controls = normalizeRoutePoints(controlsSnapshot);
    if (controls.length < 2) return;

    const signature = controlSignature(controls);
    if (optimizedSignatureRef.current === signature) return;

    clearOptimizeTimer();
    optimizeTimerRef.current = window.setTimeout(() => {
      optimizeTimerRef.current = null;
      optimizeSegmentsInBackground(controls, liveSegmentsSnapshot);
    }, BACKGROUND_OPTIMIZE_DELAY_MS);
  }, [clearOptimizeTimer, optimizeSegmentsInBackground, sportId]);

  const syncSegments = useCallback(async (nextControlPoints = controlPoints, { silent = true } = {}) => {
    const controls = normalizeRoutePoints(nextControlPoints);

    if (controls.length < 2) {
      syncIdRef.current += 1;
      abortObsoleteSegments(new Set());
      clearProgressQueue();
      hydratedRouteSignatureRef.current = "";
      setRouteSegments([]);
      setRoutePayload(null);
      setRoutingStatus("idle");
      setRoutingError("");
      return null;
    }

    const syncId = syncIdRef.current + 1;
    syncIdRef.current = syncId;

    const definitions = getControlSegments(controls, sportId);
    abortObsoleteSegments(new Set(definitions.map((segment) => segment.key)));
    const routedOverrides = new Map();
    let latestSegments = buildSegmentState(definitions, routedOverrides);

    setRouteSegments(latestSegments);
    setRoutePayload(buildRoutePayloadFromSegments({
      segments: latestSegments,
      controlPoints: controls,
      source: "segmented-routing-provisional",
      sportId,
    }));
    setRoutingStatus("routing");
    setRoutingError("");

    const pending = definitions
      .filter((segment) => !segmentCacheRef.current.get(segment.key)?.geometry?.length)
      .sort((a, b) => Number(b.index || 0) - Number(a.index || 0));

    if (!pending.length) {
      const payload = buildRoutePayloadFromSegments({
        segments: latestSegments,
        controlPoints: controls,
        source: "segmented-routing-cache",
        sportId,
      });
      setRoutePayload(payload);
      setRoutingStatus("done");
      scheduleBackgroundOptimize(controls, latestSegments);
      return payload;
    }

    const maxConcurrent = Math.min(2, pending.length);
    let cursor = 0;

    async function worker() {
      while (cursor < pending.length) {
        const segment = pending[cursor];
        cursor += 1;

        const result = await routeSegment(segment);
        if (!result) continue;
        if (syncId !== syncIdRef.current) return;

        staleSegmentDisplayRef.current.delete(segment.key);
        routedOverrides.set(segment.key, result);
        latestSegments = buildSegmentState(definitions, routedOverrides);

        scheduleProgressUpdate(latestSegments, controls);
      }
    }

    await Promise.all(Array.from({ length: maxConcurrent }, () => worker()));
    if (syncId !== syncIdRef.current) return null;

    clearProgressQueue();

    latestSegments = buildSegmentState(definitions, routedOverrides);
    const payload = buildRoutePayloadFromSegments({
      segments: latestSegments,
      controlPoints: controls,
      source: "segmented-routing",
      sportId,
    });

    setRouteSegments(latestSegments);
    setRoutePayload(payload);
    setRoutingStatus("done");
    setRoutingError("");
    scheduleBackgroundOptimize(controls, latestSegments);

    const failedCount = latestSegments.filter((segment) => segment.routed === false && segment.status === "failed").length;
    if (!silent && failedCount) {
      setRoutingError(`${failedCount} segment${failedCount === 1 ? "" : "s"} could not snap and use a drawn fallback.`);
    }

    return payload;
  }, [abortObsoleteSegments, buildSegmentState, clearProgressQueue, controlPoints, routeSegment, scheduleProgressUpdate, scheduleBackgroundOptimize, sportId]);

  const setRouteControlPoints = useCallback((nextPoints, meta = {}) => {
    const controls = normalizeRoutePoints(nextPoints);
    hydratedRouteSignatureRef.current = "";
    syncIdRef.current += 1;
    clearProgressQueue();
    clearOptimizeTimer();
    optimizeInflightRef.current = "";
    optimizedSignatureRef.current = "";
    setControlPoints(controls);
    setRoutingError("");

    if (controls.length < 2) {
      abortObsoleteSegments(new Set());
      staleSegmentDisplayRef.current = new Map();
      setRouteSegments([]);
      setRoutePayload(null);
      setRoutingStatus("idle");
      return;
    }

    const definitions = getControlSegments(controls, sportId);
    const activeKeys = new Set(definitions.map((segment) => segment.key));
    abortObsoleteSegments(activeKeys);

    const staleDisplay = new Map();
    if (meta?.type === "move_control_point" && Number.isInteger(Number(meta.index))) {
      const movedIndex = Number(meta.index);
      [movedIndex - 1, movedIndex].forEach((segmentIndex) => {
        if (segmentIndex < 0 || segmentIndex >= definitions.length) return;
        const definition = definitions[segmentIndex];
        const previousSegment = routeSegments.find((segment) => Number(segment?.index) === segmentIndex) || routeSegments[segmentIndex];
        const previousGeometry = normalizeRoutePoints(previousSegment?.geometry || previousSegment?.points);
        if (definition?.key && previousGeometry.length >= 2) {
          staleDisplay.set(definition.key, {
            ...definition,
            geometry: previousGeometry,
            points: previousGeometry,
            routed: false,
            status: "routing",
            stale: true,
            source: "previous-segment-display",
          });
        }
      });
    }
    staleSegmentDisplayRef.current = staleDisplay;

    const provisional = buildSegmentState(definitions);

    setRouteSegments(provisional);
    setRoutePayload(buildRoutePayloadFromSegments({
      segments: provisional,
      controlPoints: controls,
      source: "segmented-routing-local-provisional",
      sportId,
    }));

    setRoutingStatus("pending");
  }, [abortObsoleteSegments, buildSegmentState, clearOptimizeTimer, clearProgressQueue, routeSegments, sportId]);

  const loadRoute = useCallback(({ controlPoints: nextControlPoints = [], routePayload: nextRoutePayload = null, status = "done" } = {}) => {
    const controls = normalizeRoutePoints(nextControlPoints);
    const hydratedSegments = hydrateSegmentsFromRoutePayload({
      routePayload: nextRoutePayload,
      controlPoints: controls,
      sportId,
    });
    const rebuiltPayload = hydratedSegments.length
      ? buildRoutePayloadFromSegments({
          segments: hydratedSegments,
          controlPoints: controls,
          source: nextRoutePayload?.source || "hydrated-route",
          sportId,
        })
      : null;
    const originalGeometry = normalizeRoutePoints(nextRoutePayload?.points?.length ? nextRoutePayload.points : nextRoutePayload?.geometry_points);
    const hydratedPayload = rebuiltPayload
      ? {
          ...(nextRoutePayload && typeof nextRoutePayload === "object" && !Array.isArray(nextRoutePayload) ? nextRoutePayload : {}),
          ...rebuiltPayload,
          source: nextRoutePayload?.source || rebuiltPayload.source,
          points: originalGeometry.length >= 2 ? originalGeometry : rebuiltPayload.points,
          geometry_points: originalGeometry.length >= 2 ? originalGeometry : rebuiltPayload.points,
          waypoints: controls,
          control_points: controls,
          route_segments: rebuiltPayload.route_segments,
          rehydrated: true,
        }
      : nextRoutePayload;

    syncIdRef.current += 1;
    abortObsoleteSegments(new Set());
    clearProgressQueue();
    clearOptimizeTimer();
    optimizeInflightRef.current = "";
    staleSegmentDisplayRef.current = new Map();
    primeSegmentCache(hydratedSegments, { replace: true });
    setControlPoints(controls);
    setRouteSegments(hydratedSegments);
    setRoutePayload(hydratedPayload);
    setRoutingStatus(status);
    setRoutingError("");

    hydratedRouteSignatureRef.current = hydratedPayload?.points?.length
      ? controlSignature(controls)
      : "";
  }, [abortObsoleteSegments, clearOptimizeTimer, clearProgressQueue, primeSegmentCache, sportId]);

  const setRoutePayloadDirect = useCallback((nextRoutePayload, { status = "done" } = {}) => {
    syncIdRef.current += 1;
    hydratedRouteSignatureRef.current = "";
    abortObsoleteSegments(new Set());
    clearProgressQueue();
    clearOptimizeTimer();
    optimizeInflightRef.current = "";
    optimizedSignatureRef.current = "";
    staleSegmentDisplayRef.current = new Map();
    setRoutePayload(nextRoutePayload);
    setRoutingStatus(status);
    setRoutingError("");
  }, [abortObsoleteSegments, clearOptimizeTimer, clearProgressQueue]);

  const resetRoute = useCallback(() => {
    syncIdRef.current += 1;
    hydratedRouteSignatureRef.current = "";
    abortObsoleteSegments(new Set());
    clearProgressQueue();
    clearOptimizeTimer();
    optimizeInflightRef.current = "";
    optimizedSignatureRef.current = "";
    staleSegmentDisplayRef.current = new Map();
    setControlPoints([]);
    setRouteSegments([]);
    setRoutePayload(null);
    setRoutingStatus("idle");
    setRoutingError("");
  }, [abortObsoleteSegments, clearOptimizeTimer, clearProgressQueue]);

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

    if (hydratedRouteSignatureRef.current && hydratedRouteSignatureRef.current === routeSignature) {
      return;
    }

    const timeout = window.setTimeout(() => {
      syncSegments(controlPoints, { silent: true });
    }, AUTO_SYNC_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [routeSignature, syncSegments, controlPoints]);

  useEffect(() => () => {
    clearProgressQueue();
    clearOptimizeTimer();
    optimizeInflightRef.current = "";
  }, [clearOptimizeTimer, clearProgressQueue]);

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
    loadRoute,
    resetRoute,
    setRoutePayload: setRoutePayloadDirect,
  };
}
