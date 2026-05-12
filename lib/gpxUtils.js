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

  const points = nodes
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

  if (points.length < 2) {
    throw new Error("GPX needs at least two valid points.");
  }

  let distanceMeters = 0;
  let elevationGain = 0;

  for (let i = 1; i < points.length; i += 1) {
    distanceMeters += haversineMeters(points[i - 1], points[i]);

    const previousEle = points[i - 1].ele;
    const currentEle = points[i].ele;

    if (Number.isFinite(previousEle) && Number.isFinite(currentEle)) {
      const diff = currentEle - previousEle;
      if (diff > 1) elevationGain += diff;
    }
  }

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
    points,
    point_count: points.length,
    distance_km: Number((distanceMeters / 1000).toFixed(2)),
    elevation_gain_m: Math.round(elevationGain),
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

  return `${count} route point${count === 1 ? "" : "s"} imported`;
}
