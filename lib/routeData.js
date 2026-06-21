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

export function hydrateRouteWithGeometry(route) {
  if (!route) return route;

  const geometryRow = Array.isArray(route.route_geometries)
    ? route.route_geometries[0]
    : route.route_geometries || null;

  const routePoints = geometryRowToRoutePoints(geometryRow, route.route_points);

  return {
    ...route,
    active_geometry: geometryRow,
    route_points: routePoints,
  };
}

export function buildRouteGeometryInsert({ route_id, routeId, route_points, routePoints, version = 1, source_type, sourceType = "gpx", distance_km, elevation_gain_m }) {
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
      created_from: "app_route_save",
      created_at: new Date().toISOString(),
    },
  };
}

export function inferRouteSourceType(methodOrPayload, routePoints = null) {
  const method = typeof methodOrPayload === "string" ? methodOrPayload : "";
  const source = String(routePoints?.source || methodOrPayload?.source || methodOrPayload?.route_points?.source || "").toLowerCase();

  if (method === "upload" || source.includes("gpx")) return "gpx";
  if (method === "wizard" || source.includes("generated")) return "generated";
  if (method === "draw" || source.includes("draw")) return "drawn";

  return "legacy_import";
}
