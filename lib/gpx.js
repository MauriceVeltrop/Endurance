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

const toRad = (deg) => (deg * Math.PI) / 180;

const distanceBetween = (a, b) => {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad((b.lon ?? b.lng) - (a.lon ?? a.lng));
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

const buildDistanceProfile = (points) => {
  let distanceMeters = 0;

  return points.map((point, index) => {
    if (index > 0) {
      distanceMeters += distanceBetween(points[index - 1], point);
    }

    return {
      ...point,
      distanceMeters,
      distanceKm: distanceMeters / 1000,
    };
  });
};

const interpolateValueAtDistance = (profile, targetMeters, key = "ele") => {
  if (!profile || profile.length === 0) return null;

  if (targetMeters <= profile[0].distanceMeters) return profile[0][key];

  const last = profile[profile.length - 1];
  if (targetMeters >= last.distanceMeters) return last[key];

  for (let i = 1; i < profile.length; i++) {
    const previous = profile[i - 1];
    const current = profile[i];

    if (current.distanceMeters >= targetMeters) {
      const span = current.distanceMeters - previous.distanceMeters || 1;
      const ratio = (targetMeters - previous.distanceMeters) / span;
      return previous[key] + (current[key] - previous[key]) * ratio;
    }
  }

  return last[key];
};

const pointAtDistance = (profile, targetMeters) => {
  if (!profile || profile.length === 0) return null;

  if (targetMeters <= profile[0].distanceMeters) return profile[0];

  const last = profile[profile.length - 1];
  if (targetMeters >= last.distanceMeters) return last;

  for (let i = 1; i < profile.length; i++) {
    const previous = profile[i - 1];
    const current = profile[i];

    if (current.distanceMeters >= targetMeters) {
      const span = current.distanceMeters - previous.distanceMeters || 1;
      const ratio = (targetMeters - previous.distanceMeters) / span;

      return {
        lat: previous.lat + (current.lat - previous.lat) * ratio,
        lon:
          (previous.lon ?? previous.lng) +
          ((current.lon ?? current.lng) - (previous.lon ?? previous.lng)) *
            ratio,
        distanceMeters: targetMeters,
      };
    }
  }

  return last;
};

export const sampleRouteByDistance = (points, spacingMeters = 50) => {
  if (!points || points.length < 2) return points || [];

  const profile = buildDistanceProfile(points);
  const totalMeters = profile[profile.length - 1].distanceMeters;

  if (!Number.isFinite(totalMeters) || totalMeters <= 0) return points;

  const sampled = [];

  for (let meters = 0; meters < totalMeters; meters += spacingMeters) {
    const point = pointAtDistance(profile, meters);
    if (point) sampled.push(point);
  }

  const last = profile[profile.length - 1];
  sampled.push({
    lat: last.lat,
    lon: last.lon ?? last.lng,
    distanceMeters: last.distanceMeters,
  });

  return sampled;
};

export const fetchOpenMeteoElevations = async (points, chunkSize = 100) => {
  if (!points || points.length === 0) return [];

  const elevations = [];

  for (let index = 0; index < points.length; index += chunkSize) {
    const chunk = points.slice(index, index + chunkSize);

    const latitude = chunk.map((p) => Number(p.lat).toFixed(6)).join(",");
    const longitude = chunk
      .map((p) => Number(p.lon ?? p.lng).toFixed(6))
      .join(",");

    const url = `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Elevation API failed (${response.status})`);
    }

    const data = await response.json();
    const values = Array.isArray(data.elevation) ? data.elevation : [];

    elevations.push(...values.map((value) => Number(value)));
  }

  return elevations;
};

