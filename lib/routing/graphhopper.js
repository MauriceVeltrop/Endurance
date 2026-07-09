// lib/routing/graphhopper.js

const GRAPHHOPPER_ROUTE_URL = "https://graphhopper.com/api/1/route";
const GRAPHHOPPER_TIMEOUT_MS = 14000;

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeDistanceMeters(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineMeters(points[index - 1], points[index]);
  }
  return total;
}

function toPoint(coord) {
  if (!Array.isArray(coord)) return null;
  const lon = Number(coord[0]);
  const lat = Number(coord[1]);
  const ele = Number(coord[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, ele: Number.isFinite(ele) ? ele : null };
}

function normalizeGhValue(value) {
  return String(value || "unknown").toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function mapRoadClass(value) {
  const roadClass = normalizeGhValue(value);

  if (["footway", "pedestrian", "living_street"].includes(roadClass)) return "footway";
  if (["cycleway"].includes(roadClass)) return "cycleway";
  if (["track"].includes(roadClass)) return "track";
  if (["path"].includes(roadClass)) return "path";
  if (["steps"].includes(roadClass)) return "steps";

  if (["residential", "service", "unclassified"].includes(roadClass)) return "street";
  if (
    [
      "road",
      "primary",
      "primary_link",
      "secondary",
      "secondary_link",
      "tertiary",
      "tertiary_link",
      "trunk",
      "trunk_link",
    ].includes(roadClass)
  ) {
    return "road";
  }

  return roadClass || "unknown";
}

function mapSurface(value) {
  const surface = normalizeGhValue(value);
  if (surface === "sett") return "paving_stones";
  if (surface === "paved") return "paved";
  if (surface === "asphalt") return "asphalt";
  if (surface === "concrete") return "concrete";
  if (surface === "paving_stones") return "paving_stones";
  if (surface === "fine_gravel") return "fine_gravel";
  if (surface === "gravel") return "gravel";
  if (surface === "ground") return "ground";
  if (surface === "sand") return "sand";
  if (surface === "grass") return "grass";
  if (surface === "dirt" || surface === "earth") return "ground";
  if (surface === "missing") return "unknown";
  return surface || "unknown";
}

function decodePathDetails(details, key, mapper, points) {
  const result = {};
  const rows = Array.isArray(details?.[key]) ? details[key] : [];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 3) continue;

    const startIndex = Math.max(0, Number(row[0]) || 0);
    const endIndex = Math.max(startIndex, Number(row[1]) || startIndex);
    const label = mapper(row[2]);

    let meters = 0;
    for (let i = startIndex + 1; i <= endIndex && i < points.length; i += 1) {
      meters += haversineMeters(points[i - 1], points[i]);
    }

    result[label] = (result[label] || 0) + meters;
  }

  return result;
}

function percentMap(counts) {
  const total = Object.values(counts || {}).reduce((sum, value) => sum + Number(value || 0), 0) || 1;
  return Object.fromEntries(
    Object.entries(counts || {})
      .map(([key, value]) => [key, Math.round((Number(value || 0) / total) * 100)])
      .sort((a, b) => b[1] - a[1])
  );
}

function scoreRunningWaytypeOnly({ wayPercent, distance, directDistanceMeters }) {
  const direct = Math.max(1, Number(directDistanceMeters) || 1);
  const detour = Number(distance || 0) / direct;

  const preferredWayBonus = Math.round(
    (Number(wayPercent.footway || 0) + Number(wayPercent.street || 0) + Number(wayPercent.road || 0)) * 0.65
  );
  const cyclewayBonus = Math.round(Number(wayPercent.cycleway || 0) * 0.35);
  const pathPenalty = Math.round(Number(wayPercent.path || 0) * 0.75);
  const stepsPenalty = Math.round(Number(wayPercent.steps || 0) * 1.25);
  const unknownPenalty = Math.round(Number(wayPercent.unknown || 0) * 0.25);
  const detourPenalty = Math.max(0, Math.round((detour - 1) * 45));

  return Math.max(0, Math.min(100, 45 + preferredWayBonus + cyclewayBonus - pathPenalty - stepsPenalty - unknownPenalty - detourPenalty));
}

function buildGraphHopperRequest(points, includeDetails = true) {
  const body = {
    profile: "foot",
    locale: "nl",
    points_encoded: false,
    elevation: true,
    instructions: false,
    calc_points: true,
    points: points.map((point) => [point.lon, point.lat]),
  };

  if (includeDetails) {
    body.details = ["road_class", "surface", "track_type"];
  }

  return body;
}

