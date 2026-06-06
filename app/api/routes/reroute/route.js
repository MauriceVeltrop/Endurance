// app/api/routes/reroute/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ROUTING_BASES = [
  process.env.ORS_API_BASE_URL,
  process.env.OPENROUTE_API_BASE_URL,
  "https://api.openrouteservice.org/v2/directions",
  "https://api.heigit.org/routing/2/directions",
  "https://api.heigit.org/v2/directions",
].filter(Boolean);

const PROFILE_CANDIDATES = {
  // Running is not trail running. Include cycling profiles as fallback candidates because
  // they often prefer paved cycleways/quiet roads where foot-walking may happily choose
  // unpaved park/forest paths. The sport scorer below keeps unsafe/road-heavy routes
  // from winning unless they are clearly better paved running options.
  running: ["foot-walking", "cycling-regular", "cycling-road", "foot-hiking"],
  trail_running: ["foot-hiking", "foot-walking"],
  trailrunning: ["foot-hiking", "foot-walking"],
  walking: ["foot-walking", "foot-hiking"],
  hiking: ["foot-hiking", "foot-walking"],

  road_cycling: ["cycling-road", "cycling-regular"],
  roadcycling: ["cycling-road", "cycling-regular"],
  cycling: ["cycling-regular", "cycling-road"],
  gravel_cycling: ["cycling-regular", "cycling-mountain"],
  gravel: ["cycling-regular", "cycling-mountain"],
  mountain_biking: ["cycling-mountain", "cycling-regular"],
  mtb: ["cycling-mountain", "cycling-regular"],
};

const SPORT_ROUTE_QUALITY = {
  running: {
    maxDetourFactor: 1.18,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    // Running should prefer paved/smooth routes. Do not blindly reward generic
    // `path`/`track`, because in OSM/ORS those are often unpaved forest paths.
    rewardWayTypes: ["footway", "cycleway", "pedestrian", "street"],
    avoidWayTypes: ["state_road", "road", "track", "steps"],
    rewardSurfaces: ["asphalt", "paved", "concrete", "paving_stones", "compacted", "fine_gravel"],
    neutralSurfaces: ["unknown"],
    avoidSurfaces: ["unpaved", "gravel", "dirt", "ground", "sand", "woodchips", "grass", "grass_paver"],
    pavedFirst: true,
    maxUnpavedShare: 0.18,
  },
  trail_running: {
    maxDetourFactor: 1.4,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["path", "track", "footway"],
    avoidWayTypes: ["state_road", "road", "street"],
  },
  trailrunning: {
    maxDetourFactor: 1.4,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["path", "track", "footway"],
    avoidWayTypes: ["state_road", "road", "street"],
  },
  walking: {
    maxDetourFactor: 1.3,
    alternativeCount: 2,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["footway", "path", "track", "pedestrian"],
    avoidWayTypes: ["state_road"],
  },
  hiking: {
    maxDetourFactor: 1.35,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["path", "track", "footway"],
    avoidWayTypes: ["state_road", "road"],
  },
  road_cycling: {
    maxDetourFactor: 1.12,
    alternativeCount: 2,
    preferences: ["recommended", "fastest"],
    rewardWayTypes: ["cycleway", "street", "road"],
    avoidWayTypes: ["path", "steps", "ferry"],
  },
  roadcycling: {
    maxDetourFactor: 1.12,
    alternativeCount: 2,
    preferences: ["recommended", "fastest"],
    rewardWayTypes: ["cycleway", "street", "road"],
    avoidWayTypes: ["path", "steps", "ferry"],
  },
  cycling: {
    maxDetourFactor: 1.18,
    alternativeCount: 2,
    preferences: ["recommended", "fastest"],
    rewardWayTypes: ["cycleway", "street", "road", "track"],
    avoidWayTypes: ["steps", "ferry"],
  },
  gravel_cycling: {
    maxDetourFactor: 1.3,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["track", "path", "cycleway", "road"],
    avoidWayTypes: ["state_road", "steps"],
  },
  gravel: {
    maxDetourFactor: 1.3,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["track", "path", "cycleway", "road"],
    avoidWayTypes: ["state_road", "steps"],
  },
  mountain_biking: {
    maxDetourFactor: 1.35,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["track", "path"],
    avoidWayTypes: ["state_road", "road", "steps"],
  },
  mtb: {
    maxDetourFactor: 1.35,
    alternativeCount: 3,
    preferences: ["recommended", "shortest"],
    rewardWayTypes: ["track", "path"],
    avoidWayTypes: ["state_road", "road", "steps"],
  },
};

