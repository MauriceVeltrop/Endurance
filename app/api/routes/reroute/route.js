// app/api/routes/reroute/route.js
import { NextResponse } from "next/server";
import { calculateRouteMetrics } from "../../../../lib/routeMetrics";
import {
  getProviderProfiles,
  getRoutingPreferences,
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

const PROVIDER_TIMEOUT_MS = 14000;

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
  const metrics = calculateRouteMetrics(points);
  return Math.round(Number(metrics.elevation_gain_m || 0));
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

function decodeExtraInfo(values, labels, geometryPoints = []) {
  const result = {};
  for (const row of Array.isArray(values) ? values : []) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const startIndex = Math.max(0, Number(row[0]) || 0);
    const endIndex = Math.max(startIndex, Number(row[1]) || startIndex);
    const value = row[2];
    let meters = 0;
    for (let i = startIndex + 1; i <= endIndex && i < geometryPoints.length; i += 1) {
      meters += haversineMeters(geometryPoints[i - 1], geometryPoints[i]);
    }
    const label = labels?.[value] || "unknown";
    result[label] = (result[label] || 0) + meters;
  }
  return result;
}

function decodeExtraSummary(summary, labels) {
  const result = {};
  for (const item of Array.isArray(summary) ? summary : []) {
    const label = labels?.[item?.value] || "unknown";
    const meters = Number(item?.distance) || 0;
    result[label] = (result[label] || 0) + meters;
  }
  return result;
}

function getOrsExtra(extra, keys = []) {
  for (const key of keys) {
    if (extra?.[key]) return extra[key];
  }
  return null;
}

function buildOrsExtraBreakdown(extra, labels, geometryPoints = []) {
  if (!extra) return {};
  const fromSummary = decodeExtraSummary(extra.summary, labels);
  const summaryTotal = Object.values(fromSummary).reduce((sum, value) => sum + (Number(value) || 0), 0);
  if (summaryTotal > 0) return fromSummary;
  return decodeExtraInfo(extra.values, labels, geometryPoints);
}

function percentMap(counts) {
  const total = Object.values(counts || {}).reduce((sum, value) => sum + Number(value || 0), 0) || 1;
  return Object.fromEntries(
    Object.entries(counts || {})
      .map(([key, value]) => [key, Math.round((Number(value || 0) / total) * 100)])
      .sort((a, b) => b[1] - a[1])
  );
}

function scoreOrsCandidate({ feature, points, sportId, profile, preference, directDistanceMeters }) {
  const config = getSportRouteProfile(sportId);
  const normalizedSportId = normalizeSportId(sportId);
  const geometry = toPoints(feature?.geometry?.coordinates);
  const distance = Number(feature?.properties?.summary?.distance || routeDistanceMeters(geometry));
  const duration = Number(feature?.properties?.summary?.duration || 0);
  const direct = Math.max(1, Number(directDistanceMeters) || routeDistanceMeters(points));
  const detour = distance / direct;

  const extras = feature?.properties?.extras || {};
  const wayCounts = buildOrsExtraBreakdown(
    getOrsExtra(extras, ["waytype", "waytypes", "way_type", "way_types"]),
    WAYTYPE_LABELS,
    geometry
  );
  const surfaceCounts = buildOrsExtraBreakdown(
    getOrsExtra(extras, ["surface", "surfaces"]),
    SURFACE_LABELS,
    geometry
  );

  const surfacePercent = percentMap(surfaceCounts);
  const wayPercent = percentMap(wayCounts);

  let suitable = 0;
  let acceptable = 0;
  let unsuitable = 0;
  let unknown = 0;

  const suitableSurfaces = new Set(config.suitableSurfaces || []);
  const acceptableSurfaces = new Set(config.acceptableSurfaces || []);
  const unsuitableSurfaces = new Set(config.unsuitableSurfaces || []);
  const suitableWaytypes = new Set(config.suitableWaytypes || []);
  const acceptableWaytypes = new Set(config.acceptableWaytypes || []);
  const unsuitableWaytypes = new Set(config.unsuitableWaytypes || []);

  if (normalizedSportId !== "running") {
    for (const [surface, pct] of Object.entries(surfacePercent)) {
      if (surface === "unknown" || surface === "missing") unknown += pct;
      else if (suitableSurfaces.has(surface)) suitable += pct;
      else if (acceptableSurfaces.has(surface)) acceptable += pct;
      else if (unsuitableSurfaces.has(surface)) unsuitable += pct;
    }
  }

  for (const [waytype, pct] of Object.entries(wayPercent)) {
    if (waytype === "unknown" || waytype === "missing") unknown += normalizedSportId === "running" ? pct : Math.round(pct * 0.15);
    else if (suitableWaytypes.has(waytype)) suitable += normalizedSportId === "running" ? pct : Math.round(pct * 0.2);
    else if (acceptableWaytypes.has(waytype)) acceptable += normalizedSportId === "running" ? pct : Math.round(pct * 0.2);
    else if (unsuitableWaytypes.has(waytype)) unsuitable += normalizedSportId === "running" ? pct : Math.round(pct * 0.25);
  }

  suitable = Math.min(100, suitable);
  acceptable = Math.min(100, acceptable);
  unsuitable = Math.min(100, unsuitable);
  unknown = Math.min(100, unknown);

  const detourPenalty = Math.max(0, Math.round((detour - 1) * 45));
  const unknownPenalty = Math.round(unknown * 0.25);
  const unsuitablePenalty = Math.round(unsuitable * 0.8);

  let score = 70 + suitable * 0.45 + acceptable * 0.12 - detourPenalty - unknownPenalty - unsuitablePenalty;

  if (normalizedSportId === "running") {
    const preferredWayBonus = Math.round(
      (Number(wayPercent.footway || 0) + Number(wayPercent.street || 0) + Number(wayPercent.road || 0)) * 0.65
    );
    const cyclewayBonus = Math.round(Number(wayPercent.cycleway || 0) * 0.35);
    const pathPenalty = Math.round(Number(wayPercent.path || 0) * 0.75);
    const stepsPenalty = Math.round(Number(wayPercent.steps || 0) * 1.25);

    score = 45 + preferredWayBonus + cyclewayBonus - pathPenalty - stepsPenalty - unknownPenalty - detourPenalty;
  }

  score = Math.max(0, Math.min(100, score));

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
    suitable_percent: Math.round(suitable),
    unsuitable_percent: Math.round(unsuitable),
    unknown_percent: Math.round(unknown),
    running_waytype_only_scoring: normalizedSportId === "running",
  };
}