export const enrichPointsWithElevationApi = async (
  points,
  { spacingMeters = 50, smoothingMeters = 70 } = {}
) => {
  if (!points || points.length < 2) return points || [];

  const normalized = points
    .map((point) => ({
      lat: Number(point.lat),
      lon: Number(point.lon ?? point.lng),
      ele: Number.isFinite(Number(point.ele)) ? Number(point.ele) : null,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

  if (normalized.length < 2) return normalized;

  const originalProfile = buildDistanceProfile(normalized);
  const sampled = sampleRouteByDistance(normalized, spacingMeters);
  const sampledElevations = await fetchOpenMeteoElevations(sampled, 100);

  const elevationProfile = sampled
    .map((point, index) => ({
      ...point,
      ele: Number.isFinite(sampledElevations[index])
        ? sampledElevations[index]
        : null,
    }))
    .filter((point) => Number.isFinite(point.ele));

  if (elevationProfile.length < 2) {
    return normalized;
  }

  const enriched = originalProfile.map((point) => ({
    lat: point.lat,
    lon: point.lon,
    ele: interpolateValueAtDistance(
      elevationProfile,
      point.distanceMeters,
      "ele"
    ),
  }));

  return smoothElevationByDistance(
    enriched.map((point, index) => ({
      ...point,
      distanceMeters: originalProfile[index].distanceMeters,
    })),
    smoothingMeters
  ).map((point) => ({
    lat: point.lat,
    lon: point.lon,
    ele: Number.isFinite(point.ele) ? Number(point.ele.toFixed(1)) : null,
  }));
};

const smoothElevationByDistance = (rawProfile, windowMeters = 70) => {
  if (!rawProfile || rawProfile.length === 0) return [];

  return rawProfile.map((point, index) => {
    let total = 0;
    let count = 0;

    for (let i = index; i >= 0; i--) {
      if (point.distanceMeters - rawProfile[i].distanceMeters > windowMeters) break;
      if (Number.isFinite(rawProfile[i].ele)) {
        total += rawProfile[i].ele;
        count += 1;
      }
    }

    for (let i = index + 1; i < rawProfile.length; i++) {
      if (rawProfile[i].distanceMeters - point.distanceMeters > windowMeters) break;
      if (Number.isFinite(rawProfile[i].ele)) {
        total += rawProfile[i].ele;
        count += 1;
      }
    }

    return {
      ...point,
      ele: count ? total / count : point.ele,
    };
  });
};

const calculateRollingGrades = (profile, windowMeters = 120) => {
  if (!profile || profile.length < 2) {
    return { steepestClimb: null, steepestDescent: null };
  }

  const totalDistance = profile[profile.length - 1].distanceMeters || 0;
  if (totalDistance < windowMeters) {
    return { steepestClimb: null, steepestDescent: null };
  }

  let steepestClimb = null;
  let steepestDescent = null;

  for (
    let startMeters = 0;
    startMeters + windowMeters <= totalDistance;
    startMeters += 10
  ) {
    const endMeters = startMeters + windowMeters;
    const startEle = interpolateValueAtDistance(profile, startMeters, "ele");
    const endEle = interpolateValueAtDistance(profile, endMeters, "ele");

    if (!Number.isFinite(startEle) || !Number.isFinite(endEle)) continue;

    const grade = ((endEle - startEle) / windowMeters) * 100;

    if (grade > 0 && (steepestClimb === null || grade > steepestClimb)) {
      steepestClimb = grade;
    }

    if (grade < 0 && (steepestDescent === null || grade < steepestDescent)) {
      steepestDescent = grade;
    }
  }

  return { steepestClimb, steepestDescent };
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

  let distanceMeters = 0;
  let lastKnownElevation = null;

  const rawProfile = normalized.map((point, index) => {
    if (index > 0) {
      distanceMeters += distanceBetween(normalized[index - 1], point);
    }

    if (Number.isFinite(point.ele)) {
      lastKnownElevation = Number(point.ele);
    }

    return {
      distanceMeters,
      distanceKm: distanceMeters / 1000,
      ele: Number.isFinite(lastKnownElevation) ? lastKnownElevation : 0,
      rawEle: Number.isFinite(point.ele) ? Number(point.ele) : null,
      lat: point.lat,
      lon: point.lon,
    };
  });

  const profile = smoothElevationByDistance(rawProfile, 70);

  let elevationGain = 0;
  let elevationLoss = 0;
  let accumulatedClimb = 0;
  let accumulatedDescent = 0;

  for (let i = 1; i < profile.length; i++) {
    const diff = profile[i].ele - profile[i - 1].ele;

    if (diff > 0) {
      accumulatedClimb += diff;

      if (accumulatedDescent >= 2) elevationLoss += accumulatedDescent;
      accumulatedDescent = 0;
    } else if (diff < 0) {
      accumulatedDescent += Math.abs(diff);

      if (accumulatedClimb >= 2) elevationGain += accumulatedClimb;
      accumulatedClimb = 0;
    }
  }

  if (accumulatedClimb >= 2) elevationGain += accumulatedClimb;
  if (accumulatedDescent >= 2) elevationLoss += accumulatedDescent;

  const elevations = profile.map((point) => point.ele);
  const { steepestClimb, steepestDescent } = calculateRollingGrades(profile, 120);

  return {
    distanceKm: Number((distanceMeters / 1000).toFixed(2)),
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    minElevation: Math.round(Math.min(...elevations)),
    maxElevation: Math.round(Math.max(...elevations)),
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
        distanceMeters += distanceBetween(
          {
            lat: Number(previous.lat),
            lon: Number(previous.lon ?? previous.lng),
          },
          { lat, lon }
        );
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
