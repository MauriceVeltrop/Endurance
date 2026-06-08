// app/api/routes/reroute/route.js
import { NextResponse } from "next/server";
import {
  getProviderProfiles,
  getRoutingPreferences,
  getRoutingProvider,
  getSportRouteProfile,
  normalizeSportId,
  SURFACE_LABELS,
  WAYTYPE_LABELS,
} from "../../../../lib/routes/sportRouteProfiles";

export const runtime = "nodejs";

const ORS_ROUTING_BASES = [
  process.env.ORS_API_BASE_URL,
  process.env.OPENROUTE_API_BASE_URL,
  "https://api.openrouteservice.org/v2/directions",
  "https://api.heigit.org/routing/2/directions",
  "https://api.heigit.org/v2/directions",
].filter(Boolean);

const GRAPHHOPPER_ROUTE_URL =
  process.env.GRAPHHOPPER_ROUTE_URL || "https://graphhopper.com/api/1/route";

const PROVIDER_TIMEOUT_MS = 14000;

const ALLOW_GRAPHHOPPER_PLAIN_FOOT_FALLBACK =
  String(process.env.ALLOW_GRAPHHOPPER_PLAIN_FOOT_FALLBACK || "").toLowerCase() === "true";

const DEBUG_GRAPHHOPPER_ROUTING =
  String(process.env.DEBUG_GRAPHHOPPER_ROUTING || "").toLowerCase() === "true";

function logGraphHopperDebug(label, data) {
  if (!DEBUG_GRAPHHOPPER_ROUTING) return;
  try {
    console.log(`[graphhopper:${label}]`, JSON.stringify(data, null, 2));
  } catch (_) {
    console.log(`[graphhopper:${label}]`, data);
  }
}

const GRAPHHOPPER_RUNNING_ALTERNATIVE_ROUTE = {
  // Give GraphHopper real room to return a longer but better paved Running route.
  // max_weight_factor is the actual provider-side detour tolerance; maxDetourFactor
  // in sportRouteProfiles is only used by our quality scoring.
  max_paths: 3,
  max_weight_factor: 2.0,
  max_share_factor: 0.6,
};

function normalizePoint(point) {
  const lat = Number(point?.lat ?? point?.latitude);
  const lon = Number(point?.lon ?? point?.lng ?? point?.longitude);
  const ele = Number(point?.ele ?? point?.elevation);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, ele: Number.isFinite(ele) ? ele : null };
}

function normalizePoints(points) {
  return (Array.isArray(points) ? points : []).map(normalizePoint).filter(Boolean);
}

function orsProviderUrl(base, profile) {
  const cleanBase = String(base || "").replace(/\/+$/, "");
  return `${cleanBase}/${profile}/geojson`;
}

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

function routeAscentMeters(points) {
  let ascent = 0;
  let previous = null;

  for (const point of points) {
    const ele = Number(point.ele);
    if (!Number.isFinite(ele) || ele <= 0) continue;
    if (previous == null) {
      previous = ele;
      continue;
    }

    const diff = ele - previous;
    if (Math.abs(diff) <= 2.5) {
      previous = ele;
      continue;
    }

    if (Math.abs(diff) > 55) {
      continue;
    }

    if (diff > 0) ascent += diff;
    previous = ele;
  }

  return Math.round(ascent);
}

