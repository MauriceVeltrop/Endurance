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
      distanceKm = 5,
      sport = "running",
    } = body;

    if (!startLocation) {
      return Response.json(
        { error: "Start location is required" },
        { status: 400 }
      );
    }

    const profileMap = {
      running: "foot-walking",
      "trail-running": "foot-hiking",
      walking: "foot-walking",
      "road-cycling": "cycling-road",
      "gravel-cycling": "cycling-regular",
      "mountain-biking": "cycling-mountain",
    };

    const orsProfile = profileMap[sport] || "foot-walking";

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

    const startCoordinates = firstResult.geometry.coordinates;
    const targetDistanceMeters = Math.round(Number(distanceKm) * 1000);

    const routeRes = await fetch(
      `https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`,
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [startCoordinates],
          elevation: true,
          instructions: false,
          options: {
            round_trip: {
              length: targetDistanceMeters,
              points: 3,
              seed: Math.floor(Math.random() * 100000),
            },
          },
        }),
      }
    );

    const routeData = await routeRes.json();

    if (!routeRes.ok) {
      return Response.json(
        {
          error:
            routeData?.error?.message ||
            routeData?.message ||
            "Route generation failed",
        },
        { status: 400 }
      );
    }

    const feature = routeData?.features?.[0];

    if (!feature?.geometry?.coordinates?.length) {
      return Response.json(
        { error: "No route returned" },
        { status: 404 }
      );
    }

    const coordinates = feature.geometry.coordinates;

    const routePoints = coordinates.map((coord) => ({
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
      startLocation,
      sport,
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
