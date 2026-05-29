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
  walking: ["foot-walking", "foot-hiking"],
  hiking: ["foot-hiking", "foot-walking"],

  road_cycling: ["cycling-road", "cycling-regular"],
  cycling: ["cycling-regular", "cycling-road"],
  gravel_cycling: ["cycling-regular", "cycling-mountain"],
  mountain_biking: ["cycling-mountain", "cycling-regular"],
  mtb: ["cycling-mountain", "cycling-regular"],
};

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

function haversineMeters(a, b) {
  const radius = 6371000;
  const lat1 = (Number(a.lat) * Math.PI) / 180;
  const lat2 = (Number(b.lat) * Math.PI) / 180;
  const dLat = ((Number(b.lat) - Number(a.lat)) * Math.PI) / 180;
  const dLon = ((Number(b.lon) - Number(a.lon)) * Math.PI) / 180;

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function fallbackDistanceKm(points) {
  const meters = points.reduce((sum, point, index) => {
    if (index === 0) return 0;
    return sum + haversineMeters(points[index - 1], point);
  }, 0);

  return Number((meters / 1000).toFixed(2));
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

function manualFallback({ waypoints, profile, providerErrors, reason }) {
  return NextResponse.json({
    ok: true,
    routed: false,
    warning: reason || "No snapped route was found. Endurance kept the manually drawn line.",
    details: providerErrors.slice(-10),
    profile,
    provider_url: null,
    route_points: {
      source: "manual-fallback",
      profile,
      provider_url: null,
      waypoints,
      points: waypoints,
      point_count: waypoints.length,
      routed_at: new Date().toISOString(),
      routing_warning: reason || "Routing provider could not snap these points.",
    },
    distance_km: fallbackDistanceKm(waypoints),
    duration_min: null,
    elevation_gain_m: null,
    elevation_loss_m: null,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const waypoints = normalize(body?.points);
    const profiles = profilesForSport(body?.sport_id, body?.profile);

    if (waypoints.length < 2) {
      return NextResponse.json({ error: "At least two route points are required." }, { status: 400 });
    }

    const apiKey =
      process.env.OPENROUTE_API_KEY ||
      process.env.OPENROUTESERVICE_API_KEY ||
      process.env.ORS_API_KEY ||
      process.env.NEXT_PUBLIC_OPENROUTE_API_KEY;

    if (!apiKey) {
      return manualFallback({
        waypoints,
        profile: profiles[0],
        providerErrors: ["Missing ORS/HeiGIT API key."],
        reason: "Routing key is missing. Endurance kept the manually drawn route.",
      });
    }

    const providerErrors = [];

    for (const profile of profiles) {
      const payload = {
        coordinates: waypoints.map((point) => [point.lon, point.lat]),
        elevation: true,
        instructions: false,
        preference: "recommended",
        geometry_simplify: false,
        format: "geojson",
      };

      for (const base of ROUTING_BASES) {
        const url = providerUrl(base, profile);

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: apiKey,
              "Content-Type": "application/json",
              Accept: "application/json, application/geo+json",
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const text = await response.text();
            providerErrors.push(`${url} -> ${response.status}: ${cleanProviderError(text)}`);
            continue;
          }

          const data = await response.json();
          const feature = data?.features?.[0];
          const coords = feature?.geometry?.coordinates || [];
          const summary = feature?.properties?.summary || {};

          if (!coords.length) {
            providerErrors.push(`${url} -> no routed geometry returned`);
            continue;
          }

          return NextResponse.json({
            ok: true,
            routed: true,
            profile,
            provider_url: url,
            route_points: {
              source: "openrouteservice",
              profile,
              provider_url: url,
              waypoints,
              points: toPoints(coords),
              point_count: coords.length,
              routed_at: new Date().toISOString(),
            },
            distance_km: summary.distance ? Number((summary.distance / 1000).toFixed(2)) : null,
            duration_min: summary.duration ? Math.round(summary.duration / 60) : null,
            elevation_gain_m: Number.isFinite(Number(feature?.properties?.ascent))
              ? Math.round(Number(feature.properties.ascent))
              : null,
            elevation_loss_m: Number.isFinite(Number(feature?.properties?.descent))
              ? Math.round(Number(feature.properties.descent))
              : null,
          });
        } catch (error) {
          providerErrors.push(`${url} -> ${error?.message || "request failed"}`);
        }
      }
    }

    return manualFallback({
      waypoints,
      profile: profiles[0],
      providerErrors,
      reason: "No snapped path found. Endurance kept the manually drawn route.",
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Could not reroute." }, { status: 500 });
  }
}
