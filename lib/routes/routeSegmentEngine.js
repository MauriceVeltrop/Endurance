import { calculateRouteMetrics, normalizeRoutePoints, simplifyRoutePoints } from "../routeMetrics";

export function segmentKey(a, b, sportId = "") {
  const p1 = normalizeRoutePoints([a])[0];
  const p2 = normalizeRoutePoints([b])[0];
  if (!p1 || !p2) return "";
  return [
    String(sportId || ""),
    p1.lat.toFixed(6),
    p1.lon.toFixed(6),
    p2.lat.toFixed(6),
    p2.lon.toFixed(6),
  ].join("|");
}

export function getControlSegments(controlPoints, sportId = "") {
  const points = normalizeRoutePoints(controlPoints);
  const segments = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    segments.push({
      index,
      from,
      to,
      key: segmentKey(from, to, sportId),
      control: [from, to],
    });
  }

  return segments;
}

export function compactRouteGeometry(points, maxPoints = 1400) {
  const normalized = normalizeRoutePoints(points);
  const simplified = simplifyRoutePoints(normalized, normalized.length > 500 ? 4 : 1.5);

  if (simplified.length <= maxPoints) return simplified;

  const step = Math.ceil(simplified.length / maxPoints);
  const output = simplified.filter((_, index) => index % step === 0);
  const last = simplified[simplified.length - 1];

  if (last && output[output.length - 1] !== last) output.push(last);

  return output;
}

export function joinSegmentGeometries(segments) {
  const output = [];

  (Array.isArray(segments) ? segments : []).forEach((segment) => {
    const geometry = normalizeRoutePoints(segment?.geometry || segment?.points || segment);

    geometry.forEach((point) => {
      const previous = output[output.length - 1];
      if (
        previous &&
        Math.abs(Number(previous.lat) - Number(point.lat)) <= 1e-6 &&
        Math.abs(Number(previous.lon) - Number(point.lon)) <= 1e-6
      ) {
        return;
      }

      output.push(point);
    });
  });

  return compactRouteGeometry(output);
}

function addPercentMapToMeters(target, percentMap, meters) {
  Object.entries(percentMap || {}).forEach(([key, percent]) => {
    const value = (Number(percent || 0) / 100) * Number(meters || 0);
    if (!Number.isFinite(value) || value <= 0) return;
    target[key] = (target[key] || 0) + value;
  });
}

function aggregateRouteQuality(segments, metrics, sportId = "", controlPoints = []) {
  const totalDistanceMeters = Math.max(1, Number(metrics?.distance_km || 0) * 1000);
  const directMetrics = calculateRouteMetrics(normalizeRoutePoints(controlPoints));
  const directDistanceMeters = Math.max(1, Number(directMetrics?.distance_km || 0) * 1000);
  const detourFactor = totalDistanceMeters / directDistanceMeters;
  const surfaces = {};
  const waytypes = {};
  let scoreMeters = 0;
  let suitableMeters = 0;
  let unsuitableMeters = 0;
  let unknownMeters = 0;
  let candidateCount = 0;
  let segmentDetourMeters = 0;

  (Array.isArray(segments) ? segments : []).forEach((segment) => {
    const geometry = normalizeRoutePoints(segment?.geometry || segment?.points || segment?.control);
    const segmentMetrics = calculateRouteMetrics(geometry);
    const meters = Math.max(1, Number(segmentMetrics?.distance_km || 0) * 1000);
    const quality = segment?.quality || {};

    if (Number.isFinite(Number(quality.score))) {
      scoreMeters += Number(quality.score) * meters;
    }

    suitableMeters += (Number(quality.suitable_percent || 0) / 100) * meters;
    unsuitableMeters += (Number(quality.unsuitable_percent || 0) / 100) * meters;
    unknownMeters += (Number(quality.unknown_percent || 0) / 100) * meters;
    candidateCount += Number(quality.candidates || 0);
    if (Number.isFinite(Number(quality.detour))) {
      segmentDetourMeters += Number(quality.detour) * meters;
    }
    addPercentMapToMeters(surfaces, quality.surfaces, meters);
    addPercentMapToMeters(waytypes, quality.waytypes, meters);
  });

  const suitabilityScore = scoreMeters > 0 ? Math.round(scoreMeters / totalDistanceMeters) : null;

  return {
    sport_id: sportId || null,
    suitability_score: suitabilityScore,
    surface_quality: {
      ideal_ratio: Math.max(0, Math.min(1, suitableMeters / totalDistanceMeters)),
      acceptable_ratio: 0,
      avoid_ratio: Math.max(0, Math.min(1, unsuitableMeters / totalDistanceMeters)),
      unknown_ratio: Math.max(0, Math.min(1, unknownMeters / totalDistanceMeters)),
    },
    surfaces,
    waytypes,
    detour_factor: Number.isFinite(detourFactor) ? Number(detourFactor.toFixed(3)) : 1,
    average_segment_detour_factor: segmentDetourMeters > 0 ? Number((segmentDetourMeters / totalDistanceMeters).toFixed(3)) : null,
    candidates_considered: candidateCount,
    segment_based: true,
  };
}

export function buildRoutePayloadFromSegments({ segments, controlPoints, source = "segmented-routing", routeQuality = null, sportId = "" }) {
  const safeSegments = Array.isArray(segments) ? segments : [];
  const geometry = joinSegmentGeometries(safeSegments);
  const waypoints = normalizeRoutePoints(controlPoints);
  const metrics = calculateRouteMetrics(geometry);
  const failedSegments = safeSegments.filter((segment) => segment?.routed === false).length;
  const snappedSegments = safeSegments.filter((segment) => segment?.routed !== false && segment?.status !== "pending").length;

  return {
    source,
    points: geometry,
    waypoints,
    control_points: waypoints,
    point_count: geometry.length,
    segment_count: safeSegments.length,
    snapped_segment_count: snappedSegments,
    failed_segment_count: failedSegments,
    segment_status: safeSegments.map((segment) => ({
      index: segment?.index,
      key: segment?.key,
      routed: segment?.routed !== false,
      status: segment?.status || (segment?.routed === false ? "failed" : "snapped"),
      fallback_reason: segment?.fallback_reason || null,
    })),
    segmented: true,
    routed: failedSegments === 0,
    distance_km: metrics.distance_km || null,
    elevation_gain_m: metrics.elevation_gain_m || 0,
    elevation_loss_m: metrics.elevation_loss_m || 0,
    max_elevation_m: metrics.max_elevation_m || null,
    route_quality: routeQuality || aggregateRouteQuality(safeSegments, metrics, sportId, waypoints),
    routed_at: new Date().toISOString(),
  };
}
