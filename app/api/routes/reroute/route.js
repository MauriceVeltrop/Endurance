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
  running: ["foot-walking", "foot-hiking"],
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

const MAX_WAYPOINTS_PER_PROVIDER_CALL = 9;
const PROVIDER_TIMEOUT_MS = 16000;
const FOOT_SNAP_TIMEOUT_MS = 5000;
const FOOT_SNAP_RADIUS_M = 35;


function isFootSport(sportId) {
  const id = String(sportId || "").toLowerCase();
  return ["running", "trail_running", "trailrunning", "walking", "hiking"].includes(id);
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

function projectPointToSegment(point, a, b) {
  const latScale = 111320;
  const lonScale = 111320 * Math.cos((point.lat * Math.PI) / 180);
  const ax = (a.lon - point.lon) * lonScale;
  const ay = (a.lat - point.lat) * latScale;
  const bx = (b.lon - point.lon) * lonScale;
  const by = (b.lat - point.lat) * latScale;
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 ? Math.max(0, Math.min(1, -(ax * abx + ay * aby) / ab2)) : 0;
  const x = ax + abx * t;
  const y = ay + aby * t;

  return {
    lat: Number((point.lat + y / latScale).toFixed(7)),
    lon: Number((point.lon + x / lonScale).toFixed(7)),
    distance_m: Math.sqrt(x * x + y * y),
  };
}

function nearestPointOnFootWays(point, elements) {
  let best = null;

  for (const element of elements || []) {
    const tags = element?.tags || {};
    const highway = tags.highway;
    const access = tags.access;
    const foot = tags.foot;
    const geometry = Array.isArray(element?.geometry) ? element.geometry : [];

    if (!geometry.length || ["no", "private"].includes(access) || foot === "no") continue;
    if (!["path", "footway", "pedestrian", "steps", "track", "cycleway", "bridleway", "living_street", "residential", "service"].includes(highway)) continue;

    for (let i = 1; i < geometry.length; i += 1) {
      const a = { lat: Number(geometry[i - 1].lat), lon: Number(geometry[i - 1].lon) };
      const b = { lat: Number(geometry[i].lat), lon: Number(geometry[i].lon) };
      if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) continue;
      const projected = projectPointToSegment(point, a, b);
      if (!best || projected.distance_m < best.distance_m) {
        best = { ...projected, highway, name: tags.name || null };
      }
    }
  }

  return best;
}