async function postGraphHopper({ apiKey, body, signal, includeDetails }) {
  const requestSummary = {
    url: GRAPHHOPPER_ROUTE_URL,
    method: "POST",
    profile: body?.profile,
    point_count: Array.isArray(body?.points) ? body.points.length : 0,
    include_details: includeDetails,
    details: body?.details || [],
    key_present: Boolean(apiKey),
  };

  console.log("GraphHopper request", requestSummary);

  let response;

  try {
    response = await fetch(`${GRAPHHOPPER_ROUTE_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    console.error("GraphHopper fetch threw", {
      message: error?.message || "failed",
      name: error?.name || null,
      include_details: includeDetails,
    });
    throw error;
  }

  console.log("GraphHopper response status", {
    status: response.status,
    ok: response.ok,
    include_details: includeDetails,
  });

  const text = await response.text().catch(() => "");

  if (!response.ok) {
    console.error("GraphHopper response error", {
      status: response.status,
      body_preview: text.slice(0, 800),
      include_details: includeDetails,
    });
    throw new Error(`${response.status} ${text.slice(0, 500)}`);
  }

  try {
    const data = JSON.parse(text || "{}");
    console.log("GraphHopper response parsed", {
      paths: Array.isArray(data?.paths) ? data.paths.length : 0,
      info_errors: Array.isArray(data?.info?.errors) ? data.info.errors.length : 0,
      include_details: includeDetails,
    });
    return data;
  } catch (error) {
    console.error("GraphHopper JSON parse failed", {
      message: error?.message || "failed",
      body_preview: text.slice(0, 800),
      include_details: includeDetails,
    });
    throw error;
  }
}

export async function fetchGraphHopperRoute({ points, directDistanceMeters }) {
  const apiKey =
    process.env.GRAPHHOPPER_API_KEY ||
    process.env.NEXT_PUBLIC_GRAPHHOPPER_API_KEY;

  console.log("GraphHopper start", {
    key_present: Boolean(apiKey),
    point_count: Array.isArray(points) ? points.length : 0,
    direct_distance_m: Math.round(Number(directDistanceMeters || 0)),
  });

  if (!apiKey) {
    console.error("GraphHopper missing API key");
    throw new Error("GraphHopper API key is missing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GRAPHHOPPER_TIMEOUT_MS);

  try {
    let data;

    try {
      data = await postGraphHopper({
        apiKey,
        body: buildGraphHopperRequest(points, true),
        signal: controller.signal,
        includeDetails: true,
      });
    } catch (error) {
      console.warn("GraphHopper route with details failed; retrying without details", {
        message: error?.message || "failed",
      });

      data = await postGraphHopper({
        apiKey,
        body: buildGraphHopperRequest(points, false),
        signal: controller.signal,
        includeDetails: false,
      });
    }

    const path = Array.isArray(data?.paths) ? data.paths[0] : null;
    const coordinates = Array.isArray(path?.points?.coordinates) ? path.points.coordinates : [];
    const geometry = coordinates.map(toPoint).filter(Boolean);

    console.log("GraphHopper geometry parsed", {
      paths: Array.isArray(data?.paths) ? data.paths.length : 0,
      raw_coordinate_count: coordinates.length,
      geometry_point_count: geometry.length,
      has_details: Boolean(path?.details),
      detail_keys: path?.details ? Object.keys(path.details) : [],
    });

    if (geometry.length < 2) {
      throw new Error("GraphHopper returned no usable geometry.");
    }

    const distance = Number(path?.distance || routeDistanceMeters(geometry));
    const duration = Number(path?.time || 0) / 1000;
    const details = path?.details || {};

    const surfacePercent = percentMap(decodePathDetails(details, "surface", mapSurface, geometry));
    const wayPercent = percentMap(decodePathDetails(details, "road_class", mapRoadClass, geometry));
    const score = scoreRunningWaytypeOnly({ wayPercent, distance, directDistanceMeters });
    const detour = distance / Math.max(1, Number(directDistanceMeters) || routeDistanceMeters(points));

    const candidate = {
      provider: "graphhopper",
      profile: "foot",
      preference: "recommended",
      points: geometry,
      distance,
      duration,
      elevation_gain_m: Number(path?.ascend || 0),
      score: Math.round(score),
      detour,
      surfacePercent,
      wayPercent,
      suitable_percent: Math.round(
        Number(wayPercent.footway || 0) +
          Number(wayPercent.street || 0) +
          Number(wayPercent.road || 0) +
          Number(wayPercent.cycleway || 0)
      ),
      unsuitable_percent: Math.round(Number(wayPercent.path || 0) + Number(wayPercent.steps || 0)),
      unknown_percent: Math.round(Number(wayPercent.unknown || 0)),
      running_waytype_only_scoring: true,
      graphhopper_baseline: true,
    };

    console.log("GraphHopper candidate built", {
      score: candidate.score,
      distance_km: Number((distance / 1000).toFixed(3)),
      detour: Number(detour.toFixed(2)),
      surfacePercent,
      wayPercent,
    });

    return [candidate];
  } finally {
    clearTimeout(timeout);
  }
}
