import { getSportLabel } from "../trainingHelpers";
import { calculateRouteMetrics, estimateTimeText, normalizeRoutePoints, simplifyRoutePoints } from "../routeMetrics";

function defaultTitle(sportId) {
  return `${getSportLabel(sportId || "running")} Route`;
}

export function makeRoutePointPayload(points, source = "draw-fullscreen") {
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

export function compactRoutePoints(points, maxPoints = 900) {
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

function sampleEvenlyAcrossRoute(points, maxPoints = 18) {
  const normalized = normalizeRoutePoints(points);

  if (normalized.length <= maxPoints) return normalized;
  if (maxPoints <= 2) return [normalized[0], normalized[normalized.length - 1]].filter(Boolean);

  const lastIndex = normalized.length - 1;
  const sampled = [];

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
    const point = normalized[sourceIndex];

    if (!point) continue;

    const previous = sampled[sampled.length - 1];
    if (!previous || previous.lat !== point.lat || previous.lon !== point.lon) {
      sampled.push(point);
    }
  }

  const last = normalized[lastIndex];
  const sampledLast = sampled[sampled.length - 1];

  if (last && (!sampledLast || sampledLast.lat !== last.lat || sampledLast.lon !== last.lon)) {
    sampled.push(last);
  }

  return sampled;
}

export function compactControlPoints(points, maxPoints = 18) {
  return sampleEvenlyAcrossRoute(points, maxPoints);
}

export function buildSafeDraftRoutePayload(payload, fallbackPoints) {
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

export function buildFullGeometryRoutePayload(payload, fallbackPoints = []) {
  const payloadPoints = normalizeRoutePoints(payload?.points?.length ? payload.points : payload);
  const fallback = normalizeRoutePoints(fallbackPoints);
  const points = payloadPoints.length ? payloadPoints : fallback;
  const waypoints = normalizeRoutePoints(payload?.waypoints || payload?.control_points);

  return {
    ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
    source: payload?.source || "native-gpx-full-geometry",
    points,
    geometry_points: points,
    waypoints,
    control_points: waypoints,
    point_count: points.length,
    distance_km: payload?.distance_km || null,
    elevation_gain_m: payload?.elevation_gain_m || 0,
    route_quality: payload?.route_quality || null,
    routed_at: payload?.routed_at || payload?.drawn_at || payload?.edited_at || new Date().toISOString(),
  };
}

export function routePayloadFromGeometry(points, waypoints, source = "local-segment-reroute") {
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

export function makeRouteDraft({ sportId, title, method = "draw", profileId, metrics, routePayload, titleIsAuto = true }) {
  return {
    sport_id: sportId,
    title: title?.trim() || defaultTitle(sportId),
    title_is_auto: titleIsAuto !== false,
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

export function safeReadEditDraft() {
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
