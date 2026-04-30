export const parseGpxFile = async (file) => {
  const text = await file.text();
  return parseGpxText(text);
};

export const parseGpxText = (text) => {
  const xml = new DOMParser().parseFromString(text, "application/xml");

  const trkpts = Array.from(xml.getElementsByTagName("trkpt"));
  const rtepts = Array.from(xml.getElementsByTagName("rtept"));

  const points = trkpts.length > 0 ? trkpts : rtepts;

  return points
    .map((pt) => {
      const lat = Number(pt.getAttribute("lat"));
      const lon = Number(pt.getAttribute("lon"));
      const eleNode = pt.getElementsByTagName("ele")[0];
      const ele = eleNode ? Number(eleNode.textContent) : null;

      return {
        lat,
        lon,
        ele: Number.isFinite(ele) ? ele : null,
      };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
};

export const calculateRouteStats = (points) => {
  if (!points || points.length < 2) {
    return {
      distanceKm: null,
      elevationGain: null,
      elevationLoss: null,
      minElevation: null,
      maxElevation: null,
      steepestClimb: null,
      steepestDescent: null,
    };
  }

  const normalized = points
    .map((point) => ({
      lat: Number(point.lat),
      lon: Number(point.lon ?? point.lng),
      ele: Number.isFinite(Number(point.ele)) ? Number(point.ele) : null,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

  if (normalized.length < 2) {
    return {
      distanceKm: null,
      elevationGain: null,
      elevationLoss: null,
      minElevation: null,
      maxElevation: null,
      steepestClimb: null,
      steepestDescent: null,
    };
  }

  const toRad = (deg) => (deg * Math.PI) / 180;

  const distanceBetween = (a, b) => {
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

    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  const elevations = normalized.map((point) =>
    Number.isFinite(point.ele) ? point.ele : 0
  );

  const smoothed = elevations.map((value, index) => {
    let total = 0;
    let count = 0;

    for (let i = index - 2; i <= index + 2; i++) {
      if (i >= 0 && i < elevations.length) {
        total += elevations[i];
        count += 1;
      }
    }

    return count ? total / count : value;
  });

  let distanceMeters = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let steepestClimb = null;
  let steepestDescent = null;

  for (let i = 1; i < normalized.length; i++) {
    const segmentMeters = distanceBetween(normalized[i - 1], normalized[i]);
    distanceMeters += segmentMeters;

    const diff = smoothed[i] - smoothed[i - 1];

    // Ignore tiny GPS/elevation noise while preserving hill detail.
    if (diff > 1) elevationGain += diff;
    if (diff < -1) elevationLoss += Math.abs(diff);

    if (segmentMeters >= 15) {
      const grade = (diff / segmentMeters) * 100;

      if (diff > 0 && (steepestClimb === null || grade > steepestClimb)) {
        steepestClimb = grade;
      }

      if (diff < 0 && (steepestDescent === null || grade < steepestDescent)) {
        steepestDescent = grade;
      }
    }
  }

  const minElevation = Math.min(...smoothed);
  const maxElevation = Math.max(...smoothed);

  return {
    distanceKm: Number((distanceMeters / 1000).toFixed(2)),
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    minElevation: Math.round(minElevation),
    maxElevation: Math.round(maxElevation),
    steepestClimb:
      steepestClimb === null ? null : Number(steepestClimb.toFixed(1)),
    steepestDescent:
      steepestDescent === null ? null : Number(steepestDescent.toFixed(1)),
  };
};

export const buildElevationProfile = (points) => {
  if (!points || points.length < 2) return [];

  let distanceMeters = 0;

  return points
    .map((point, index) => {
      const lat = Number(point.lat);
      const lon = Number(point.lon ?? point.lng);
      const ele = Number(point.ele);

      if (index > 0) {
        const previous = points[index - 1];
        const a = {
          lat: Number(previous.lat),
          lon: Number(previous.lon ?? previous.lng),
        };
        const b = { lat, lon };

        const R = 6371000;
        const toRad = (deg) => (deg * Math.PI) / 180;
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

        distanceMeters += 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      }

      return {
        distanceKm: Number((distanceMeters / 1000).toFixed(3)),
        ele: Number.isFinite(ele) ? ele : null,
        lat,
        lon,
      };
    })
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
};
