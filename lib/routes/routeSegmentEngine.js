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

export function buildRoutePayloadFromSegments({ segments, controlPoints, source = "segmented-routing", routeQuality = null }) {
  const geometry = joinSegmentGeometries(segments);
  const waypoints = normalizeRoutePoints(controlPoints);
  const metrics = calculateRouteMetrics(geometry);
  const failedSegments = segments.filter((segment) => segment?.routed === false).length;
  const snappedSegments = segments.filter((segment) => segment?.routed !== false).length;

  return {
    source,
    points: geometry,
    waypoints,
    control_points: waypoints,
    point_count: geometry.length,
    segment_count: segments.length,
    snapped_segment_count: snappedSegments,
    failed_segment_count: failedSegments,
    segmented: true,
    routed: failedSegments === 0,
    distance_km: metrics.distance_km || null,
    elevation_gain_m: metrics.elevation_gain_m || 0,
    elevation_loss_m: metrics.elevation_loss_m || 0,
    max_elevation_m: metrics.max_elevation_m || null,
    route_quality: routeQuality,
    routed_at: new Date().toISOString(),
  };
}
