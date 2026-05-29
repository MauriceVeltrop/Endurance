// app/api/geocode/search/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ORS_GEOCODE_BASES = [
  "https://api.openrouteservice.org/geocode/search",
  "https://api.heigit.org/geocode/search",
];

function featureId(prefix, index, value) {
  return `${prefix}-${index}-${String(value || "").slice(0, 32)}`;
}

function normalizeFeature(feature, index, source = "ors") {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates || [];

  const name = properties.name || properties.label || properties.street || properties.locality || "Unknown location";
  const locality =
    properties.locality ||
    properties.localadmin ||
    properties.city ||
    properties.town ||
    properties.village ||
    properties.county ||
    properties.region ||
    "";
  const country = properties.country || "";

  const labelParts = [
    name,
    locality && locality !== name ? locality : "",
    country && !/^(Netherlands|Nederland)$/i.test(country) ? country : "",
  ].filter(Boolean);

  return {
    id: properties.id || properties.gid || featureId(source, index, name),
    label: properties.label || labelParts.join(", ") || name,
    name,
    locality,
    layer: properties.layer || "",
    category: properties.category || properties.kind || properties.osm_key || properties.source || source,
    lat: Number(coordinates[1]),
    lon: Number(coordinates[0]),
    source,
  };
}

function normalizePhotonFeature(feature, index) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates || [];

  const name = properties.name || properties.street || properties.city || properties.town || properties.village || "Unknown location";
  const locality = properties.city || properties.town || properties.village || properties.county || properties.state || "";
  const country = properties.country || "";

  return {
    id: properties.osm_id ? `photon-${properties.osm_type || "osm"}-${properties.osm_id}` : featureId("photon", index, name),
    label: [name, locality && locality !== name ? locality : "", country && !/^(Netherlands|Nederland)$/i.test(country) ? country : ""]
      .filter(Boolean)
      .join(", "),
    name,
    locality,
    layer: properties.osm_key || properties.type || "",
    category: properties.osm_value || properties.osm_key || "osm",
    lat: Number(coordinates[1]),
    lon: Number(coordinates[0]),
    source: "photon",
  };
}

function normalizeNominatimItem(item, index) {
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  const address = item?.address || {};
  const name =
    item?.name ||
    address.amenity ||
    address.shop ||
    address.tourism ||
    address.road ||
    address.neighbourhood ||
    address.suburb ||
    address.city ||
    address.town ||
    address.village ||
    "Unknown location";

  const locality = address.city || address.town || address.village || address.municipality || address.county || "";

  return {
    id: item?.osm_id ? `nominatim-${item.osm_type || "osm"}-${item.osm_id}` : featureId("nominatim", index, name),
    label: item?.display_name || [name, locality].filter(Boolean).join(", "),
    name,
    locality,
    layer: item?.class || "",
    category: item?.type || item?.class || "osm",
    lat,
    lon,
    source: "nominatim",
  };
}

function dedupe(features) {
  const seen = new Set();

  return features.filter((feature) => {
    if (!Number.isFinite(feature.lat) || !Number.isFinite(feature.lon)) return false;

    const key = `${feature.name}|${feature.locality}|${feature.lat.toFixed(5)}|${feature.lon.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchWithOrs(text, apiKey) {
  if (!apiKey) return [];

  for (const base of ORS_GEOCODE_BASES) {
    try {
      const params = new URLSearchParams({
        api_key: apiKey,
        text,
        size: "12",
        layers: "venue,address,street,locality,localadmin,neighbourhood,county,region",
        sources: "osm,wof,gn,oa",
        "focus.point.lat": "50.887",
        "focus.point.lon": "6.023",
        "boundary.country": "NL,BE,DE",
      });

      const response = await fetch(`${base}?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const features = (data?.features || []).map((feature, index) => normalizeFeature(feature, index, "ors"));
      if (features.length) return features;
    } catch (_) {}
  }

  return [];
}

async function searchWithPhoton(text) {
  try {
    const params = new URLSearchParams({
      q: text,
      limit: "12",
      lat: "50.887",
      lon: "6.023",
    });

    const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (data?.features || []).map(normalizePhotonFeature);
  } catch (_) {
    return [];
  }
}

async function searchWithNominatim(text) {
  try {
    const params = new URLSearchParams({
      q: text,
      format: "jsonv2",
      addressdetails: "1",
      limit: "12",
      countrycodes: "nl,be,de",
      viewbox: "5.2,51.4,7.4,50.4",
      bounded: "0",
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "EnduranceRouteBuilder/1.0 contact@endu-rance.nl",
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (Array.isArray(data) ? data : []).map(normalizeNominatimItem);
  } catch (_) {
    return [];
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const text = String(searchParams.get("text") || "").trim();

    if (!text || text.length < 2) {
      return NextResponse.json({ features: [] });
    }

    const apiKey =
      process.env.OPENROUTE_API_KEY ||
      process.env.OPENROUTESERVICE_API_KEY ||
      process.env.ORS_API_KEY ||
      process.env.NEXT_PUBLIC_OPENROUTE_API_KEY;

    const [ors, photon, nominatim] = await Promise.all([
      searchWithOrs(text, apiKey),
      searchWithPhoton(text),
      searchWithNominatim(text),
    ]);

    const features = dedupe([...ors, ...photon, ...nominatim]).slice(0, 12);

    return NextResponse.json({
      features,
      providers: {
        ors: ors.length,
        photon: photon.length,
        nominatim: nominatim.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Search failed.", features: [] },
      { status: 200 }
    );
  }
}
