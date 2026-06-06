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

function cleanParts(parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean);
}

function formatAddressLabel(address = {}, fallback = "") {
  const namedPlace =
    address.amenity ||
    address.tourism ||
    address.leisure ||
    address.shop ||
    address.office ||
    address.craft ||
    address.building ||
    "";

  const street = cleanParts([address.road, address.house_number]).join(" ");
  const place =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.hamlet ||
    address.suburb ||
    address.neighbourhood ||
    address.county ||
    "";

  if (namedPlace && place) return cleanParts([namedPlace, place]).join(", ");
  if (namedPlace) return namedPlace;
  if (street && place) return `${street}, ${place}`;
  if (street) return street;
  if (place) return place;

  return String(fallback || "").trim();
}

function formatFeatureLabel(properties = {}) {
  const name = properties.name || properties.label || "";
  const locality =
    properties.locality ||
    properties.localadmin ||
    properties.municipality ||
    properties.city ||
    properties.town ||
    properties.village ||
    properties.neighbourhood ||
    properties.county ||
    "";

  return cleanParts([name, locality]).join(", ") || properties.label || name || "";
}

async function reverseWithOrs(lat, lon, apiKey) {
  if (!apiKey) return null;

  for (const base of REVERSE_BASES) {
    try {
      const url =
        `${base}?api_key=${encodeURIComponent(apiKey)}` +
        `&point.lat=${encodeURIComponent(lat)}` +
        `&point.lon=${encodeURIComponent(lon)}` +
        `&size=6` + `&layers=venue,address,street,locality,neighbourhood`;

      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;

      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      const feature =
        features.find((item) => ["venue", "address"].includes(item?.properties?.layer)) ||
        features[0];

      if (!feature) continue;

      const properties = feature?.properties || {};
      const coordinates = feature?.geometry?.coordinates || [];
      const label = formatFeatureLabel(properties);

      return {
        place: pickPlace(properties),
        label,
        name: properties.name || "",
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
      zoom: "18",
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

    const label = formatAddressLabel(address, data?.display_name || data?.name || "");

    return {
      place,
      label,
      name: data?.name || address.amenity || address.tourism || address.shop || "",
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
