// app/api/routes/reroute/route.js
import { NextResponse } from "next/server";
import {
  getProviderProfiles,
  getRoutingPreferences,
  getSportRouteProfile,
  SURFACE_LABELS,
  WAYTYPE_LABELS,
} from "../../../../lib/routes/sportRouteProfiles";

export const runtime = "nodejs";

const ROUTING_BASES = [
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

function providerUrl(base, profile) {
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

function percentMap(counts) {
  const total = Object.values(counts || {}).reduce((sum, value) => sum + Number(value || 0), 0) || 1;
  return Object.fromEntries(
    Object.entries(counts || {})
      .map(([key, value]) => [key, Math.round((Number(value || 0) / total) * 100)])
      .sort((a, b) => b[1] - a[1])
  );
}

function scoreCandidate({ feature, points, sportId, profile, preference }) {
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
  const unsuitableSurfaces = new Set(config.unsuitableSurfaces || []);
  const suitableWaytypes = new Set(config.suitableWaytypes || []);
  const unsuitableWaytypes = new Set(config.unsuitableWaytypes || []);

  let suitable = 0;
  let unsuitable = 0;
  let unknown = 0;

  for (const [surface, pct] of Object.entries(surfacePercent)) {
    if (surface === "unknown") unknown += pct;
    else if (suitableSurfaces.has(surface)) suitable += pct;
    else if (unsuitableSurfaces.has(surface)) unsuitable += pct;
  }

  for (const [waytype, pct] of Object.entries(wayPercent)) {
    if (suitableWaytypes.has(waytype)) suitable += Math.round(pct * 0.35);
    if (unsuitableWaytypes.has(waytype)) unsuitable += Math.round(pct * 0.45);
  }

  suitable = Math.min(100, suitable);
  unsuitable = Math.min(100, unsuitable);

  const detourPenalty = Math.max(0, Math.round((detour - 1) * 45));
  const unknownPenalty = Math.round(unknown * 0.35);
  const unsuitablePenalty = Math.round(unsuitable * 0.8);
  const score = Math.max(0, Math.min(100, 70 + suitable * 0.45 - detourPenalty - unknownPenalty - unsuitablePenalty));

  return {
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

async function fetchCandidate({ url, apiKey, points, preference, sportId, profile }) {
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
      alternative_routes: {
        target_count: 2,
        weight_factor: 1.4,
        share_factor: 0.6,
      },
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
      throw new Error(`${response.status} ${text.slice(0, 180)}`);
    }

    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
      .map((feature) => scoreCandidate({ feature, points, sportId, profile, preference }))
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

  const apiKey =
    process.env.OPENROUTE_API_KEY ||
    process.env.OPENROUTESERVICE_API_KEY ||
    process.env.ORS_API_KEY ||
    process.env.NEXT_PUBLIC_OPENROUTE_API_KEY;

  if (!apiKey) {
    return fallbackResponse({ points: segment, reason: "Routing key is missing." });
  }

  const profiles = getProviderProfiles(sportId);
  const preferences = getRoutingPreferences(sportId);
  const errors = [];
  const candidates = [];

  for (const profile of profiles) {
    for (const preference of preferences) {
      for (const base of ROUTING_BASES) {
        try {
          const url = providerUrl(base, profile);
          const result = await fetchCandidate({ url, apiKey, points: segment, preference, sportId, profile });
          candidates.push(...result);
        } catch (error) {
          errors.push(`${profile}/${preference}: ${error?.message || "failed"}`);
        }
      }

      // Avoid too many provider calls when we already have a good segment.
      if (candidates.some((candidate) => candidate.score >= 82)) break;
    }

    if (candidates.some((candidate) => candidate.score >= 82)) break;
  }

  if (!candidates.length) {
    return fallbackResponse({
      points: segment,
      reason: errors.slice(0, 2).join(" | ") || "Routing provider could not snap this segment.",
    });
  }

  candidates.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 4) return scoreDiff;
    return a.distance - b.distance;
  });

  const best = candidates[0];
  const distance = routeDistanceMeters(best.points);
  const ascent = routeAscentMeters(best.points);

  return NextResponse.json({
    ok: true,
    routed: true,
    profile: best.profile,
    preference: best.preference,
    route_points: {
      source: "ors-segment",
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
      },
      routed_at: new Date().toISOString(),
    },
  });
}