const WAYTYPE_LABELS = {
  0: "unknown",
  1: "state_road",
  2: "road",
  3: "street",
  4: "path",
  5: "track",
  6: "cycleway",
  7: "footway",
  8: "steps",
  9: "ferry",
  10: "construction",
  11: "pedestrian",
};

const SURFACE_LABELS = {
  0: "unknown",
  1: "paved",
  2: "unpaved",
  3: "asphalt",
  4: "concrete",
  5: "cobblestone",
  6: "metal",
  7: "wood",
  8: "compacted",
  9: "fine_gravel",
  10: "gravel",
  11: "dirt",
  12: "ground",
  13: "ice",
  14: "paving_stones",
  15: "sand",
  16: "woodchips",
  17: "grass",
  18: "grass_paver",
};

const MAX_WAYPOINTS_PER_PROVIDER_CALL = 9;
const PROVIDER_TIMEOUT_MS = 16000;

function sportKey(sportId) {
  return String(sportId || "").toLowerCase();
}

function routeQualityForSport(sportId) {
  return SPORT_ROUTE_QUALITY[sportKey(sportId)] || SPORT_ROUTE_QUALITY.running;
}

function profilesForSport(sportId, requestedProfile) {
  const requested = String(requestedProfile || "").trim();
  const defaults = PROFILE_CANDIDATES[sportKey(sportId)] || ["foot-walking", "foot-hiking"];
  return [...new Set([requested, ...defaults].filter(Boolean))];
}

function preferencesForSport(sportId) {
  return [...new Set((routeQualityForSport(sportId).preferences || ["recommended"]).filter(Boolean))];
}

