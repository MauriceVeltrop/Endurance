import { calculateRouteMetrics } from "./routeMetrics";

const MAX_IMPORTED_GPX_POINTS = 1800;
const MEDIUM_GPX_SIMPLIFY_TOLERANCE_METERS = 3;
const LARGE_GPX_SIMPLIFY_TOLERANCE_METERS = 7;

export function haversineMeters(a, b) {
  const radius = 6371000;
  const toRad = (value) => (Number(value) * Math.PI) / 180;

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return radius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function perpendicularDistanceMeters(point, start, end) {
  if (!point || !start || !end) return 0;

  const latScale = 111320;
  const lonScale = Math.cos(((Number(start.lat) + Number(end.lat)) / 2) * Math.PI / 180) * 111320;

  const px = (Number(point.lon) - Number(start.lon)) * lonScale;
  const py = (Number(point.lat) - Number(start.lat)) * latScale;
  const bx = (Number(end.lon) - Number(start.lon)) * lonScale;
  const by = (Number(end.lat) - Number(start.lat)) * latScale;

  if (bx === 0 && by === 0) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by)));
  const projectedX = t * bx;
  const projectedY = t * by;

  return Math.hypot(px - projectedX, py - projectedY);
}

function simplifyDouglasPeucker(points, toleranceMeters) {
  if (!Array.isArray(points) || points.length <= 2) return points || [];

  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistanceMeters(points[index], first, last);

    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance <= toleranceMeters) {
    return [first, last];
  }

  const left = simplifyDouglasPeucker(points.slice(0, maxIndex + 1), toleranceMeters);
  const right = simplifyDouglasPeucker(points.slice(maxIndex), toleranceMeters);

  return [...left.slice(0, -1), ...right];
}

function evenlySamplePoints(points, maxPoints = MAX_IMPORTED_GPX_POINTS) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];

  const sampled = [];
  const lastIndex = points.length - 1;

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
    const point = points[sourceIndex];
    const previous = sampled[sampled.length - 1];

    if (point && (!previous || previous.lat !== point.lat || previous.lon !== point.lon)) {
      sampled.push(point);
    }
  }

  const first = points[0];
  const last = points[lastIndex];

  if (first && (sampled[0]?.lat !== first.lat || sampled[0]?.lon !== first.lon)) sampled.unshift(first);
  if (last && (sampled[sampled.length - 1]?.lat !== last.lat || sampled[sampled.length - 1]?.lon !== last.lon)) sampled.push(last);

  return sampled;
}

function compactImportedGpxPoints(points) {
  if (!Array.isArray(points) || points.length <= MAX_IMPORTED_GPX_POINTS) {
    return {
      points: points || [],
      originalPointCount: points?.length || 0,
      compacted: false,
    };
  }

  const tolerance = points.length > 5000 ? LARGE_GPX_SIMPLIFY_TOLERANCE_METERS : MEDIUM_GPX_SIMPLIFY_TOLERANCE_METERS;
  const simplified = simplifyDouglasPeucker(points, tolerance);
  const compacted = evenlySamplePoints(simplified.length >= 2 ? simplified : points, MAX_IMPORTED_GPX_POINTS);

  return {
    points: compacted,
    originalPointCount: points.length,
    compacted: compacted.length < points.length,
  };
}

export function parseGpxText(gpxText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxText, "application/xml");
  const parseError = doc.querySelector("parsererror");

  if (parseError) {
    throw new Error("Could not read GPX file.");
  }

  const nodes = Array.from(doc.querySelectorAll("trkpt, rtept"));

  if (!nodes.length) {
    throw new Error("No route points found in this GPX file.");
  }

  const rawPoints = nodes
    .map((node) => {
      const lat = Number(node.getAttribute("lat"));
      const lon = Number(node.getAttribute("lon"));
      const eleText = node.querySelector("ele")?.textContent;
      const ele = eleText === undefined ? null : Number(eleText);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      return {
        lat,
        lon,
        ele: Number.isFinite(ele) ? ele : null,
      };
    })
    .filter(Boolean);

  if (rawPoints.length < 2) {
    throw new Error("GPX needs at least two valid points.");
  }

  let distanceMeters = 0;
  let elevationGain = 0;

  for (let i = 1; i < rawPoints.length; i += 1) {
    distanceMeters += haversineMeters(rawPoints[i - 1], rawPoints[i]);

    const previousEle = rawPoints[i - 1].ele;
    const currentEle = rawPoints[i].ele;

    if (Number.isFinite(previousEle) && Number.isFinite(currentEle)) {
      const diff = currentEle - previousEle;
      if (diff > 1) elevationGain += diff;
    }
  }

  const compacted = compactImportedGpxPoints(rawPoints);
  const points = compacted.points;
  const metrics = calculateRouteMetrics(points);

  const bounds = points.reduce(
    (acc, point) => ({
      minLat: Math.min(acc.minLat, point.lat),
      maxLat: Math.max(acc.maxLat, point.lat),
      minLon: Math.min(acc.minLon, point.lon),
      maxLon: Math.max(acc.maxLon, point.lon),
    }),
    {
      minLat: points[0].lat,
      maxLat: points[0].lat,
      minLon: points[0].lon,
      maxLon: points[0].lon,
    }
  );

  return {
    source: compacted.compacted ? "gpx-import-compacted" : "gpx-import",
    points,
    original_points: rawPoints.length,
    original_distance_km: Number((distanceMeters / 1000).toFixed(2)),
    original_elevation_gain_m: Math.round(elevationGain),
    compacted: compacted.compacted,
    point_count: points.length,
    distance_km: metrics.distance_km,
    elevation_gain_m: metrics.elevation_gain_m,
    bounds,
    imported_at: new Date().toISOString(),
  };
}

export function formatRoutePointSummary(routePoints) {
  if (!routePoints) return "No GPX points imported yet.";

  const count = Array.isArray(routePoints)
    ? routePoints.length
    : routePoints.point_count || routePoints.points?.length || 0;

  if (!count) return "No GPX points imported yet.";

  const original = routePoints.original_points || routePoints.originalPointCount || 0;
  const compacted = routePoints.compacted && original > count;
  const suffix = compacted ? ` (${original} original points optimized for editing)` : "";

  return `${count} route point${count === 1 ? "" : "s"} imported${suffix}`;
}
