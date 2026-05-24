function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function radians(value) {
  return (Number(value) * Math.PI) / 180;
}

function haversineMeters(a, b) {
  const lat1 = toFiniteNumber(a?.lat ?? a?.latitude);
  const lon1 = toFiniteNumber(a?.lon ?? a?.lng ?? a?.longitude);
  const lat2 = toFiniteNumber(b?.lat ?? b?.latitude);
  const lon2 = toFiniteNumber(b?.lon ?? b?.lng ?? b?.longitude);

  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return 0;

  const earthRadius = 6371000;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const rLat1 = radians(lat1);
  const rLat2 = radians(lat2);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function getRoutePoints(routePoints) {
  const raw = Array.isArray(routePoints)
    ? routePoints
    : Array.isArray(routePoints?.points)
      ? routePoints.points
      : Array.isArray(routePoints?.geometry_points)
        ? routePoints.geometry_points
        : [];

  return raw
    .map((point) => {
      if (Array.isArray(point)) {
        return {
          lat: toFiniteNumber(point[0]),
          lon: toFiniteNumber(point[1]),
          ele: point.length > 2 ? toFiniteNumber(point[2]) : null,
        };
      }

      return {
        lat: toFiniteNumber(point?.lat ?? point?.latitude),
        lon: toFiniteNumber(point?.lon ?? point?.lng ?? point?.longitude),
        ele: toFiniteNumber(point?.ele ?? point?.elevation ?? point?.alt),
      };
    })
    .filter((point) => point.lat !== null && point.lon !== null);
}

export function getControlPoints(routePoints) {
  const raw = Array.isArray(routePoints?.control_points)
    ? routePoints.control_points
    : Array.isArray(routePoints?.waypoints)
      ? routePoints.waypoints
      : [];

  return getRoutePoints(raw);
}

export function makeSvgPolyline(points, width = 320, height = 180, padding = 18) {
  const valid = getRoutePoints(points);

  if (valid.length < 2) return "";

  const lats = valid.map((point) => Number(point.lat));
  const lons = valid.map((point) => Number(point.lon));

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latRange = maxLat - minLat || 0.000001;
  const lonRange = maxLon - minLon || 0.000001;

  return valid
    .map((point) => {
      const x = padding + ((Number(point.lon) - minLon) / lonRange) * (width - padding * 2);
      const y = padding + ((maxLat - Number(point.lat)) / latRange) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function getRoutePreviewStats(routePoints) {
  const points = getRoutePoints(routePoints);
  const controlPoints = getControlPoints(routePoints);
  const elevations = points.map((point) => point.ele).filter((value) => Number.isFinite(value));

  if (!points.length) {
    return {
      pointCount: 0,
      controlPointCount: 0,
      hasElevation: false,
      distanceKm: 0,
      qualityLabel: "No route data",
    };
  }

  let distanceMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    distanceMeters += haversineMeters(points[index - 1], points[index]);
  }

  const pointDensity = distanceMeters > 0 ? points.length / Math.max(0.1, distanceMeters / 1000) : points.length;
  const qualityLabel =
    points.length < 2
      ? "Incomplete"
      : pointDensity > 120
        ? "Very detailed"
        : pointDensity > 35
          ? "Detailed"
          : "Lightweight";

  return {
    pointCount: points.length,
    controlPointCount: controlPoints.length || Number(routePoints?.waypoint_count || 0) || 0,
    hasElevation: elevations.length >= 2,
    distanceKm: Number((distanceMeters / 1000).toFixed(2)),
    pointDensity: Number(pointDensity.toFixed(1)),
    qualityLabel,
  };
}

export function getElevationStats(routePoints) {
  const points = getRoutePoints(routePoints);
  const elevations = points.map((point) => point.ele).filter((value) => Number.isFinite(value));

  if (elevations.length < 2) {
    return {
      min: null,
      max: null,
      range: null,
      gain: null,
      loss: null,
      available: false,
      sampleCount: elevations.length,
    };
  }

  let gain = 0;
  let loss = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].ele;
    const current = points[index].ele;
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;

    const delta = current - previous;
    if (delta > 1) gain += delta;
    if (delta < -1) loss += Math.abs(delta);
  }

  const min = Math.round(Math.min(...elevations));
  const max = Math.round(Math.max(...elevations));

  return {
    min,
    max,
    range: max - min,
    gain: Math.round(gain),
    loss: Math.round(loss),
    available: true,
    sampleCount: elevations.length,
  };
}

export function getElevationSeries(routePoints) {
  const points = getRoutePoints(routePoints);
  const series = [];
  let distanceMeters = 0;

  for (let index = 0; index < points.length; index += 1) {
    if (index > 0) {
      distanceMeters += haversineMeters(points[index - 1], points[index]);
    }

    if (Number.isFinite(points[index].ele)) {
      series.push({
        distanceKm: Number((distanceMeters / 1000).toFixed(3)),
        ele: points[index].ele,
      });
    }
  }

  return series;
}

export function makeElevationPolyline(routePoints, width = 320, height = 90, padding = 10) {
  const series = getElevationSeries(routePoints);

  if (series.length < 2) return "";

  const elevations = series.map((point) => point.ele);
  const distances = series.map((point) => point.distanceKm);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  const maxDistance = Math.max(...distances) || 1;
  const eleRange = maxEle - minEle || 1;

  return series
    .map((point) => {
      const x = padding + (point.distanceKm / maxDistance) * (width - padding * 2);
      const y = padding + ((maxEle - point.ele) / eleRange) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