function toPoints(coords) {
  return (Array.isArray(coords) ? coords : [])
    .map((coord) => ({
      lon: Number(coord?.[0]),
      lat: Number(coord?.[1]),
      ele: Number.isFinite(Number(coord?.[2])) ? Number(coord?.[2]) : null,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

function decodeExtraInfo(values, labels) {
  const result = {};
  for (const row of Array.isArray(values) ? values : []) {
    const value = Array.isArray(row) ? row[2] : null;
    const amount = Array.isArray(row) ? Math.max(0, Number(row[1]) - Number(row[0])) : 0;
    const label = labels?.[value] || "unknown";
    result[label] = (result[label] || 0) + amount;
  }
  return result;
}

function decodeGraphHopperDetails(values) {
  const result = {};
  for (const row of Array.isArray(values) ? values : []) {
    const rawValue = Array.isArray(row) ? row[2] : null;
    const amount = Array.isArray(row) ? Math.max(0, Number(row[1]) - Number(row[0])) : 0;
    const label = String(rawValue || "unknown").toLowerCase();
    result[label] = (result[label] || 0) + amount;
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

function scoreOrsCandidate({ feature, points, sportId, profile, preference }) {
  const config = getSportRouteProfile(sportId);
  const geometry = toPoints(feature?.geometry?.coordinates);
  const distance = Number(feature?.properties?.summary?.distance || routeDistanceMeters(geometry));
  const duration = Number(feature?.properties?.summary?.duration || 0);
  const direct = Math.max(1, routeDistanceMeters(points));
  const detour = distance / direct;

  const wayCounts = decodeExtraInfo(feature?.properties?.extras?.waytypes?.values, WAYTYPE_LABELS);
  const surfaceCounts = decodeExtraInfo(feature?.properties?.extras?.surface?.values, SURFACE_LABELS);
  const surfacePercent = percentMap(surfaceCounts);
  const wayPercent = percentMap(wayCounts);

  const suitableSurfaces = new Set(config.suitableSurfaces || []);
  const acceptableSurfaces = new Set(config.acceptableSurfaces || []);
  const unsuitableSurfaces = new Set(config.unsuitableSurfaces || []);
  const suitableWaytypes = new Set(config.suitableWaytypes || []);
  const unsuitableWaytypes = new Set(config.unsuitableWaytypes || []);

  let suitable = 0;
  let acceptable = 0;
  let unsuitable = 0;
  let unknown = 0;

  for (const [surface, pct] of Object.entries(surfacePercent)) {
    if (surface === "unknown" || surface === "missing") {
      unknown += pct;
      unsuitable += Math.round(pct * 0.55);
    } else if (suitableSurfaces.has(surface)) suitable += pct;
    else if (acceptableSurfaces.has(surface)) acceptable += pct;
    else if (unsuitableSurfaces.has(surface)) unsuitable += pct;
  }

  for (const [waytype, pct] of Object.entries(wayPercent)) {
    if (suitableWaytypes.has(waytype)) suitable += Math.round(pct * 0.2);
    if (unsuitableWaytypes.has(waytype)) unsuitable += Math.round(pct * 0.35);
  }

  suitable = Math.min(100, suitable);
  acceptable = Math.min(100, acceptable);
  unsuitable = Math.min(100, unsuitable);

  let score;

  if (normalizeSportId(sportId) === "running") {
    const maxDetour = Number(config.maxDetourFactor || 1.6);
    const pavedBonus = suitable * 1.05;
    const acceptableBonus = acceptable * 0.35;
    const unsuitablePenalty = unsuitable * 1.05;
    const unknownPenalty = unknown * 0.3;
    const detourPenalty = detour <= maxDetour ? Math.max(0, (detour - 1) * 16) : 10 + (detour - maxDetour) * 90;

    score = Math.max(0, Math.min(100, 45 + pavedBonus + acceptableBonus - unsuitablePenalty - unknownPenalty - detourPenalty));
  } else {
    const detourPenalty = Math.max(0, Math.round((detour - 1) * 45));
    const unknownPenalty = Math.round(unknown * 0.35);
    const unsuitablePenalty = Math.round(unsuitable * 0.8);
    score = Math.max(0, Math.min(100, 70 + suitable * 0.45 - detourPenalty - unknownPenalty - unsuitablePenalty));
  }

  return {
    provider: "ors",
    profile,
    preference,
    points: geometry,
    distance,
    duration,
    elevation_gain_m: routeAscentMeters(geometry),
    score: Math.round(score),
    detour,
    surfacePercent,
    wayPercent,
    suitable_percent: suitable,
    unsuitable_percent: unsuitable,
    unknown_percent: unknown,
  };
}

function scoreGraphHopperCandidate({ path, points, sportId, profile, preference, customModelApplied = false }) {
  const config = getSportRouteProfile(sportId);
  const geometry = toPoints(path?.points?.coordinates);
  const distance = Number(path?.distance || routeDistanceMeters(geometry));
  const duration = Number.isFinite(Number(path?.time)) ? Number(path.time) / 1000 : 0;
  const direct = Math.max(1, routeDistanceMeters(points));
  const detour = distance / direct;

  const surfacePercent = percentMap(decodeGraphHopperDetails(path?.details?.surface));
  const roadClassPercent = percentMap(decodeGraphHopperDetails(path?.details?.road_class));
  const roadEnvironmentPercent = percentMap(decodeGraphHopperDetails(path?.details?.road_environment));
  const wayPercent = { ...roadClassPercent, ...roadEnvironmentPercent };

  const suitableSurfaces = new Set(config.suitableSurfaces || []);
  const acceptableSurfaces = new Set(config.acceptableSurfaces || []);
  const unsuitableSurfaces = new Set(config.unsuitableSurfaces || []);
  const preferredRoadClasses = new Set(["footway", "cycleway", "pedestrian", "living_street", "residential"]);
  const poorRoadClasses = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "track", "path", "service", "steps"]);

  let suitable = 0;
  let acceptable = 0;
  let unsuitable = 0;
  let unknown = 0;

  for (const [surface, pct] of Object.entries(surfacePercent)) {
    if (surface === "unknown" || surface === "missing") {
      unknown += pct;
      unsuitable += Math.round(pct * 0.55);
    } else if (suitableSurfaces.has(surface)) suitable += pct;
    else if (acceptableSurfaces.has(surface)) acceptable += pct;
    else if (unsuitableSurfaces.has(surface)) unsuitable += pct;
  }

  for (const [roadClass, pct] of Object.entries(roadClassPercent)) {
    if (preferredRoadClasses.has(roadClass)) suitable += Math.round(pct * 0.25);
    if (poorRoadClasses.has(roadClass)) unsuitable += Math.round(pct * 0.7);
  }

  for (const [environment, pct] of Object.entries(roadEnvironmentPercent)) {
    if (["park", "forest"].includes(environment)) suitable += Math.round(pct * 0.2);
  }

  suitable = Math.min(100, suitable);
  acceptable = Math.min(100, acceptable);
  unsuitable = Math.min(100, unsuitable);

  const maxDetour = Number(config.maxDetourFactor || 1.6);
  const detourPenalty = detour <= maxDetour ? Math.max(0, (detour - 1) * 14) : 10 + (detour - maxDetour) * 85;
  const score = Math.max(
    0,
    Math.min(100, 48 + suitable * 0.9 + acceptable * 0.3 - unsuitable * 0.9 - unknown * 0.15 - detourPenalty)
  );

  return {
    provider: "graphhopper",
    profile,
    preference,
    points: geometry,
    distance,
    duration,
    elevation_gain_m: Number.isFinite(Number(path?.ascend)) ? Math.round(Number(path.ascend)) : routeAscentMeters(geometry),
    score: Math.round(score),
    detour,
    surfacePercent,
    wayPercent,
    suitable_percent: suitable,
    unsuitable_percent: unsuitable,
    unknown_percent: unknown,
    provider_meta: {
      custom_model_applied: Boolean(customModelApplied),
      graphhopper_weight: Number(path?.weight || 0),
      graphhopper_transfers: Number(path?.transfers || 0),
    },
  };
}

async function fetchOrsCandidate({ url, apiKey, points, preference, sportId, profile }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const isRunning = normalizeSportId(sportId) === "running";
    const payload = {
      coordinates: points.map((point) => [point.lon, point.lat]),
      elevation: true,
      instructions: false,
      preference,
      geometry_simplify: false,
      format: "geojson",
      extra_info: ["waytype", "surface"],
    };

    if (isRunning) {
      payload.alternative_routes = {
        target_count: 2,
        weight_factor: 1.6,
        share_factor: 0.55,
      };
    } else {
      payload.alternative_routes = {
        target_count: 2,
        weight_factor: 1.4,
        share_factor: 0.6,
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json, application/geo+json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${response.status} ${text.slice(0, 180)}`);
    }

    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
      .map((feature) => scoreOrsCandidate({ feature, points, sportId, profile, preference }))
      .filter((candidate) => candidate.points.length >= 2);
  } finally {
    clearTimeout(timeout);
  }
}

const RUNNING_CUSTOM_MODEL = {
  // Road-running preset: keep Running routes paved whenever GraphHopper has a reasonable option.
  // Do not set every unpaved surface to 0, otherwise short connector segments can make routing fail.
  distance_influence: 110,
  priority: [
    { if: "road_class == MOTORWAY", multiply_by: "0" },
    { if: "road_class == TRUNK", multiply_by: "0.01" },
    { if: "road_class == PRIMARY", multiply_by: "0.10" },
    { if: "road_class == SECONDARY", multiply_by: "0.28" },
    { if: "road_class == TERTIARY", multiply_by: "0.55" },

    { if: "road_class == FOOTWAY", multiply_by: "3.00" },
    { if: "road_class == CYCLEWAY", multiply_by: "2.50" },
    { if: "road_class == RESIDENTIAL", multiply_by: "2.00" },
    { if: "road_class == LIVING_STREET", multiply_by: "2.00" },
    { if: "road_class == PEDESTRIAN", multiply_by: "1.80" },
    { if: "road_class == SERVICE", multiply_by: "0.35" },
    { if: "road_class == PATH", multiply_by: "0.05" },
    { if: "road_class == TRACK", multiply_by: "0.01" },
    { if: "road_class == STEPS", multiply_by: "0.01" },

    { if: "road_environment == TUNNEL", multiply_by: "0.05" },
    { if: "road_environment == BRIDGE", multiply_by: "0.85" },
    { if: "road_environment == PARK", multiply_by: "1.15" },

    { if: "surface == ASPHALT", multiply_by: "1.70" },
    { if: "surface == CONCRETE", multiply_by: "1.55" },
    { if: "surface == PAVED", multiply_by: "1.45" },
    { if: "surface == PAVING_STONES", multiply_by: "1.25" },
    { if: "surface == COBBLESTONE", multiply_by: "0.45" },
    { if: "surface == MISSING", multiply_by: "0.03" },

    { if: "surface == COMPACTED", multiply_by: "0.08" },
    { if: "surface == FINE_GRAVEL", multiply_by: "0.04" },
    { if: "surface == GRAVEL", multiply_by: "0.02" },
    { if: "surface == UNPAVED", multiply_by: "0.01" },
    { if: "surface == GROUND", multiply_by: "0.01" },
    { if: "surface == DIRT", multiply_by: "0.01" },
    { if: "surface == GRASS", multiply_by: "0.01" },
    { if: "surface == SAND", multiply_by: "0.01" },
    { if: "surface == MUD", multiply_by: "0.01" },
    { if: "surface == WOODCHIPS", multiply_by: "0.01" },
  ],
  speed: [
    { if: "surface == ASPHALT", limit_to: 13 },
    { if: "surface == CONCRETE", limit_to: 12 },
    { if: "surface == PAVED", limit_to: 12 },
    { if: "surface == MISSING", limit_to: 3 },
    { if: "surface == COMPACTED", limit_to: 5 },
    { if: "surface == FINE_GRAVEL", limit_to: 4 },
    { if: "surface == GRAVEL", limit_to: 3 },
    { if: "surface == GROUND", limit_to: 2 },
    { if: "surface == DIRT", limit_to: 2 },
    { if: "surface == GRASS", limit_to: 2 },
    { if: "surface == SAND", limit_to: 2 },
  ],
};

async function fetchGraphHopperCandidate({
  apiKey,
  points,
  sportId,
  profile = "foot",
  preference = "running",
  useCustomModel = true,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const url = `${GRAPHHOPPER_ROUTE_URL}?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      profile,
      points: points.map((point) => [point.lon, point.lat]),
      elevation: true,
      instructions: false,
      calc_points: true,
      points_encoded: false,
      details: ["road_class", "road_environment", "surface"],
    };

    if (normalizeSportId(sportId) === "running") {
      payload.alternative_route = GRAPHHOPPER_RUNNING_ALTERNATIVE_ROUTE;
    }

    if (useCustomModel) {
      payload.custom_model = RUNNING_CUSTOM_MODEL;
    }

    logGraphHopperDebug("request", {
      profile,
      sportId,
      preference,
      useCustomModel,
      pointCount: payload.points.length,
      alternative_route: payload.alternative_route || null,
      details: payload.details,
      custom_model: useCustomModel ? payload.custom_model : null,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logGraphHopperDebug("error", { status: response.status, body: text.slice(0, 1200), useCustomModel });
      throw new Error(`${response.status} ${text.slice(0, 350)}`);
    }

    const data = await response.json();
    const paths = Array.isArray(data?.paths) ? data.paths : [];
    logGraphHopperDebug("response", {
      useCustomModel,
      pathCount: paths.length,
      hints: data?.hints || null,
      firstPath: paths[0]
        ? {
            distance: paths[0].distance,
            time: paths[0].time,
            weight: paths[0].weight,
            details: Object.keys(paths[0].details || {}),
          }
        : null,
    });

    return paths
      .map((path) =>
        scoreGraphHopperCandidate({ path, points, sportId, profile, preference, customModelApplied: useCustomModel })
      )
      .filter((candidate) => candidate.points.length >= 2);
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackResponse({ points, reason = "Routing provider could not snap this segment." }) {
  const distance = routeDistanceMeters(points);
  const ascent = routeAscentMeters(points);
  return NextResponse.json({
    ok: true,
    routed: false,
    error: reason,
    route_points: {
      source: "drawn-segment-fallback",
      points,
      waypoints: points,
      point_count: points.length,
      distance_km: Number((distance / 1000).toFixed(3)),
      elevation_gain_m: ascent,
      routed: false,
      fallback_reason: reason,
      quality: {
        score: 0,
        routed: false,
        message: reason,
      },
      routed_at: new Date().toISOString(),
    },
  });
}

function getOpenRouteServiceApiKey() {
  return (
    process.env.OPENROUTE_API_KEY ||
    process.env.OPENROUTESERVICE_API_KEY ||
    process.env.ORS_API_KEY ||
    process.env.NEXT_PUBLIC_OPENROUTE_API_KEY
  );
}

function getGraphHopperApiKey() {
  return process.env.GRAPHHOPPER_API_KEY || process.env.NEXT_PUBLIC_GRAPHHOPPER_API_KEY;
}

async function collectGraphHopperCandidates({ points, sportId }) {
  const apiKey = getGraphHopperApiKey();
  if (!apiKey) {
    throw new Error("GraphHopper API key is missing.");
  }

  try {
    return await fetchGraphHopperCandidate({
      apiKey,
      points,
      sportId,
      profile: "foot",
      preference: "running-custom",
      useCustomModel: true,
    });
  } catch (error) {
    // Important: do NOT silently continue with plain foot routing, because then the UI
    // looks like GraphHopper is active while all Running Road conditions are ignored.
    // Enable ALLOW_GRAPHHOPPER_PLAIN_FOOT_FALLBACK=true only for emergency testing.
    if (!ALLOW_GRAPHHOPPER_PLAIN_FOOT_FALLBACK) {
      throw new Error(`GraphHopper custom Running model failed: ${error?.message || "unknown error"}`);
    }

    const plainCandidates = await fetchGraphHopperCandidate({
      apiKey,
      points,
      sportId,
      profile: "foot",
      preference: "running-foot-plain-fallback",
      useCustomModel: false,
    });

    if (plainCandidates.length) return plainCandidates;
    throw error;
  }
}

async function collectOrsCandidates({ points, sportId }) {
  const apiKey = getOpenRouteServiceApiKey();
  if (!apiKey) {
    throw new Error("OpenRouteService API key is missing.");
  }

  const profiles = getProviderProfiles(sportId);
  const preferences = getRoutingPreferences(sportId);
  const candidates = [];
  const errors = [];

  for (const profile of profiles) {
    for (const preference of preferences) {
      for (const base of ORS_ROUTING_BASES) {
        try {
          const url = orsProviderUrl(base, profile);
          const result = await fetchOrsCandidate({ url, apiKey, points, preference, sportId, profile });
          candidates.push(...result);
        } catch (error) {
          errors.push(`${profile}/${preference}: ${error?.message || "failed"}`);
        }
      }

      if (candidates.some((candidate) => candidate.score >= 82)) break;
    }

    if (candidates.some((candidate) => candidate.score >= 82)) break;
  }

  if (!candidates.length && errors.length) {
    throw new Error(errors.slice(0, 2).join(" | "));
  }

  return candidates;
}

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const points = normalizePoints(body?.points);
  const sportId = body?.sport_id || body?.sportId || "running";

  if (points.length < 2) {
    return NextResponse.json({ ok: false, error: "At least two points are required." }, { status: 400 });
  }

  // This endpoint is intentionally segment-first. Long routes must be sent as A→B calls.
  const segment = [points[0], points[points.length - 1]];
  const normalizedSportId = normalizeSportId(sportId);
  const provider = getRoutingProvider(normalizedSportId);
  const errors = [];
  let candidates = [];

  if (provider === "graphhopper") {
    try {
      candidates = await collectGraphHopperCandidates({ points: segment, sportId: normalizedSportId });
    } catch (error) {
      errors.push(`graphhopper: ${error?.message || "failed"}`);

      // Keep the routebuilder usable during local setup or if GraphHopper has a temporary outage.
      try {
        candidates = await collectOrsCandidates({ points: segment, sportId: normalizedSportId });
      } catch (orsError) {
        errors.push(`ors-fallback: ${orsError?.message || "failed"}`);
      }
    }
  } else {
    try {
      candidates = await collectOrsCandidates({ points: segment, sportId: normalizedSportId });
    } catch (error) {
      errors.push(`ors: ${error?.message || "failed"}`);
    }
  }

  if (!candidates.length) {
    return fallbackResponse({
      points: segment,
      reason: errors.slice(0, 3).join(" | ") || "Routing provider could not snap this segment.",
    });
  }

  candidates.sort((a, b) => {
    const isRunning = normalizedSportId === "running";

    if (isRunning) {
      // For Running Road, do not let the shortest 1.00x route win when a slightly
      // longer candidate has clearly better surface/waytype quality.
      const unsuitableDiff = Number(a.unsuitable_percent || 0) - Number(b.unsuitable_percent || 0);
      if (Math.abs(unsuitableDiff) >= 8) return unsuitableDiff;

      const unknownDiff = Number(a.unknown_percent || 0) - Number(b.unknown_percent || 0);
      if (Math.abs(unknownDiff) >= 10) return unknownDiff;

      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (Math.abs(scoreDiff) > 3) return scoreDiff;

      return Number(a.distance || 0) - Number(b.distance || 0);
    }

    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 4) return scoreDiff;
    return a.distance - b.distance;
  });

  const best = candidates[0];
  const distance = routeDistanceMeters(best.points);
  const ascent = Number.isFinite(Number(best.elevation_gain_m)) ? Number(best.elevation_gain_m) : routeAscentMeters(best.points);

  return NextResponse.json({
    ok: true,
    routed: true,
    provider: best.provider || provider,
    profile: best.profile,
    preference: best.preference,
    route_points: {
      source: `${best.provider || provider}-segment`,
      provider: best.provider || provider,
      provider_profile: best.profile,
      preference: best.preference,
      points: best.points,
      waypoints: segment,
      point_count: best.points.length,
      distance_km: Number((distance / 1000).toFixed(3)),
      elevation_gain_m: ascent,
      routed: true,
      quality: {
        score: best.score,
        suitable_percent: best.suitable_percent,
        unsuitable_percent: best.unsuitable_percent,
        unknown_percent: best.unknown_percent,
        detour: Number(best.detour.toFixed(2)),
        surfaces: best.surfacePercent,
        waytypes: best.wayPercent,
        candidates: candidates.length,
        alternative_route: normalizedSportId === "running" ? GRAPHHOPPER_RUNNING_ALTERNATIVE_ROUTE : null,
        provider: best.provider || provider,
        provider_meta: best.provider_meta || null,
        custom_model_applied: Boolean(best.provider_meta?.custom_model_applied),
      },
      routed_at: new Date().toISOString(),
    },
  });
}
