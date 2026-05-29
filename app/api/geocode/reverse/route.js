import { NextResponse } from "next/server";

export const runtime = "nodejs";

const REVERSE_BASES = [
  "https://api.heigit.org/geocode/reverse",
  "https://api.openrouteservice.org/geocode/reverse",
];

function pickPlace(properties = {}) {
  return (
    properties.locality ||
    properties.localadmin ||
    properties.municipality ||
    properties.county ||
    properties.city ||
    properties.town ||
    properties.village ||
    properties.borough ||
    properties.name ||
    properties.label ||
    ""
  );
}

export async function GET(request) {
  try {
    const apiKey =
      process.env.OPENROUTE_API_KEY ||
      process.env.OPENROUTESERVICE_API_KEY ||
      process.env.ORS_API_KEY ||
      process.env.NEXT_PUBLIC_OPENROUTE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing ORS/HeiGIT API key." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        { error: "lat and lon are required." },
        { status: 400 }
      );
    }

    let lastError = null;

    for (const base of REVERSE_BASES) {
      try {
        const url =
          `${base}?api_key=${encodeURIComponent(apiKey)}` +
          `&point.lat=${encodeURIComponent(lat)}` +
          `&point.lon=${encodeURIComponent(lon)}` +
          `&size=1`;

        const response = await fetch(url, {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          lastError = `${base} -> ${response.status}`;
          continue;
        }

        const data = await response.json();
        const feature = data?.features?.[0];
        const properties = feature?.properties || {};
        const coordinates = feature?.geometry?.coordinates || [];

        return NextResponse.json({
          place: pickPlace(properties),
          label: properties.label || properties.name || "",
          city: properties.city || "",
          town: properties.town || "",
          village: properties.village || "",
          municipality: properties.municipality || properties.localadmin || "",
          locality: properties.locality || "",
          county: properties.county || "",
          lat: Number(coordinates[1] ?? lat),
          lon: Number(coordinates[0] ?? lon),
          raw: properties,
        });
      } catch (error) {
        lastError = error?.message || "Reverse geocoding failed";
      }
    }

    return NextResponse.json(
      { error: lastError || "Could not reverse geocode location." },
      { status: 502 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Reverse geocode failed." },
      { status: 500 }
    );
  }
}