async function fetchFootWaysAround(point, radiusM) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FOOT_SNAP_TIMEOUT_MS);

  try {
    const query = `
      [out:json][timeout:4];
      way(around:${radiusM},${point.lat},${point.lon})["highway"~"^(path|footway|pedestrian|steps|track|cycleway|bridleway|living_street|residential|service)$"];
      out geom;
    `;

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });

    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.elements) ? data.elements : [];
  } catch (_) {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function snapFootWaypoints({ waypoints, sportId }) {
  if (!isFootSport(sportId) || waypoints.length < 2) {
    return { waypoints, snapped: false, snapDetails: [] };
  }

  const snappedWaypoints = [];
  const snapDetails = [];

  for (const waypoint of waypoints) {
    const elements = await fetchFootWaysAround(waypoint, FOOT_SNAP_RADIUS_M);
    const nearest = nearestPointOnFootWays(waypoint, elements);

    if (nearest && nearest.distance_m <= FOOT_SNAP_RADIUS_M) {
      snappedWaypoints.push({ ...waypoint, lat: nearest.lat, lon: nearest.lon });
      snapDetails.push({
        original: waypoint,
        snapped: { lat: nearest.lat, lon: nearest.lon },
        distance_m: Number(nearest.distance_m.toFixed(1)),
        highway: nearest.highway,
        name: nearest.name,
      });
    } else {
      snappedWaypoints.push(waypoint);
      snapDetails.push({ original: waypoint, snapped: null, distance_m: null });
    }
  }

  const changed = snappedWaypoints.some((point, index) => haversineMeters(point, waypoints[index]) > 1);
  return { waypoints: changed ? snappedWaypoints : waypoints, snapped: changed, snapDetails };
}

function profilesForSport(sportId, requestedProfile) {
  const requested = String(requestedProfile || "").trim();
  const defaults = PROFILE_CANDIDATES[String(sportId || "").toLowerCase()] || ["foot-walking", "foot-hiking"];
  return [...new Set([requested, ...defaults].filter(Boolean))];
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


function fallbackRoutePayload({ waypoints, profiles, reason, details = [] }) {
  const points = waypoints.map((point) => ({
    lat: Number(Number(point.lat).toFixed(6)),
    lon: Number(Number(point.lon).toFixed(6)),
    ele: Number.isFinite(Number(point.ele)) ? Number(Number(point.ele).toFixed(1)) : null,
  }));

  let distanceMeters = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const R = 6371000;
    const toRad = (value) => (Number(value) * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    distanceMeters += 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

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
    distance_km: distanceMeters ? Number((distanceMeters / 1000).toFixed(2)) : null,
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

async function fetchProviderRoute({ url, apiKey, points }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const payload = {
      coordinates: points.map((point) => [point.lon, point.lat]),
      elevation: true,
      instructions: false,
      preference: "recommended",
      geometry_simplify: false,
      format: "geojson",
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
      const text = await response.text();
      throw new Error(`${response.status}: ${cleanProviderError(text)}`);
    }

    const data = await response.json();
    const feature = data?.features?.[0];
    const coords = feature?.geometry?.coordinates || [];

    if (!coords.length) {
      throw new Error("no routed geometry returned");
    }

    return {
      coords,
      distance: Number(feature?.properties?.summary?.distance || 0),
      duration: Number(feature?.properties?.summary?.duration || 0),
      ascent: Number(feature?.properties?.ascent || 0),
      descent: Number(feature?.properties?.descent || 0),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function routeInChunks({ url, apiKey, waypoints }) {
  const chunks = splitWaypointsForProvider(waypoints);
  const mergedCoords = [];
  let distance = 0;
  let duration = 0;
  let ascent = 0;
  let descent = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    const result = await fetchProviderRoute({ url, apiKey, points: chunks[index] });
    const coords = index === 0 ? result.coords : result.coords.slice(1);

    mergedCoords.push(...coords);
    distance += result.distance || 0;
    duration += result.duration || 0;
    ascent += result.ascent || 0;
    descent += result.descent || 0;
  }

  return { coords: mergedCoords, distance, duration, ascent, descent, chunks: chunks.length };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawWaypoints = normalize(body?.points);
    const profiles = profilesForSport(body?.sport_id, body?.profile);

    if (rawWaypoints.length < 2) {
      return NextResponse.json({ ok: false, error: "At least two route points are required." }, { status: 400 });
    }

    const snapResult = await snapFootWaypoints({ waypoints: rawWaypoints, sportId: body?.sport_id });
    const waypoints = snapResult.waypoints;

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

    for (const profile of profiles) {
      for (const base of ROUTING_BASES) {
        const url = providerUrl(base, profile);

        try {
          const result = await routeInChunks({ url, apiKey, waypoints });
          const points = toPoints(result.coords);

          if (points.length < 2) {
            providerErrors.push(`${url} -> no usable routed geometry returned`);
            continue;
          }

          return NextResponse.json({
            ok: true,
            routed: true,
            snapped: snapResult.snapped,
            chunked: result.chunks > 1,
            chunk_count: result.chunks,
            profile,
            provider_url: url,
            route_points: {
              source: result.chunks > 1 ? "openrouteservice-chunked" : "openrouteservice",
              profile,
              provider_url: url,
              waypoints,
              original_waypoints: rawWaypoints,
              snapped_waypoints: snapResult.snapped ? waypoints : null,
              snap_details: snapResult.snapDetails,
              points,
              point_count: points.length,
              chunked: result.chunks > 1,
              chunk_count: result.chunks,
              routed_at: new Date().toISOString(),
            },
            distance_km: result.distance ? Number((result.distance / 1000).toFixed(2)) : null,
            duration_min: result.duration ? Math.round(result.duration / 60) : null,
            elevation_gain_m: Number.isFinite(result.ascent) ? Math.round(result.ascent) : null,
            elevation_loss_m: Number.isFinite(result.descent) ? Math.round(result.descent) : null,
          });
        } catch (error) {
          const reason = error?.name === "AbortError" ? "provider request timed out" : error?.message || "request failed";
          providerErrors.push(`${url} -> ${reason}`);
        }
      }
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
