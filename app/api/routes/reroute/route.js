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


function destinationPoint(start, bearingDegrees, distanceMeters) {
  const R = 6371000;
  const bearing = (Number(bearingDegrees) * Math.PI) / 180;
  const lat1 = (Number(start.lat) * Math.PI) / 180;
  const lon1 = (Number(start.lon) * Math.PI) / 180;
  const angular = Number(distanceMeters) / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: Number(((lat2 * 180) / Math.PI).toFixed(6)),
    lon: Number((((lon2 * 180) / Math.PI + 540) % 360 - 180).toFixed(6)),
    ele: null,
  };
}

function bearingDegrees(a, b) {
  const lat1 = (Number(a.lat) * Math.PI) / 180;
  const lat2 = (Number(b.lat) * Math.PI) / 180;
  const dLon = ((Number(b.lon) - Number(a.lon)) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function midpoint(a, b) {
  return {
    lat: (Number(a.lat) + Number(b.lat)) / 2,
    lon: (Number(a.lon) + Number(b.lon)) / 2,
    ele: null,
  };
}

function runningTrackPathPercent(candidate = {}) {
  return Number(candidate.suspicious_track_path_percent ?? candidate.track_path_percent ?? 0);
}

function runningEffectivePavedPercent(candidate = {}) {
  return Math.max(
    Number(candidate.paved_percent || 0),
    Number(candidate.paved_footway_priority || 0)
  );
}

function runningCandidateIsValid(candidate = {}) {
  const detour = Number(candidate.detour || 99);
  const trackPath = runningTrackPathPercent(candidate);
  const effectivePaved = runningEffectivePavedPercent(candidate);
  const badSurface = Number(candidate.bad_surface_percent || 0);

  if (detour > 1.6) return false;

  // Hard Running acceptance rule:
  // reject track/path-heavy shortcuts unless the candidate is overwhelmingly
  // paved/footway. This prevents a forest/track shortcut from winning merely
  // because it contains some asphalt or is shorter.
  return (
    trackPath <= 20 ||
    (effectivePaved >= 75 && badSurface <= 18)
  );
}

function runningCandidateIsBad(candidate = {}) {
  return (
    !runningCandidateIsValid(candidate) ||
    Number(candidate.score || 0) < 45
  );
}

function runningCandidateIsPavedChoice(candidate = {}) {
  return runningCandidateIsValid(candidate);
}

function shouldTryRunningPavedCorridor(candidates = []) {
  const runningCandidates = Array.isArray(candidates) ? candidates : [];
  if (!runningCandidates.length) return true;
  if (runningCandidates.some(runningCandidateIsPavedChoice)) return false;
  return runningCandidateIsBad(runningCandidates[0]);
}

function buildRunningCorridorWaypoints(segment, routingMode = "live") {
  const start = segment?.[0];
  const finish = segment?.[1];
  if (!start || !finish) return [];

  const directMeters = routeDistanceMeters(segment);
  if (!Number.isFinite(directMeters) || directMeters < 250) return [];

  const mid = midpoint(start, finish);
  const bearing = bearingDegrees(start, finish);
  const perpendiculars = [(bearing + 90) % 360, (bearing + 270) % 360];
  const baseOffset = Math.max(350, Math.min(1300, directMeters * 0.22));
  const offsets = routingMode === "live" ? [baseOffset] : [baseOffset, Math.min(1800, baseOffset * 1.55)];

  const waypointSets = [];
  for (const offset of offsets) {
    for (const perpendicular of perpendiculars) {
      const via = destinationPoint(mid, perpendicular, offset);
      waypointSets.push([start, via, finish]);
    }
  }

  return waypointSets;
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

    for (
      let i = startIndex + 1;
      i <= endIndex && i < geometryPoints.length;
      i += 1
    ) {
      meters += haversineMeters(
        geometryPoints[i - 1],
        geometryPoints[i]
      );
    }

    const label = labels?.[value] || "unknown";
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

function scoreOrsCandidate({ feature, points, sportId, profile, preference, directDistanceMeters }) {
  const config = getSportRouteProfile(sportId);
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

  const suitableSurfaces = new Set(config.suitableSurfaces || []);
  const acceptableSurfaces = new Set(config.acceptableSurfaces || []);
  const unsuitableSurfaces = new Set(config.unsuitableSurfaces || []);
  const suitableWaytypes = new Set(config.suitableWaytypes || []);
  const acceptableWaytypes = new Set(config.acceptableWaytypes || []);
  const unsuitableWaytypes = new Set(config.unsuitableWaytypes || []);

  let surfaceSuitable = 0;
  let surfaceAcceptable = 0;
  let surfaceUnsuitable = 0;
  let surfaceUnknown = 0;

  for (const [surface, pct] of Object.entries(surfacePercent)) {
    if (surface === "unknown" || surface === "missing") surfaceUnknown += pct;
    else if (suitableSurfaces.has(surface)) surfaceSuitable += pct;
    else if (acceptableSurfaces.has(surface)) surfaceAcceptable += pct;
    else if (unsuitableSurfaces.has(surface)) surfaceUnsuitable += pct;
  }

  let waySuitable = 0;
  let wayAcceptable = 0;
  let wayUnsuitable = 0;
  let wayUnknown = 0;

  for (const [waytype, pct] of Object.entries(wayPercent)) {
    if (waytype === "unknown" || waytype === "missing") wayUnknown += pct;
    else if (suitableWaytypes.has(waytype)) waySuitable += pct;
    else if (acceptableWaytypes.has(waytype)) wayAcceptable += pct;
    else if (unsuitableWaytypes.has(waytype)) wayUnsuitable += pct;
  }

  let suitable = 0;
  let acceptable = 0;
  let unsuitable = 0;
  let unknown = 0;
  let score;

  if (normalizeSportId(sportId) === "running") {
    // Diagnostic baseline for Running:
    // quality is informational only and must not influence route choice.
    // ORS shortest foot-walking decides the route.
    suitable = 100;
    acceptable = 0;
    unsuitable = 0;
    unknown = 0;
    score = 100;
  } else {
    suitable = Math.min(100, surfaceSuitable + Math.round(waySuitable * 0.2));
    acceptable = Math.min(100, surfaceAcceptable);
    unsuitable = Math.min(100, surfaceUnsuitable + Math.round(wayUnsuitable * 0.35));
    unknown = Math.min(100, surfaceUnknown);

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
    suitable_percent: Math.round(suitable),
    unsuitable_percent: Math.round(unsuitable),
    unknown_percent: Math.round(unknown),
    bad_surface_percent: normalizeSportId(sportId) === "running" ? Math.round(
      Number(surfacePercent.mud || 0)
      + Number(surfacePercent.dirt || 0)
      + Number(surfacePercent.ground || 0)
      + Number(surfacePercent.earth || 0)
      + Number(surfacePercent.grass || 0)
      + Number(surfacePercent.sand || 0)
      + Number(surfacePercent.unpaved || 0)
      + Number(surfacePercent.gravel || 0)
    ) : null,
    track_path_percent: normalizeSportId(sportId) === "running" ? Math.round(Number(wayPercent.track || 0) + Number(wayPercent.path || 0)) : null,
    suspicious_track_path_percent: normalizeSportId(sportId) === "running" ? Math.round(Number(wayPercent.suspicious_track_path || 0)) : null,
    paved_percent: normalizeSportId(sportId) === "running" ? Math.round(Number(surfacePercent.effective_paved || 0)) : null,
    raw_paved_percent: normalizeSportId(sportId) === "running" ? Math.round(
      Number(surfacePercent.asphalt || 0)
      + Number(surfacePercent.concrete || 0)
      + Number(surfacePercent.paved || 0)
      + Number(surfacePercent.paving_stones || 0)
      + Number(surfacePercent.sett || 0)
    ) : null,
    inferred_paved_unknown_percent: normalizeSportId(sportId) === "running" ? Math.round(Number(surfacePercent.inferred_paved_unknown || 0)) : null,
    safe_way_percent: normalizeSportId(sportId) === "running" ? Math.round(
      Number(wayPercent.footway || 0)
      + Number(wayPercent.pedestrian || 0)
      + Number(wayPercent.cycleway || 0)
      + Number(wayPercent.living_street || 0)
      + Number(wayPercent.residential || 0)
      + Number(wayPercent.street || 0)
    ) : null,
    paved_footway_priority: normalizeSportId(sportId) === "running" ? Math.round(
      Number(surfacePercent.effective_paved || 0)
      + (Number(wayPercent.footway || 0) + Number(wayPercent.pedestrian || 0)) * 1.05
      + Number(wayPercent.cycleway || 0) * 0.75
      + (Number(wayPercent.living_street || 0)
        + Number(wayPercent.residential || 0)
        + Number(wayPercent.street || 0)) * 0.35
    ) : null,
  };
}



async function fetchOrsCandidate({ url, apiKey, points, preference, sportId, profile, directDistanceMeters, routeKind = "direct", viaIndex = null, debugCollector = null }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  const startedAt = Date.now();
  const debugEntry = {
    profile,
    preference,
    route_kind: routeKind,
    via_index: viaIndex,
    coordinate_count: Array.isArray(points) ? points.length : 0,
    alternative_routes_requested: false,
  };

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

    const config = getSportRouteProfile(sportId);
    const maxDetour = Number(config.maxDetourFactor || (isRunning ? 1.4 : 1.4));

    if (isRunning) {
      // Diagnostic baseline for Running:
      // no alternative search, no avoid_features, no corridor steering.
      // Let ORS return the shortest legal foot-walking route between A and B.
    } else {
      payload.alternative_routes = {
        target_count: 2,
        weight_factor: Math.max(1.05, maxDetour),
        share_factor: 0.6,
      };
      debugEntry.alternative_routes_requested = true;
      debugEntry.alternative_routes = payload.alternative_routes;
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

    debugEntry.status = response.status;
    debugEntry.ok = response.ok;

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      debugEntry.error = text.slice(0, 500);
      console.error("ORS route error", { status: response.status, body: text.slice(0, 800), profile, preference });
      throw new Error(`${response.status} ${text.slice(0, 300)}`);
    }

    const data = await response.json();

    const features = Array.isArray(data?.features) ? data.features : [];
    const scored = features
      .map((feature) => ({
        ...scoreOrsCandidate({ feature, points, sportId, profile, preference, directDistanceMeters }),
        route_kind: routeKind,
        via_index: viaIndex,
      }))
      .filter((candidate) => candidate.points.length >= 2);

    debugEntry.feature_count = features.length;
    debugEntry.candidate_count = scored.length;
    debugEntry.geometry_points = scored.map((candidate) => candidate.points?.length || 0);
    debugEntry.duration_ms = Date.now() - startedAt;
    return scored;
  } catch (error) {
    debugEntry.duration_ms = Date.now() - startedAt;
    debugEntry.error = error?.message || "failed";
    throw error;
  } finally {
    if (Array.isArray(debugCollector)) debugCollector.push(debugEntry);
    clearTimeout(timeout);
  }
}


function fallbackResponse({ points, reason = "Routing provider could not snap this segment.", debug = null }) {
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
        debug,
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


async function collectOrsCandidates({ points, sportId, routingMode = "quality", directDistanceMeters, debugCollector = null }) {
  const apiKey = getOpenRouteServiceApiKey();
  if (!apiKey) {
    throw new Error("OpenRouteService API key is missing.");
  }

  const isRunningBaseline = normalizeSportId(sportId) === "running";
  const profiles = isRunningBaseline ? ["foot-walking"] : getProviderProfiles(sportId);
  const preferences = isRunningBaseline ? ["shortest"] : getRoutingPreferences(sportId);
  const candidates = [];
  const errors = [];


  if (routingMode === "live") {
    const isRunning = normalizeSportId(sportId) === "running";

    const liveProfiles = isRunning ? ["foot-walking"] : profiles.slice(0, 1);
    const livePreferences = isRunning ? ["shortest"] : preferences.slice(0, 1);
    const liveBases = ORS_ROUTING_BASES.slice(0, 1);

    for (const profile of liveProfiles) {
      for (const preference of livePreferences) {
        for (const base of liveBases) {
          if (!profile || !preference || !base) continue;
          try {
            const url = orsProviderUrl(base, profile);
            const result = await fetchOrsCandidate({ url, apiKey, points, preference, sportId, profile, directDistanceMeters, debugCollector });
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

  for (const profile of profiles) {
    for (const preference of preferences) {
      for (const base of (isRunningBaseline ? ORS_ROUTING_BASES.slice(0, 1) : ORS_ROUTING_BASES)) {
        try {
          const url = orsProviderUrl(base, profile);
          const result = await fetchOrsCandidate({ url, apiKey, points, preference, sportId, profile, directDistanceMeters, debugCollector });
          candidates.push(...result);
        } catch (error) {
          errors.push(`${profile}/${preference}: ${error?.message || "failed"}`);
        }
      }

      // Do not stop early for Running. A high-scoring first candidate can still
      // hide a much better paved alternative from another preference/base.
      // Collect all candidates first, then sort by quality inside the detour limit.
    }
  }

  if (!candidates.length && errors.length) {
    throw new Error(errors.slice(0, 2).join(" | "));
  }

  return candidates;
}


async function collectRunningPavedCorridorCandidates({ segment, sportId, routingMode = "live", directDistanceMeters, debugCollector = null }) {
  const apiKey = getOpenRouteServiceApiKey();
  if (!apiKey) return [];

  const base = ORS_ROUTING_BASES[0];
  if (!base) return [];

  const waypointSets = buildRunningCorridorWaypoints(segment, routingMode);
  const preferences = routingMode === "live" ? ["recommended"] : ["recommended", "shortest"];
  const candidates = [];
  let viaIndex = 0;

  for (const viaPoints of waypointSets) {
    viaIndex += 1;
    for (const preference of preferences) {
      try {
        const url = orsProviderUrl(base, "foot-walking");
        const result = await fetchOrsCandidate({
          url,
          apiKey,
          points: viaPoints,
          preference,
          sportId,
          profile: "foot-walking",
          directDistanceMeters,
          routeKind: "paved-corridor-via",
          viaIndex,
          debugCollector,
        });
        candidates.push(...result);
      } catch (_) {
        // Corridor fallback is opportunistic. If one via-point fails, keep the
        // direct ORS candidates rather than blocking live drawing.
      }
    }
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
  const routingMode = body?.mode || "quality";

  if (points.length < 2) {
    return NextResponse.json({ ok: false, error: "At least two points are required." }, { status: 400 });
  }

  // This endpoint is intentionally segment-first. Long routes must be sent as A→B calls.
  const segment = [points[0], points[points.length - 1]];
  const originalDirectDistanceMeters = routeDistanceMeters(segment);
  const normalizedSportId = normalizeSportId(sportId);
  const provider = "ors";
  const errors = [];
  const requestDebug = [];
  let candidates = [];

  try {
    candidates = await collectOrsCandidates({
      points: segment,
      sportId: normalizedSportId,
      routingMode,
      directDistanceMeters: originalDirectDistanceMeters,
      debugCollector: requestDebug,
    });
  } catch (error) {
    errors.push(`ors: ${error?.message || "failed"}`);
  }

  if (!candidates.length) {
    return fallbackResponse({
      points: segment,
      reason: errors.slice(0, 3).join(" | ") || "Routing provider could not snap this segment.",
      debug: {
        mode: routingMode,
        requested_profiles: normalizedSportId === "running" ? ["foot-walking"] : getProviderProfiles(normalizedSportId),
        requested_preferences: normalizedSportId === "running" ? ["shortest"] : getRoutingPreferences(normalizedSportId),
        request_count: requestDebug.length,
        errors,
        requests: requestDebug,
        candidates_before_selection: 0,
      },
    });
  }


  candidates.sort((a, b) => {
    const isRunning = normalizedSportId === "running";

    if (isRunning) {
      // Diagnostic baseline for Running:
      // no Endurance quality preferences. Take the shortest ORS foot-walking
      // candidate between A and B.
      return Number(a.distance || 0) - Number(b.distance || 0);
    }

    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 4) return scoreDiff;
    return a.distance - b.distance;
  });

  const best = candidates[0];
  const candidateSummary = candidates.slice(0, 8).map((candidate) => ({
    provider: candidate.provider || provider,
    profile: candidate.profile,
    preference: candidate.preference,
    score: candidate.score,
    distance_km: Number((Number(candidate.distance || 0) / 1000).toFixed(3)),
    detour: Number(Number(candidate.detour || 0).toFixed(2)),
    suitable_percent: candidate.suitable_percent,
    unsuitable_percent: candidate.unsuitable_percent,
    unknown_percent: candidate.unknown_percent,
    bad_surface_percent: candidate.bad_surface_percent,
    track_path_percent: candidate.track_path_percent,
    suspicious_track_path_percent: candidate.suspicious_track_path_percent,
    paved_percent: candidate.paved_percent,
    raw_paved_percent: candidate.raw_paved_percent,
    inferred_paved_unknown_percent: candidate.inferred_paved_unknown_percent,
    safe_way_percent: candidate.safe_way_percent,
    paved_footway_priority: candidate.paved_footway_priority,
    route_kind: candidate.route_kind,
    via_index: candidate.via_index,
    surfaces: candidate.surfacePercent,
    waytypes: candidate.wayPercent,
  }));

  if (process.env.DEBUG_ORS_ROUTING === "true") {
    console.log("ORS route candidates", { sportId: normalizedSportId, candidateSummary });
  }

  const distance = routeDistanceMeters(best.points);
  const ascent = Number.isFinite(Number(best.elevation_gain_m)) ? Number(best.elevation_gain_m) : routeAscentMeters(best.points);
  const apiDebug = {
    mode: routingMode,
    requested_profiles: normalizedSportId === "running" ? ["foot-walking"] : getProviderProfiles(normalizedSportId),
    requested_preferences: normalizedSportId === "running" ? ["shortest"] : getRoutingPreferences(normalizedSportId),
    request_count: requestDebug.length,
    errors,
    requests: requestDebug,
    candidate_count_after_filter: candidates.length,
    selected_candidate: {
      profile: best.profile,
      preference: best.preference,
      score: best.score,
      detour: Number(best.detour || 0),
      distance_km: Number((Number(best.distance || 0) / 1000).toFixed(3)),
      geometry_points: best.points?.length || 0,
      surfaces: best.surfacePercent,
      waytypes: best.wayPercent,
    },
  };

  return NextResponse.json({
    ok: true,
    routed: true,
    provider: best.provider || provider,
    profile: best.profile,
    preference: best.preference,
    debug: apiDebug,
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
        bad_surface_percent: best.bad_surface_percent,
        track_path_percent: best.track_path_percent,
        suspicious_track_path_percent: best.suspicious_track_path_percent,
        paved_percent: best.paved_percent,
        raw_paved_percent: best.raw_paved_percent,
        inferred_paved_unknown_percent: best.inferred_paved_unknown_percent,
        safe_way_percent: best.safe_way_percent,
        paved_footway_priority: best.paved_footway_priority,
        route_kind: best.route_kind,
        via_index: best.via_index,
        detour: Number(best.detour.toFixed(2)),
        surfaces: best.surfacePercent,
        waytypes: best.wayPercent,
        candidates: candidates.length,
        candidate_summary: candidateSummary,
        debug: apiDebug,
        provider: best.provider || provider,
      },
      routed_at: new Date().toISOString(),
    },
  });
}
