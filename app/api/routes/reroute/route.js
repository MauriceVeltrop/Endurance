// app/api/routes/reroute/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ROUTING_BASES = [
  process.env.ORS_API_BASE_URL,
  process.env.OPENROUTE_API_BASE_URL,
  "https://api.heigit.org/routing/2/directions",
  "https://api.heigit.org/v2/directions",
  "https://api.openrouteservice.org/v2/directions",
].filter(Boolean);

const PROFILE_MAP = {
  // Road running should prefer paved/logical roads and cycle paths more than random unpaved footpaths.
  // ORS foot-walking is too eager to use small/unpaved paths for road running.
  running: "cycling-regular",

  trail_running: "foot-hiking",
  walking: "foot-walking",
  hiking: "foot-hiking",

  road_cycling: "cycling-road",
  cycling: "cycling-regular",
  gravel_cycling: "cycling-regular",

  mountain_biking: "cycling-mountain",
  mtb: "cycling-mountain",
};

function profileForSport(sportId) {
  return PROFILE_MAP[String(sportId || "").toLowerCase()] || "foot-walking";
}

function normalize(points) {
  return (Array.isArray(points) ? points : [])
    .map((point) => ({
      lat: Number(point.lat ?? point.latitude),
      lon: Number(point.lon ?? point.lng ?? point.longitude),
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

  return raw.slice(0, 600);
}

function providerUrl(base, profile) {
  return `${String(base).replace(/\/$/, "")}/${profile}/geojson`;
}

export async function POST(request) {
  try {
    const apiKey =
      process.env.OPENROUTE_API_KEY ||
      process.env.OPENROUTESERVICE_API_KEY ||
      process.env.ORS_API_KEY ||
      process.env.NEXT_PUBLIC_OPENROUTE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Missing OPENROUTE_API_KEY, OPENROUTESERVICE_API_KEY or ORS_API_KEY environment variable.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const waypoints = normalize(body?.points);
    const profile = body?.profile || profileForSport(body?.sport_id);

    if (waypoints.length < 2) {
      return NextResponse.json(
        { error: "At least two route points are required." },
        { status: 400 }
      );
    }

    const payload = {
      coordinates: waypoints.map((point) => [point.lon, point.lat]),
      elevation: true,
      instructions: false,
      preference: "recommended",
      geometry_simplify: false,
      format: "geojson",
    };

    const providerErrors = [];

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
          distance_km: summary.distance
            ? Number((summary.distance / 1000).toFixed(2))
            : null,
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

    return NextResponse.json(
      {
        error:
          "OpenRouteService/HeiGIT routing failed. Tried configured provider endpoints but none returned a valid route.",
        details: providerErrors,
      },
      { status: 502 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not reroute." },
      { status: 500 }
    );
  }
}
