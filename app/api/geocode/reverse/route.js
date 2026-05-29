// app/api/geocode/reverse/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const REVERSE_BASES = [
  "https://api.openrouteservice.org/geocode/reverse",
  "https://api.heigit.org/geocode/reverse",
];

function pickPlace(properties = {}) {
  return (
    properties.locality ||
    properties.localadmin ||
    properties.municipality ||
    properties.city ||
    properties.town ||
    properties.village ||
    properties.borough ||
    properties.county ||
    properties.name ||
    properties.label ||
    ""
  );
}

async function reverseWithOrs(lat, lon, apiKey) {
  if (!apiKey) return null;

  for (const base of REVERSE_BASES) {
    try {
      const url =
        `${base}?api_key=${encodeURIComponent(apiKey)}` +
        `&point.lat=${encodeURIComponent(lat)}` +
        `&point.lon=${encodeURIComponent(lon)}` +
        `&size=1`;

      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;

      const data = await response.json();
      const feature = data?.features?.[0];
      if (!feature) continue;

      const properties = feature?.properties || {};
      const coordinates = feature?.geometry?.coordinates || [];

      return {
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
        source: "ors",
      };
    } catch (_) {}
  }

  return null;
}

async function reverseWithNominatim(lat, lon) {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "16",
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "EnduranceRouteBuilder/1.0 contact@endu-rance.nl",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const address = data?.address || {};

    const place =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.suburb ||
      address.neighbourhood ||
      address.county ||
      data?.name ||
      "";

    return {
      place,
      label: data?.display_name || data?.name || "",
      city: address.city || "",
      town: address.town || "",
      village: address.village || "",
      municipality: address.municipality || "",
      locality: address.suburb || address.neighbourhood || "",
      county: address.county || "",
      lat,
      lon,
      raw: address,
      source: "nominatim",
    };
  } catch (_) {
    return null;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: "lat and lon are required." }, { status: 400 });
    }

    const apiKey =
      process.env.OPENROUTE_API_KEY ||
      process.env.OPENROUTESERVICE_API_KEY ||
      process.env.ORS_API_KEY ||
      process.env.NEXT_PUBLIC_OPENROUTE_API_KEY;

    const result =
      (await reverseWithOrs(lat, lon, apiKey)) ||
      (await reverseWithNominatim(lat, lon)) ||
      {
        place: "",
        label: "",
        city: "",
        town: "",
        village: "",
        municipality: "",
        locality: "",
        county: "",
        lat,
        lon,
        raw: {},
        source: "fallback",
      };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        place: "",
        label: "",
        lat: null,
        lon: null,
        error: error?.message || "Reverse geocode failed.",
      },
      { status: 200 }
    );
  }
}
