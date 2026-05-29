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
    const waypoints = normalize(body?.points);
    const profiles = profilesForSport(body?.sport_id, body?.profile);

    if (waypoints.length < 2) {
      return NextResponse.json({ ok: false, error: "At least two route points are required." }, { status: 400 });
    }

    const apiKey =
      process.env.OPENROUTE_API_KEY ||
      process.env.OPENROUTESERVICE_API_KEY ||
      process.env.ORS_API_KEY ||
      process.env.NEXT_PUBLIC_OPENROUTE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Routing key is missing. Check OPENROUTE_API_KEY / OPENROUTESERVICE_API_KEY / ORS_API_KEY in Vercel." },
        { status: 500 }
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
            chunked: result.chunks > 1,
            chunk_count: result.chunks,
            profile,
            provider_url: url,
            route_points: {
              source: result.chunks > 1 ? "openrouteservice-chunked" : "openrouteservice",
              profile,
              provider_url: url,
              waypoints,
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
      {
        ok: false,
        error: "Routing provider could not snap this route. Try fewer points or move the last point closer to a road/path.",
        details: providerErrors.slice(-12),
      },
      { status: 502 }
    );
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Could not reroute." }, { status: 500 });
  }
}
