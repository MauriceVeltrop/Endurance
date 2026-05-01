import {
  getRoutePreference,
  getRoutePreferenceLabel,
  getRouteProfileForPreference,
} from "../../../../lib/routePreference";

const SURFACE_CODES = {
  UNKNOWN: 0,
  PAVED: 1,
  UNPAVED: 2,
  ASPHALT: 3,
  CONCRETE: 4,
  COBBLESTONE: 5,
  METAL: 6,
  WOOD: 7,
  COMPACTED_GRAVEL: 8,
  FINE_GRAVEL: 9,
  GRAVEL: 10,
  DIRT: 11,
  GROUND: 12,
  ICE: 13,
  PAVING_STONES: 14,
  SAND: 15,
  WOODCHIPS: 16,
  GRASS: 17,
  GRASS_PAVER: 18,
};

const PAVED_SURFACES = new Set([
  SURFACE_CODES.PAVED,
  SURFACE_CODES.ASPHALT,
  SURFACE_CODES.CONCRETE,
  SURFACE_CODES.COBBLESTONE,
  SURFACE_CODES.PAVING_STONES,
  SURFACE_CODES.GRASS_PAVER,
]);

const UNPAVED_SURFACES = new Set([
  SURFACE_CODES.UNPAVED,
  SURFACE_CODES.COMPACTED_GRAVEL,
  SURFACE_CODES.FINE_GRAVEL,
  SURFACE_CODES.GRAVEL,
  SURFACE_CODES.DIRT,
  SURFACE_CODES.GROUND,
  SURFACE_CODES.SAND,
  SURFACE_CODES.WOODCHIPS,
  SURFACE_CODES.GRASS,
]);

function getSurfaceScore(feature, routePreference) {
  const summary = feature?.properties?.extras?.surface?.summary || [];

  if (!Array.isArray(summary) || summary.length === 0) {
    return 0;
  }

  let paved = 0;
  let unpaved = 0;
  let known = 0;

  for (const item of summary) {
    const value = Number(item.value);
    const amount = Number(item.amount || 0);

    if (!Number.isFinite(value) || !Number.isFinite(amount)) continue;

    if (PAVED_SURFACES.has(value)) {
      paved += amount;
      known += amount;
    } else if (UNPAVED_SURFACES.has(value)) {
      unpaved += amount;
      known += amount;
    }
  }

  if (!known) return 0;

  if (routePreference === "trail") {
    return unpaved / known;
  }

  if (routePreference === "paved") {
    return paved / known;
  }

  return 0;
}