function normalize(points) {
  return (Array.isArray(points) ? points : [])
    .map((point) => ({
      lat: Number(point.lat ?? point.latitude),
      lon: Number(point.lon ?? point.lng ?? point.longitude),
      ele: Number.isFinite(Number(point.ele)) ? Number(point.ele) : null,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

function toPoints(coords) {
  return (coords || [])
    .map((coord) => ({
      lon: Number(coord[0]),
      lat: Number(coord[1]),
      ele: Number.isFinite(Number(coord[2])) ? Number(coord[2]) : null,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
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

function directWaypointDistanceMeters(points) {
  let distance = 0;
  for (let i = 1; i < points.length; i += 1) {
    distance += haversineMeters(points[i - 1], points[i]);
  }
  return distance;
}

function fallbackRoutePayload({ waypoints, profiles, reason, details = [] }) {
  const points = waypoints.map((point) => ({
    lat: Number(Number(point.lat).toFixed(6)),
    lon: Number(Number(point.lon).toFixed(6)),
    ele: Number.isFinite(Number(point.ele)) ? Number(Number(point.ele).toFixed(1)) : null,
  }));

  return {
    ok: true,
    routed: false,
    warning: reason || "Routing provider could not snap this route. Using the drawn line as a fallback.",
    details,
    profile: profiles?.[0] || null,
    route_points: {
      source: "drawn-fallback",
      profile: profiles?.[0] || null,
      provider_url: null,
      waypoints,
      control_points: waypoints,
      points,
      geometry_points: points,
      point_count: points.length,
      routed: false,
      fallback_reason: reason || null,
      routed_at: new Date().toISOString(),
    },
    distance_km: points.length > 1 ? Number((directWaypointDistanceMeters(points) / 1000).toFixed(2)) : null,
    duration_min: null,
    elevation_gain_m: 0,
    elevation_loss_m: 0,
  };
}

function cleanProviderError(text) {
  const raw = String(text || "");

  if (raw.includes("<html") || raw.includes("<!DOCTYPE") || raw.includes("nginx")) {
    return "Routing provider returned an HTML error page.";
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || parsed?.message || raw.slice(0, 600);
  } catch (_) {
    return raw.slice(0, 600);
  }
}

function providerUrl(base, profile) {
  return `${String(base).replace(/\/$/, "")}/${profile}/geojson`;
}

function splitWaypointsForProvider(waypoints) {
  if (waypoints.length <= MAX_WAYPOINTS_PER_PROVIDER_CALL) return [waypoints];

  const chunks = [];
  let index = 0;

  while (index < waypoints.length - 1) {
    const end = Math.min(index + MAX_WAYPOINTS_PER_PROVIDER_CALL, waypoints.length);
    const chunk = waypoints.slice(index, end);

    if (chunk.length >= 2) chunks.push(chunk);

    if (end >= waypoints.length) break;

    // Keep the last point of this chunk as the first point of the next chunk,
    // so the final geometry remains continuous.
    index = end - 1;
  }

  return chunks;
}

function summarizeExtraInfo(feature, extraKey, labels) {
  const summary = feature?.properties?.extras?.[extraKey]?.summary || [];
  const result = {};

  for (const item of summary) {
    const label = labels[item.value] || String(item.value ?? "unknown");
    result[label] = (result[label] || 0) + Number(item.distance || 0);
  }

  return result;
}

function summarizeWayTypes(feature) {
  return summarizeExtraInfo(feature, "waytypes", WAYTYPE_LABELS);
}

function summarizeSurfaces(feature) {
  return summarizeExtraInfo(feature, "surface", SURFACE_LABELS);
}

function shareOf(summary, labels, totalDistance) {
  const total = totalDistance || Object.values(summary || {}).reduce((sum, value) => sum + Number(value || 0), 0) || 1;
  return (labels || []).reduce((sum, label) => sum + Number(summary?.[label] || 0), 0) / total;
}

function routeSuitabilityScore({ feature, points, directDistance, sportId, profile, preference, baselineDistance }) {
  const quality = routeQualityForSport(sportId);
  const distance = Number(feature?.properties?.summary?.distance || 0);
  const safeDistance = distance > 0 ? distance : directDistance || 1;
  const wayTypes = summarizeWayTypes(feature);
  const surfaces = summarizeSurfaces(feature);

  let score = 100;

  // Do not blindly prefer the shortest line; allow useful detours, but make excessive
  // detours increasingly expensive.
  const detourFactor = directDistance > 0 ? safeDistance / directDistance : 1;
  score -= Math.max(0, detourFactor - 1) * 35;

  // If we have multiple ORS alternatives, avoid a much longer candidate unless it earns
  // points from sport-specific way types.
  if (baselineDistance > 0) {
    const extraVsBaseline = safeDistance / baselineDistance;
    score -= Math.max(0, extraVsBaseline - 1) * 25;
  }

  const totalKnownWayTypeDistance = Object.values(wayTypes).reduce((sum, value) => sum + Number(value || 0), 0) || safeDistance;
  const totalKnownSurfaceDistance = Object.values(surfaces).reduce((sum, value) => sum + Number(value || 0), 0) || safeDistance;

  for (const label of quality.rewardWayTypes || []) {
    score += ((wayTypes[label] || 0) / totalKnownWayTypeDistance) * 35;
  }

  for (const label of quality.avoidWayTypes || []) {
    score -= ((wayTypes[label] || 0) / totalKnownWayTypeDistance) * 65;
  }

  const pavedShare = shareOf(surfaces, quality.rewardSurfaces || [], totalKnownSurfaceDistance);
  const unpavedShare = shareOf(surfaces, quality.avoidSurfaces || [], totalKnownSurfaceDistance);

  for (const label of quality.rewardSurfaces || []) {
    score += ((surfaces[label] || 0) / totalKnownSurfaceDistance) * 95;
  }

  for (const label of quality.avoidSurfaces || []) {
    score -= ((surfaces[label] || 0) / totalKnownSurfaceDistance) * 140;
  }

  // Running-specific hard preference: a short unpaved route should not beat a slightly
  // longer paved route. Trail running keeps its own off-road scoring above.
  if (quality.pavedFirst) {
    if (pavedShare >= 0.7) score += 45;
    if (unpavedShare > Number(quality.maxUnpavedShare || 0.2)) {
      score -= 120 + (unpavedShare - Number(quality.maxUnpavedShare || 0.2)) * 260;
    }
  }

  if (preference === "recommended") score += 3;
  if (preference === "shortest" && ["running", "walking", "trail_running", "trailrunning", "hiking"].includes(sportKey(sportId))) {
    score += 2;
  }
  if (preference === "fastest" && ["road_cycling", "roadcycling", "cycling"].includes(sportKey(sportId))) {
    score += 2;
  }

  if (profile === "foot-hiking" && ["trail_running", "trailrunning", "hiking"].includes(sportKey(sportId))) score += 5;
  if (profile === "foot-walking" && ["running", "walking"].includes(sportKey(sportId))) score += 4;
  if (profile === "cycling-road" && ["road_cycling", "roadcycling"].includes(sportKey(sportId))) score += 5;
  if (profile === "cycling-mountain" && ["mountain_biking", "mtb"].includes(sportKey(sportId))) score += 5;

  return {
    score,
    detourFactor: Number(detourFactor.toFixed(3)),
    wayTypes,
    surfaces,
    pavedShare: Number((typeof pavedShare === "number" ? pavedShare : 0).toFixed(3)),
    unpavedShare: Number((typeof unpavedShare === "number" ? unpavedShare : 0).toFixed(3)),
  };
}

async function fetchProviderRoute({ url, apiKey, points, preference, sportId }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const quality = routeQualityForSport(sportId);
    const alternativeCount = Math.max(1, Math.min(Number(quality.alternativeCount || 1), 3));

    const payload = {
      coordinates: points.map((point) => [point.lon, point.lat]),
      elevation: true,
      instructions: false,
      preference,
      geometry_simplify: false,
      format: "geojson",
      extra_info: ["waytype", "surface"],
    };

    // ORS can return alternatives in one request. This is much lighter than doing
    // expensive pre-snapping or many separate Overpass calls.
    if (points.length === 2 && alternativeCount > 1) {
      payload.alternative_routes = {
        target_count: alternativeCount,
        weight_factor: 1.6,
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
      const text = await response.text();
      throw new Error(`${response.status}: ${cleanProviderError(text)}`);
    }

    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    const directDistance = directWaypointDistanceMeters(points);
    const firstDistance = Number(features?.[0]?.properties?.summary?.distance || 0);

    const candidates = features
      .map((feature, index) => {
        const coords = feature?.geometry?.coordinates || [];
        const routePoints = toPoints(coords);

        if (routePoints.length < 2) return null;

        const distance = Number(feature?.properties?.summary?.distance || 0);
        const duration = Number(feature?.properties?.summary?.duration || 0);
        const score = routeSuitabilityScore({
          feature,
          points,
          directDistance,
          sportId,
          profile: url.split("/").slice(-2, -1)[0],
          preference,
          baselineDistance: firstDistance,
        });

        return {
          coords,
          distance,
          duration,
          ascent: Number(feature?.properties?.ascent || 0),
          descent: Number(feature?.properties?.descent || 0),
          suitability_score: Number(score.score.toFixed(2)),
          detour_factor: score.detourFactor,
          waytypes: score.wayTypes,
          surfaces: score.surfaces,
          paved_share: score.pavedShare,
          unpaved_share: score.unpavedShare,
          alternative_index: index,
        };
      })
      .filter(Boolean);

    if (!candidates.length) {
      throw new Error("no routed geometry returned");
    }

    return candidates;
  } finally {
    clearTimeout(timeout);
  }
}

async function routeInChunks({ url, apiKey, waypoints, preference, sportId }) {
  const chunks = splitWaypointsForProvider(waypoints);
  const mergedCoords = [];
  let distance = 0;
  let duration = 0;
  let ascent = 0;
  let descent = 0;
  let suitabilityScore = 0;
  let detourFactor = 1;
  const selectedAlternatives = [];
  const waytypes = {};
  const surfaces = {};
  let weightedPavedShare = 0;
  let weightedUnpavedShare = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    const candidates = await fetchProviderRoute({ url, apiKey, points: chunks[index], preference, sportId });
    const directDistance = directWaypointDistanceMeters(chunks[index]);
    const maxDetourFactor = routeQualityForSport(sportId).maxDetourFactor || 1.2;

    const withinDetour = candidates.filter((candidate) => {
      const factor = directDistance > 0 && candidate.distance > 0 ? candidate.distance / directDistance : 1;
      return factor <= maxDetourFactor;
    });

    const pool = withinDetour.length ? withinDetour : candidates;
    const quality = routeQualityForSport(sportId);
    const pavedFirstPool = quality.pavedFirst
      ? pool.filter((candidate) => Number(candidate.unpaved_share || 0) <= Number(quality.maxUnpavedShare || 0.2))
      : [];

    const selected = [...(pavedFirstPool.length ? pavedFirstPool : pool)].sort(
      (a, b) => Number(b.suitability_score || 0) - Number(a.suitability_score || 0)
    )[0];

    const coords = index === 0 ? selected.coords : selected.coords.slice(1);

    mergedCoords.push(...coords);
    distance += selected.distance || 0;
    duration += selected.duration || 0;
    ascent += selected.ascent || 0;
    descent += selected.descent || 0;
    suitabilityScore += selected.suitability_score || 0;
    detourFactor = Math.max(detourFactor, selected.detour_factor || 1);
    selectedAlternatives.push(selected.alternative_index || 0);

    for (const [label, value] of Object.entries(selected.waytypes || {})) {
      waytypes[label] = (waytypes[label] || 0) + Number(value || 0);
    }

    for (const [label, value] of Object.entries(selected.surfaces || {})) {
      surfaces[label] = (surfaces[label] || 0) + Number(value || 0);
    }

    weightedPavedShare += Number(selected.paved_share || 0) * Number(selected.distance || directDistance || 0);
    weightedUnpavedShare += Number(selected.unpaved_share || 0) * Number(selected.distance || directDistance || 0);
  }

  return {
    coords: mergedCoords,
    distance,
    duration,
    ascent,
    descent,
    chunks: chunks.length,
    suitability_score: Number((suitabilityScore / chunks.length).toFixed(2)),
    detour_factor: Number(detourFactor.toFixed(3)),
    selected_alternatives: selectedAlternatives,
    waytypes,
    surfaces,
    paved_share: distance > 0 ? Number((weightedPavedShare / distance).toFixed(3)) : 0,
    unpaved_share: distance > 0 ? Number((weightedUnpavedShare / distance).toFixed(3)) : 0,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawWaypoints = normalize(body?.points);
    const sportId = body?.sport_id || body?.sportId || body?.sport;
    const profiles = profilesForSport(sportId, body?.profile);
    const preferences = preferencesForSport(sportId);

    if (rawWaypoints.length < 2) {
      return NextResponse.json({ ok: false, error: "At least two route points are required." }, { status: 400 });
    }

    const waypoints = rawWaypoints;

    const apiKey =
      process.env.OPENROUTE_API_KEY ||
      process.env.OPENROUTESERVICE_API_KEY ||
      process.env.ORS_API_KEY ||
      process.env.NEXT_PUBLIC_OPENROUTE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        fallbackRoutePayload({
          waypoints,
          profiles,
          reason: "Routing key is missing. The route was saved as a drawn fallback route.",
          details: ["Missing OPENROUTE_API_KEY / OPENROUTESERVICE_API_KEY / ORS_API_KEY"],
        }),
        { status: 200 }
      );
    }

    const providerErrors = [];
    const successfulCandidates = [];

    for (const profile of profiles) {
      for (const preference of preferences) {
        for (const base of ROUTING_BASES) {
          const url = providerUrl(base, profile);

          try {
            const result = await routeInChunks({ url, apiKey, waypoints, preference, sportId });
            const points = toPoints(result.coords);

            if (points.length < 2) {
              providerErrors.push(`${url} (${preference}) -> no usable routed geometry returned`);
              continue;
            }

            successfulCandidates.push({
              result,
              points,
              profile,
              preference,
              url,
            });
          } catch (error) {
            const reason = error?.name === "AbortError" ? "provider request timed out" : error?.message || "request failed";
            providerErrors.push(`${url} (${preference}) -> ${reason}`);
          }
        }

        // If one base URL works for this profile/preference, do not try mirror URLs
        // unless nothing usable was returned.
        if (successfulCandidates.some((candidate) => candidate.profile === profile && candidate.preference === preference)) {
          break;
        }
      }
    }

    if (successfulCandidates.length) {
      const directDistance = directWaypointDistanceMeters(waypoints);
      const maxDetourFactor = routeQualityForSport(sportId).maxDetourFactor || 1.2;

      const eligible = successfulCandidates.filter((candidate) => {
        const distance = Number(candidate.result.distance || 0);
        const factor = directDistance > 0 && distance > 0 ? distance / directDistance : 1;
        return factor <= maxDetourFactor;
      });

      const quality = routeQualityForSport(sportId);
      const basePool = eligible.length ? eligible : successfulCandidates;
      const pavedFirstPool = quality.pavedFirst
        ? basePool.filter((candidate) => Number(candidate.result.unpaved_share || 0) <= Number(quality.maxUnpavedShare || 0.2))
        : [];

      const selected = [...(pavedFirstPool.length ? pavedFirstPool : basePool)].sort((a, b) => {
        const scoreDiff = Number(b.result.suitability_score || 0) - Number(a.result.suitability_score || 0);
        if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
        return Number(a.result.distance || 0) - Number(b.result.distance || 0);
      })[0];

      return NextResponse.json({
        ok: true,
        routed: true,
        snapped: false,
        chunked: selected.result.chunks > 1,
        chunk_count: selected.result.chunks,
        profile: selected.profile,
        preference: selected.preference,
        provider_url: selected.url,
        route_quality: {
          sport_id: sportId || null,
          max_detour_factor: maxDetourFactor,
          detour_factor: selected.result.detour_factor,
          suitability_score: selected.result.suitability_score,
          selected_alternatives: selected.result.selected_alternatives,
          waytypes: selected.result.waytypes,
          surfaces: selected.result.surfaces,
          paved_share: selected.result.paved_share,
          unpaved_share: selected.result.unpaved_share,
          candidates_considered: successfulCandidates.length,
          eligible_candidates: eligible.length || successfulCandidates.length,
        },
        route_points: {
          source: selected.result.chunks > 1 ? "openrouteservice-sport-aware-chunked" : "openrouteservice-sport-aware",
          profile: selected.profile,
          preference: selected.preference,
          provider_url: selected.url,
          waypoints,
          original_waypoints: rawWaypoints,
          points: selected.points,
          point_count: selected.points.length,
          chunked: selected.result.chunks > 1,
          chunk_count: selected.result.chunks,
          route_quality: {
            sport_id: sportId || null,
            max_detour_factor: maxDetourFactor,
            detour_factor: selected.result.detour_factor,
            suitability_score: selected.result.suitability_score,
            selected_alternatives: selected.result.selected_alternatives,
            waytypes: selected.result.waytypes,
            surfaces: selected.result.surfaces,
            paved_share: selected.result.paved_share,
            unpaved_share: selected.result.unpaved_share,
            candidates_considered: successfulCandidates.length,
            eligible_candidates: eligible.length || successfulCandidates.length,
          },
          routed_at: new Date().toISOString(),
        },
        distance_km: selected.result.distance ? Number((selected.result.distance / 1000).toFixed(2)) : null,
        duration_min: selected.result.duration ? Math.round(selected.result.duration / 60) : null,
        elevation_gain_m: Number.isFinite(selected.result.ascent) ? Math.round(selected.result.ascent) : null,
        elevation_loss_m: Number.isFinite(selected.result.descent) ? Math.round(selected.result.descent) : null,
      });
    }

    return NextResponse.json(
      fallbackRoutePayload({
        waypoints,
        profiles,
        reason: "Routing provider could not snap this route. Using the drawn line as a fallback.",
        details: providerErrors.slice(-12),
      }),
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Could not reroute." }, { status: 500 });
  }
}
