export const parseGpxFile = async (file) => {
  const text = await file.text();
  const xml = new DOMParser().parseFromString(text, "application/xml");

  const trkpts = Array.from(xml.getElementsByTagName("trkpt"));
  const rtepts = Array.from(xml.getElementsByTagName("rtept"));

  const points = trkpts.length > 0 ? trkpts : rtepts;

  return points
    .map((pt) => ({
      lat: Number(pt.getAttribute("lat")),
      lon: Number(pt.getAttribute("lon")),
      ele: Number(pt.getElementsByTagName("ele")[0]?.textContent || 0),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
};

export const calculateRouteStats = (points) => {
  if (!points || points.length < 2) {
    return { distanceKm: null, elevationGain: null };
  }

  const toRad = (deg) => (deg * Math.PI) / 180;

  let distanceMeters = 0;
  let elevationGain = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];

    const R = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    distanceMeters += R * c;

    const diff = (b.ele || 0) - (a.ele || 0);

    if (diff > 0) {
      elevationGain += diff;
    }
  }

  return {
    distanceKm: Number((distanceMeters / 1000).toFixed(2)),
    elevationGain: Math.round(elevationGain),
  };
};


