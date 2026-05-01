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

function getSurfaceBreakdown(feature) {
  const summary = feature?.properties?.extras?.surface?.summary || [];

  let paved = 0;
  let unpaved = 0;
  let unknown = 0;
  let total = 0;

  if (!Array.isArray(summary)) {
    return { paved, unpaved, unknown, total };
  }

  for (const item of summary) {
    const value = Number(item.value);
    const amount = Number(item.amount || 0);

    if (!Number.isFinite(value) || !Number.isFinite(amount)) continue;

    total += amount;

    if (PAVED_SURFACES.has(value)) {
      paved += amount;
    } else if (UNPAVED_SURFACES.has(value)) {
      unpaved += amount;
    } else {
      unknown += amount;
    }
  }

  return { paved, unpaved, unknown, total };
}

function getWayTypeBreakdown(feature) {
  const summary = feature?.properties?.extras?.waytypes?.summary || [];

  let total = 0;
  let likelyTrail = 0;

  if (!Array.isArray(summary)) {
    return { total, likelyTrail };
  }

  for (const item of summary) {
    const value = Number(item.value);
    const amount = Number(item.amount || 0);

    if (!Number.isFinite(value) || !Number.isFinite(amount)) continue;

    total += amount;

    // ORS waytype values can differ by profile/data, so this is intentionally
    // a broad bonus, not a hard dependency.
    // In practice these values often cover path/track/footway-like segments.
    if ([3, 4, 5, 6, 7].includes(value)) {
      likelyTrail += amount;
    }
  }

  return { total, likelyTrail };
}

function scoreRoute(feature, routePreference) {
  const surface = getSurfaceBreakdown(feature);
  const waytype = getWayTypeBreakdown(feature);

  const total =
    surface.total ||
    feature?.properties?.summary?.distance ||
    1;

  const pavedRatio = surface.paved / total;
  const unpavedRatio = surface.unpaved / total;
  const unknownRatio = surface.unknown / total;
  const trailWayRatio = waytype.total ? waytype.likelyTrail / waytype.total : 0;

  if (routePreference === "trail") {
    // Trail routes should avoid paved roads when unpaved alternatives exist.
    // Unknown surfaces get only a tiny bonus; paved gets a strong penalty.
    return (
      unpavedRatio * 2.8 +
      trailWayRatio * 0.6 +
      unknownRatio * 0.05 -
      pavedRatio * 2.2
    );
  }

  if (routePreference === "paved") {
    return pavedRatio * 2.5 - unpavedRatio * 1.6 + unknownRatio * 0.15;
  }

  return 0;
}

function getSurfaceScore(feature, routePreference) {
  const surface = getSurfaceBreakdown(feature);
  const total =
    surface.total ||
    feature?.properties?.summary?.distance ||
    1;

  if (routePreference === "trail") {
    return surface.unpaved / total;
  }

  if (routePreference === "paved") {
    return surface.paved / total;
  }

  return 0;
}

function getRequestOptions(routePreference, strictTrail = false) {
  if (routePreference === "trail") {
    return {
      roundTripPoints: strictTrail ? 5 : 4,
      avoidFeatures: strictTrail ? ["ferries", "highways"] : ["ferries"],
      preference: "recommended",
    };
  }

  if (routePreference === "paved") {
    return {
      roundTripPoints: 3,
      avoidFeatures: ["ferries"],
      preference: "recommended",
    };
  }

  return {
    roundTripPoints: 3,
    avoidFeatures: ["ferries"],
    preference: "recommended",
  };
}

async function requestRoute({
  apiKey,
  orsProfile,
  startCoords,
  targetDistanceMeters,
  seed,
  routePreference,
  includeExtraInfo = true,
  strictTrail = false,
}) {
  const requestOptions = getRequestOptions(routePreference, strictTrail);

  const body = {
    coordinates: [startCoords],
    elevation: true,
    instructions: false,
    preference: requestOptions.preference,
    options: {
      round_trip: {
        length: targetDistanceMeters,
        points: requestOptions.roundTripPoints,
        seed,
      },
      avoid_features: requestOptions.avoidFeatures,
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
  const attempts =
    routePreference === "trail" ? 14 : routePreference === "paved" ? 6 : 1;

  const candidates = [];
  let lastError = null;

  for (let i = 0; i < attempts; i++) {
    const strictTrail = routePreference === "trail" && i < 9;

    try {
      const feature = await requestRoute({
        apiKey,
        orsProfile,
        startCoords,
        targetDistanceMeters,
        seed: Math.floor(Math.random() * 1000000),
        routePreference,
        includeExtraInfo: true,
        strictTrail,
      });

      candidates.push({
        feature,
        score: scoreRoute(feature, routePreference),
        surfaceScore: getSurfaceScore(feature, routePreference),
        strictTrail,
      });
    } catch (error) {
      lastError = error;

      // If ORS rejects "highways" for this profile/region, retry the same
      // variation without strict avoid_features.
      if (routePreference === "trail" && strictTrail) {
        try {
          const feature = await requestRoute({
            apiKey,
            orsProfile,
            startCoords,
            targetDistanceMeters,
            seed: Math.floor(Math.random() * 1000000),
            routePreference,
            includeExtraInfo: true,
            strictTrail: false,
          });

          candidates.push({
            feature,
            score: scoreRoute(feature, routePreference),
            surfaceScore: getSurfaceScore(feature, routePreference),
            strictTrail: false,
          });
        } catch (fallbackError) {
          lastError = fallbackError;
        }
      }
    }
  }

  if (candidates.length === 0) {
    // Fallback for ORS plans/regions where extra_info is not accepted.
    const feature = await requestRoute({
      apiKey,
      orsProfile,
      startCoords,
      targetDistanceMeters,
      seed: Math.floor(Math.random() * 1000000),
      routePreference,
      includeExtraInfo: false,
      strictTrail: false,
    });

    return {
      feature,
      surfaceScore: null,
      routeQuality: null,
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  return {
    feature: best.feature,
    surfaceScore: Number.isFinite(best.surfaceScore)
      ? Number(best.surfaceScore.toFixed(3))
      : null,
    routeQuality: {
      score: Number(best.score.toFixed(3)),
      strictTrail: best.strictTrail,
      attempts: candidates.length,
    },
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

    const { feature, surfaceScore, routeQuality } = await getBestRoute({
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
      routeQuality,
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