async function requestRoute({
  apiKey,
  orsProfile,
  startCoords,
  targetDistanceMeters,
  seed,
  routePreference,
  includeExtraInfo = true,
}) {
  const body = {
    coordinates: [startCoords],
    elevation: true,
    instructions: false,
    preference: routePreference === "paved" ? "recommended" : "recommended",
    options: {
      round_trip: {
        length: targetDistanceMeters,
        points: routePreference === "trail" ? 4 : 3,
        seed,
      },
      avoid_features: ["ferries"],
    },
  };

  if (includeExtraInfo) {
    body.extra_info = ["surface", "waytype", "steepness"];
  }

  const routeRes = await fetch(
    `https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`,
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const routeData = await routeRes.json();

  if (!routeRes.ok) {
    throw new Error(
      routeData?.error?.message ||
        routeData?.message ||
        "Route generation failed"
    );
  }

  const feature = routeData?.features?.[0];

  if (!feature?.geometry?.coordinates?.length) {
    throw new Error("No route returned");
  }

  return feature;
}

async function getBestRoute({
  apiKey,
  orsProfile,
  startCoords,
  targetDistanceMeters,
  routePreference,
}) {
  const attempts = routePreference === "default" ? 1 : 3;
  const candidates = [];
  let lastError = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const feature = await requestRoute({
        apiKey,
        orsProfile,
        startCoords,
        targetDistanceMeters,
        seed: Math.floor(Math.random() * 100000),
        routePreference,
        includeExtraInfo: true,
      });

      candidates.push({
        feature,
        score: getSurfaceScore(feature, routePreference),
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (candidates.length === 0) {
    // Fallback for ORS plans/regions where extra_info is not accepted.
    const feature = await requestRoute({
      apiKey,
      orsProfile,
      startCoords,
      targetDistanceMeters,
      seed: Math.floor(Math.random() * 100000),
      routePreference,
      includeExtraInfo: false,
    });

    return {
      feature,
      surfaceScore: null,
    };
  }

  candidates.sort((a, b) => b.score - a.score);

  return {
    feature: candidates[0].feature,
    surfaceScore: Number.isFinite(candidates[0].score)
      ? Number(candidates[0].score.toFixed(3))
      : null,
  };
}

export async function POST(request) {
  try {
    const apiKey = process.env.OPENROUTESERVICE_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "OPENROUTESERVICE_API_KEY is missing" },
        { status: 500 }
      );
    }

    const body = await request.json();

    const {
      startLocation,
      startCoordinates,
      distanceKm = 5,
      sport = "running",
      sports = [],
      routePreference: requestedRoutePreference,
    } = body;

    const selectedSports = Array.isArray(sports) && sports.length ? sports : [sport];

    const routePreference =
      requestedRoutePreference || getRoutePreference(selectedSports);

    if (!startLocation && !startCoordinates) {
      return Response.json(
        { error: "Start location or start coordinates are required" },
        { status: 400 }
      );
    }

    const orsProfile = getRouteProfileForPreference(routePreference, sport);

    let startCoords = null;
    let resolvedLocation = startLocation || "";

    const hasCoordinateStart =
      Array.isArray(startCoordinates) &&
      startCoordinates.length === 2 &&
      Number.isFinite(Number(startCoordinates[0])) &&
      Number.isFinite(Number(startCoordinates[1]));

    if (hasCoordinateStart) {
      startCoords = [Number(startCoordinates[0]), Number(startCoordinates[1])];

      try {
        const reverseUrl = `https://api.openrouteservice.org/geocode/reverse?api_key=${apiKey}&point.lon=${startCoords[0]}&point.lat=${startCoords[1]}&size=1`;
        const reverseRes = await fetch(reverseUrl);

        if (reverseRes.ok) {
          const reverseData = await reverseRes.json();
          const props = reverseData?.features?.[0]?.properties || {};

          const street =
            props.street ||
            props.name ||
            props.label?.split(",")?.[0] ||
            "";

          const locality =
            props.locality ||
            props.localadmin ||
            props.county ||
            props.region ||
            "";

          if (street && locality) {
            resolvedLocation = `${street}, ${locality}`;
          } else if (locality) {
            resolvedLocation = locality;
          } else if (props.label) {
            resolvedLocation = props.label;
          } else {
            resolvedLocation = "Current location";
          }
        } else {
          resolvedLocation = "Current location";
        }
      } catch {
        resolvedLocation = "Current location";
      }
    }

    if (!startCoords) {
      const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(
        startLocation
      )}&size=1`;

      const geocodeRes = await fetch(geocodeUrl);

      if (!geocodeRes.ok) {
        return Response.json(
          { error: "Could not geocode start location" },
          { status: 400 }
        );
      }

      const geocodeData = await geocodeRes.json();
      const firstResult = geocodeData?.features?.[0];

      if (!firstResult?.geometry?.coordinates) {
        return Response.json(
          { error: "No coordinates found for this location" },
          { status: 404 }
        );
      }

      startCoords = firstResult.geometry.coordinates;
      resolvedLocation = firstResult.properties?.label || startLocation;
    }

    const targetDistanceMeters = Math.round(Number(distanceKm) * 1000);

    const { feature, surfaceScore } = await getBestRoute({
      apiKey,
      orsProfile,
      startCoords,
      targetDistanceMeters,
      routePreference,
    });

    const routePoints = feature.geometry.coordinates.map((coord) => ({
      lon: coord[0],
      lat: coord[1],
      ele: coord[2] ?? 0,
    }));

    const summary = feature.properties?.summary || {};

    const distance = summary.distance
      ? Number((summary.distance / 1000).toFixed(2))
      : Number(distanceKm);

    const elevationGain =
      feature.properties?.ascent ??
      feature.properties?.extras?.steepness?.summary?.[0]?.amount ??
      null;

    return Response.json({
      startLocation: resolvedLocation,
      resolvedLocation,
      startCoordinates: startCoords,
      sport,
      sports: selectedSports,
      routePreference,
      routePreferenceLabel: getRoutePreferenceLabel(routePreference),
      surfaceScore,
      orsProfile,
      distance,
      route_distance_km: distance,
      elevation_gain_m:
        elevationGain !== null ? Math.round(Number(elevationGain)) : null,
      route_points: routePoints,
      geojson: feature,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Unexpected route generation error" },
      { status: 500 }
    );
  }
}
