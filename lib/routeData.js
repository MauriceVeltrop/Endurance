import { calculateRouteMetrics, normalizeRoutePoints } from "./routeMetrics";

export function geometryRowToRoutePoints(geometryRow, fallbackRoutePoints = null) {
  const geometry = normalizeRoutePoints(geometryRow?.geometry);

  if (geometry.length >= 2) {
    return {
      ...(fallbackRoutePoints && typeof fallbackRoutePoints === "object" && !Array.isArray(fallbackRoutePoints)
        ? fallbackRoutePoints
        : {}),
      source: geometryRow?.source_type || "route_geometries",
      points: geometry,
      geometry_points: geometry,
      point_count: geometry.length,
      distance_km: geometryRow?.distance_km ?? fallbackRoutePoints?.distance_km ?? null,
      elevation_gain_m: geometryRow?.elevation_gain_m ?? fallbackRoutePoints?.elevation_gain_m ?? 0,
      elevation_loss_m: geometryRow?.elevation_loss_m ?? fallbackRoutePoints?.elevation_loss_m ?? 0,
      route_geometry_id: geometryRow?.id || null,
      route_geometry_version: geometryRow?.version || null,
      metadata: geometryRow?.metadata || fallbackRoutePoints?.metadata || {},
    };
  }

  return fallbackRoutePoints || null;
}

function pickActiveGeometryRow(route) {
  if (!route) return null;

  const rows = Array.isArray(route.route_geometries)
    ? route.route_geometries.filter(Boolean)
    : route.route_geometries
      ? [route.route_geometries]
      : [];

  if (!rows.length) return null;

  if (route.geometry_id) {
    const linked = rows.find((row) => row?.id === route.geometry_id);
    if (linked) return linked;
  }

  return [...rows].sort((a, b) => Number(b?.version || 0) - Number(a?.version || 0))[0] || null;
}

export function hydrateRouteWithGeometry(route) {
  if (!route) return route;

  const geometryRow = pickActiveGeometryRow(route);
  const routePoints = geometryRowToRoutePoints(geometryRow, route.route_points);

  return {
    ...route,
    active_geometry: geometryRow,
    route_points: routePoints,
  };
}

export function buildRouteGeometryInsert({
  route_id,
  routeId,
  route_points,
  routePoints,
  version = 1,
  source_type,
  sourceType = "gpx",
  distance_km,
  elevation_gain_m,
  metadata = {},
} = {}) {
  const inputRoutePoints = route_points || routePoints;
  const geometry = normalizeRoutePoints(inputRoutePoints?.points?.length ? inputRoutePoints.points : inputRoutePoints);
  const metrics = calculateRouteMetrics(geometry);

  return {
    route_id: route_id || routeId,
    version,
    source_type: source_type || sourceType,
    geometry,
    point_count: geometry.length,
    distance_km: distance_km ?? metrics.distance_km ?? null,
    elevation_gain_m: elevation_gain_m ?? metrics.elevation_gain_m ?? 0,
    elevation_loss_m: metrics.elevation_loss_m || 0,
    metadata: {
      ...metadata,
      created_from: metadata?.created_from || "app_route_save",
      created_at: metadata?.created_at || new Date().toISOString(),
    },
  };
}

export function inferRouteSourceType(methodOrPayload, routePoints = null) {
  const method = typeof methodOrPayload === "string" ? methodOrPayload : "";
  const source = String(
    routePoints?.source ||
    methodOrPayload?.source ||
    methodOrPayload?.route_points?.source ||
    ""
  ).toLowerCase();

  if (method === "upload" || source.includes("gpx")) return "gpx";
  if (method === "wizard" || source.includes("generated")) return "generated";
  if (method === "draw" || source.includes("draw")) return "drawn";
  if (source.includes("edit")) return "edited";

  return "legacy_import";
}
