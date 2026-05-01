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

const PAVED_SURFACES = new Set([1, 3, 4, 5, 14, 18]);
const UNPAVED_SURFACES = new Set([2, 8, 9, 10, 11, 12, 15, 16, 17]);

// ORS waytype values: this intentionally stays broad because values can differ
// slightly by region/profile. These are treated as path/track/footway-like.
const TRAIL_WAYTYPES = new Set([4, 5, 6, 7]);
const ROAD_WAYTYPES = new Set([1, 2, 3]);

function getExtraSummary(feature, key) {
  const summary = feature?.properties?.extras?.[key]?.summary;
  return Array.isArray(summary) ? summary : [];
}

function getSurfaceBreakdown(feature) {
  const summary = getExtraSummary(feature, "surface");
  let paved = 0;
  let unpaved = 0;
  let unknown = 0;
  let total = 0;

  for (const item of summary) {
    const value = Number(item.value);
    const amount = Number(item.amount || 0);
    if (!Number.isFinite(value) || !Number.isFinite(amount)) continue;

    total += amount;

    if (PAVED_SURFACES.has(value)) paved += amount;
    else if (UNPAVED_SURFACES.has(value)) unpaved += amount;
    else unknown += amount;
  }

  return { paved, unpaved, unknown, total };
}

function getWayTypeBreakdown(feature) {
  const summary = getExtraSummary(feature, "waytypes");
  let total = 0;
  let trailLike = 0;
  let roadLike = 0;

  for (const item of summary) {
    const value = Number(item.value);
    const amount = Number(item.amount || 0);
    if (!Number.isFinite(value) || !Number.isFinite(amount)) continue;

    total += amount;

    if (TRAIL_WAYTYPES.has(value)) trailLike += amount;
    else if (ROAD_WAYTYPES.has(value)) roadLike += amount;
  }

  return { total, trailLike, roadLike };
}

function getSteepnessBreakdown(feature) {
  const summary = getExtraSummary(feature, "steepness");
  let total = 0;
  let rolling = 0;
  let steep = 0;

  for (const item of summary) {
    const value = Math.abs(Number(item.value));
    const amount = Number(item.amount || 0);
    if (!Number.isFinite(value) || !Number.isFinite(amount)) continue;

    total += amount;
    if (value >= 2 && value <= 5) rolling += amount;
    if (value >= 4) steep += amount;
  }

  return { total, rolling, steep };
}

function getShapeVariety(feature) {
  const coords = feature?.geometry?.coordinates || [];
  if (!Array.isArray(coords) || coords.length < 3) return 0;

  let changes = 0;

  for (let i = 2; i < coords.length; i++) {
    const a = coords[i - 2];
    const b = coords[i - 1];
    const c = coords[i];

    const angle1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const angle2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let diff = Math.abs(angle2 - angle1);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > 0.35) changes += 1;
  }

  return changes / Math.max(coords.length - 2, 1);
}

function safeRatio(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return part / total;
}

function getScoreDetails(feature, routePreference) {
  const distance = Number(feature?.properties?.summary?.distance || 0);
  const surface = getSurfaceBreakdown(feature);
  const waytype = getWayTypeBreakdown(feature);
  const steepness = getSteepnessBreakdown(feature);

  const surfaceTotal = surface.total || distance || 1;
  const wayTotal = waytype.total || distance || 1;
  const steepTotal = steepness.total || distance || 1;

  const pavedRatio = safeRatio(surface.paved, surfaceTotal);
  const unpavedRatio = safeRatio(surface.unpaved, surfaceTotal);
  const unknownRatio = safeRatio(surface.unknown, surfaceTotal);
  const trailWayRatio = safeRatio(waytype.trailLike, wayTotal);
  const roadWayRatio = safeRatio(waytype.roadLike, wayTotal);
  const rollingRatio = safeRatio(steepness.rolling, steepTotal);
  const steepRatio = safeRatio(steepness.steep, steepTotal);
  const shapeVariety = getShapeVariety(feature);

  // Heatmap-like proxy: not real Garmin/Strava heatmap data.
  // It rewards path/track density, route shape variety and rolling terrain.
  const heatmapProxy =
    trailWayRatio * 0.5 + shapeVariety * 0.25 + rollingRatio * 0.25;

  let score = 0;

  if (routePreference === "trail") {
    score =
      unpavedRatio * 4.0 +
      trailWayRatio * 2.2 +
      heatmapProxy * 1.2 +
      rollingRatio * 0.35 +
      unknownRatio * 0.05 -
      pavedRatio * 3.8 -
      roadWayRatio * 2.4 -
      steepRatio * 0.15;
  } else if (routePreference === "paved") {
    score =
      pavedRatio * 3.2 +
      trailWayRatio * 0.35 -
      unpavedRatio * 2.2 -
      steepRatio * 0.25;
  }

  return {
    score,
    pavedRatio,
    unpavedRatio,
    unknownRatio,
    trailWayRatio,
    roadWayRatio,
    rollingRatio,
    heatmapProxy,
  };
}

