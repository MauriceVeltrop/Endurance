export function getRoutePoints(routePoints) {
  if (!routePoints) return [];

  if (Array.isArray(routePoints)) return routePoints;
  if (Array.isArray(routePoints.points)) return routePoints.points;

  return [];
}

export function makeSvgPolyline(points, width = 320, height = 180, padding = 18) {
  const valid = getRoutePoints(points).filter(
    (point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon))
  );

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

  if (!points.length) {
    return {
      pointCount: 0,
      hasElevation: false,
    };
  }

  return {
    pointCount: points.length,
    hasElevation: points.some((point) => Number.isFinite(Number(point.ele))),
  };
}