async function fetchOrsCandidate({ url, apiKey, points, preference, sportId, profile, directDistanceMeters }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const payload = {
      coordinates: points.map((point) => [point.lon, point.lat]),
      elevation: true,
      instructions: false,
      preference,
      geometry_simplify: false,
      format: "geojson",
      extra_info: ["waytype", "surface"],
    };

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
      console.error("ORS route error", { status: response.status, body: text.slice(0, 800), profile, preference });
      throw new Error(`${response.status} ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
      .map((feature) => scoreOrsCandidate({ feature, points, sportId, profile, preference, directDistanceMeters }))
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

async function collectOrsCandidates({ points, sportId, directDistanceMeters }) {
  const apiKey = getOpenRouteServiceApiKey();
  if (!apiKey) throw new Error("OpenRouteService API key is missing.");

  const profiles = getProviderProfiles(sportId);
  const preferences = getRoutingPreferences(sportId);
  const bases = normalizeSportId(sportId) === "running" ? ORS_ROUTING_BASES.slice(0, 1) : ORS_ROUTING_BASES;
  const candidates = [];
  const errors = [];

  for (const profile of profiles) {
    for (const preference of preferences) {
      for (const base of bases) {
        if (!profile || !preference || !base) continue;
        try {
          const url = orsProviderUrl(base, profile);
          const result = await fetchOrsCandidate({ url, apiKey, points, preference, sportId, profile, directDistanceMeters });
          candidates.push(...result);
        } catch (error) {
          errors.push(`${profile}/${preference}: ${error?.message || "failed"}`);
        }
      }
    }
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
  const normalizedSportId = normalizeSportId(sportId);

  if (points.length < 2) {
    return NextResponse.json({ ok: false, error: "At least two points are required." }, { status: 400 });
  }

  const segment = [points[0], points[points.length - 1]];
  const originalDirectDistanceMeters = routeDistanceMeters(segment);
  const errors = [];
  let candidates = [];

  try {
    candidates = await collectOrsCandidates({
      points: segment,
      sportId: normalizedSportId,
      directDistanceMeters: originalDirectDistanceMeters,
    });
  } catch (error) {
    errors.push(`ors: ${error?.message || "failed"}`);
  }

  if (!candidates.length) {
    return fallbackResponse({
      points: segment,
      reason: errors.slice(0, 3).join(" | ") || "Routing provider could not snap this segment.",
    });
  }

  candidates.sort((a, b) => {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (Math.abs(scoreDiff) > (normalizedSportId === "running" ? 2 : 4)) return scoreDiff;
    return Number(a.distance || 0) - Number(b.distance || 0);
  });

  const best = candidates[0];
  const candidateSummary = candidates.slice(0, 8).map((candidate) => ({
    provider: candidate.provider || "ors",
    profile: candidate.profile,
    preference: candidate.preference,
    score: candidate.score,
    distance_km: Number((Number(candidate.distance || 0) / 1000).toFixed(3)),
    detour: Number(Number(candidate.detour || 0).toFixed(2)),
    suitable_percent: candidate.suitable_percent,
    unsuitable_percent: candidate.unsuitable_percent,
    unknown_percent: candidate.unknown_percent,
    running_waytype_only_scoring: candidate.running_waytype_only_scoring,
    path_percent: Math.round(Number(candidate?.wayPercent?.path || 0)),
    track_percent: Math.round(Number(candidate?.wayPercent?.track || 0)),
    surfaces: candidate.surfacePercent,
    waytypes: candidate.wayPercent,
  }));

  if (process.env.DEBUG_ORS_ROUTING === "true") {
    console.log("ORS route candidates", { sportId: normalizedSportId, candidateSummary });
  }

  const distance = routeDistanceMeters(best.points);
  const ascent = Number.isFinite(Number(best.elevation_gain_m)) ? Number(best.elevation_gain_m) : routeAscentMeters(best.points);

  return NextResponse.json({
    ok: true,
    routed: true,
    provider: best.provider || "ors",
    profile: best.profile,
    preference: best.preference,
    route_points: {
      source: `${best.provider || "ors"}-segment`,
      provider: best.provider || "ors",
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
        candidate_summary: candidateSummary,
        provider: best.provider || "ors",
        running_waytype_only_scoring: normalizedSportId === "running",
        path_percent: Math.round(Number(best?.wayPercent?.path || 0)),
        track_percent: Math.round(Number(best?.wayPercent?.track || 0)),
        message:
          normalizedSportId === "running"
            ? "Running waytype-only scoring: footway, street, road and cycleway are rewarded; path and steps are penalized. Track is neutral. Surface is reported but not used for scoring."
            : undefined,
      },
      routed_at: new Date().toISOString(),
    },
  });
}