function getRequestPlan(routePreference, index) {
  if (routePreference === "trail") {
    if (index < 6) {
      return {
        points: 5,
        avoidFeatures: ["ferries", "highways"],
        preference: "recommended",
        profileHint: "strict-trail",
      };
    }

    if (index < 12) {
      return {
        points: 4,
        avoidFeatures: ["ferries"],
        preference: "recommended",
        profileHint: "trail",
      };
    }

    if (index < 16) {
      return {
        points: 3,
        avoidFeatures: ["ferries"],
        preference: "recommended",
        profileHint: "soft-trail",
      };
    }

    return {
      points: 3,
      avoidFeatures: [],
      preference: "recommended",
      profileHint: "safe-fallback",
    };
  }

  return {
    points: 3,
    avoidFeatures: ["ferries"],
    preference: "recommended",
    profileHint: routePreference === "paved" ? "paved" : "default",
  };
}

async function requestRoute({
  apiKey,
  orsProfile,
  startCoords,
  targetDistanceMeters,
  seed,
  includeExtraInfo,
  requestPlan,
}) {
  const body = {
    coordinates: [startCoords],
    elevation: true,
    instructions: false,
    preference: requestPlan.preference,
    options: {
      round_trip: {
        length: targetDistanceMeters,
        points: requestPlan.points,
        seed,
      },
    },
  };

  if (requestPlan.avoidFeatures.length) {
    body.options.avoid_features = requestPlan.avoidFeatures;
  }

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
    routePreference === "trail" ? 20 : routePreference === "paved" ? 8 : 1;

  const candidates = [];
  let lastError = null;

  for (let i = 0; i < attempts; i++) {
    const requestPlan = getRequestPlan(routePreference, i);

    try {
      const feature = await requestRoute({
        apiKey,
        orsProfile,
        startCoords,
        targetDistanceMeters,
        seed: Math.floor(Math.random() * 1000000),
        includeExtraInfo: true,
        requestPlan,
      });

      candidates.push({
        feature,
        details: getScoreDetails(feature, routePreference),
        requestPlan,
      });
    } catch (error) {
      lastError = error;

      try {
        const fallbackPlan = {
          ...getRequestPlan(routePreference, Math.min(i + 6, attempts - 1)),
          avoidFeatures: [],
          profileHint: "fallback-no-extra-info",
        };

        const feature = await requestRoute({
          apiKey,
          orsProfile,
          startCoords,
          targetDistanceMeters,
          seed: Math.floor(Math.random() * 1000000),
          includeExtraInfo: false,
          requestPlan: fallbackPlan,
        });

        candidates.push({
          feature,
          details: {
            score: routePreference === "trail" ? -1 : 0,
            pavedRatio: null,
            unpavedRatio: null,
            trailWayRatio: null,
            heatmapProxy: null,
          },
          requestPlan: fallbackPlan,
        });
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }
  }

  if (!candidates.length) {
    throw lastError || new Error("Route generation failed");
  }

  candidates.sort((a, b) => b.details.score - a.details.score);
  const best = candidates[0];

  const preferredRatio =
    routePreference === "trail"
      ? best.details.unpavedRatio
      : best.details.pavedRatio;

  return {
    feature: best.feature,
    surfaceScore: Number.isFinite(preferredRatio)
      ? Number(preferredRatio.toFixed(3))
      : null,
    routeQuality: {
      score: Number.isFinite(best.details.score)
        ? Number(best.details.score.toFixed(3))
        : null,
      pavedRatio: Number.isFinite(best.details.pavedRatio)
        ? Number(best.details.pavedRatio.toFixed(3))
        : null,
      unpavedRatio: Number.isFinite(best.details.unpavedRatio)
        ? Number(best.details.unpavedRatio.toFixed(3))
        : null,
      trailWayRatio: Number.isFinite(best.details.trailWayRatio)
        ? Number(best.details.trailWayRatio.toFixed(3))
        : null,
      heatmapProxy: Number.isFinite(best.details.heatmapProxy)
        ? Number(best.details.heatmapProxy.toFixed(3))
        : null,
      attempts: candidates.length,
      profileHint: best.requestPlan.profileHint,
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

          if (street && locality) resolvedLocation = `${street}, ${locality}`;
          else if (locality) resolvedLocation = locality;
          else if (props.label) resolvedLocation = props.label;
          else resolvedLocation = "Current location";
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

    // Keep the generated route visually anchored to the selected Add Event
    // start point. OpenRouteService may snap to the nearest routable road/path,
    // but the app should not move the chosen start/end location.
    if (routePoints.length > 1 && Array.isArray(startCoords)) {
      const startPoint = {
        lon: startCoords[0],
        lat: startCoords[1],
        ele: routePoints[0]?.ele ?? 0,
      };

      routePoints[0] = startPoint;
      routePoints[routePoints.length - 1] = {
        ...startPoint,
        ele: routePoints[routePoints.length - 1]?.ele ?? startPoint.ele,
      };
    }

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
