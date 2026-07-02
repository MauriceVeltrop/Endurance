// app/api/routes/ors-probe/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ORS_ROUTING_BASES = [
  process.env.ORS_API_BASE_URL,
  process.env.OPENROUTE_API_BASE_URL,
  "https://api.openrouteservice.org/v2/directions",
  "https://api.heigit.org/routing/2/directions",
  "https://api.heigit.org/v2/directions",
].filter(Boolean);

const PROVIDER_TIMEOUT_MS = 20000;

function getOpenRouteServiceApiKey() {
  return (
    process.env.OPENROUTE_API_KEY ||
    process.env.OPENROUTESERVICE_API_KEY ||
    process.env.ORS_API_KEY ||
    process.env.NEXT_PUBLIC_OPENROUTE_API_KEY
  );
}

function normalizePoint(point) {
  const lat = Number(point?.lat ?? point?.latitude);
  const lon = Number(point?.lon ?? point?.lng ?? point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function normalizePoints(points) {
  return (Array.isArray(points) ? points : []).map(normalizePoint).filter(Boolean);
}

function orsProviderUrl(base, profile) {
  const cleanBase = String(base || "").replace(/\/+$/, "");
  return `${cleanBase}/${profile}/geojson`;
}

function getCustomModel(testKey) {
  switch (testKey) {
    case "B":
    case "avoid-road-class-path":
      return {
        priority: [
          {
            if: "road_class == PATH",
            multiply_by: 0.01,
          },
        ],
      };

    case "C":
    case "priority-path-zero":
      return {
        priority: [
          {
            if: "road_class == PATH",
            multiply_by: 0,
          },
        ],
      };

    case "A":
    case "baseline":
    default:
      return null;
  }
}

function summarizeFeature(feature) {
  return {
    distance: feature?.properties?.summary?.distance ?? null,
    duration: feature?.properties?.summary?.duration ?? null,
    extras: feature?.properties?.extras ?? null,
    geometry: feature?.geometry ?? null,
  };
}

async function runProbe({ body, testKey, profile, preference, points }) {
  const apiKey = getOpenRouteServiceApiKey();
  if (!apiKey) {
    return {
      test: testKey,
      ok: false,
      error: "OpenRouteService API key is missing.",
    };
  }

  const base = ORS_ROUTING_BASES[0];
  const url = orsProviderUrl(base, profile);
  const customModel = getCustomModel(testKey);

  const orsBody = {
    coordinates: points.map((point) => [point.lon, point.lat]),
    elevation: true,
    instructions: false,
    preference,
    geometry_simplify: false,
    format: "geojson",
    extra_info: ["waytype", "surface"],
    ...(customModel ? { custom_model: customModel } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  console.log("ORS probe request", {
    test: testKey,
    incoming_body: body,
    url,
    profile,
    preference,
    custom_model: customModel,
    ors_request_body: orsBody,
  });

  try {
    const startedAt = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json, application/geo+json",
      },
      body: JSON.stringify(orsBody),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (_) {
      data = rawText;
    }

    const features = Array.isArray(data?.features) ? data.features : [];
    const firstFeature = features[0] || null;
    const result = {
      test: testKey,
      ok: response.ok,
      http_status: response.status,
      elapsed_ms: Date.now() - startedAt,
      profile,
      preference,
      custom_model: customModel,
      request_body: orsBody,
      feature_count: features.length,
      extra_info: firstFeature?.properties?.extras ?? null,
      geometry: firstFeature?.geometry ?? null,
      features: features.map(summarizeFeature),
      ors_response: data,
      ors_error: response.ok ? null : data,
    };

    console.log("ORS probe response", result);
    return result;
  } catch (error) {
    const result = {
      test: testKey,
      ok: false,
      http_status: null,
      profile,
      preference,
      custom_model: customModel,
      request_body: orsBody,
      feature_count: 0,
      extra_info: null,
      geometry: null,
      ors_response: null,
      ors_error: {
        name: error?.name || "Error",
        message: error?.message || "Unknown ORS probe error",
      },
    };

    console.error("ORS probe error", result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const points = normalizePoints(body?.points);
  if (points.length < 2) {
    return NextResponse.json({ ok: false, error: "At least two points are required." }, { status: 400 });
  }

  const segment = [points[0], points[points.length - 1]];
  const profile = body?.profile || "foot-walking";
  const preference = body?.preference || "recommended";
  const requestedTest = body?.test || body?.case || "all";
  const tests = requestedTest === "all" ? ["A", "B", "C"] : [requestedTest];

  const results = [];
  for (const testKey of tests) {
    // Sequential on purpose: easier to read logs and avoids overlapping ORS failures.
    // eslint-disable-next-line no-await-in-loop
    results.push(await runProbe({ body, testKey, profile, preference, points: segment }));
  }

  return NextResponse.json({
    ok: results.every((result) => result.ok),
    probe: "ors-running-custom-model",
    profile,
    preference,
    tests,
    results,
  });
}
