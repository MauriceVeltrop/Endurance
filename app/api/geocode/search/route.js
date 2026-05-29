import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GEOCODE_BASES = [
  "https://api.heigit.org/geocode/search",
  "https://api.openrouteservice.org/geocode/search",
];

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
    const text = String(searchParams.get("text") || "").trim();

    if (!text || text.length < 2) {
      return NextResponse.json({ features: [] });
    }

    let lastError = null;

    for (const base of GEOCODE_BASES) {
      try {
        const params = new URLSearchParams({
          api_key: apiKey,
          text,
          size: "12",
          layers: "venue,address,street,locality,localadmin,neighbourhood,county,region",
          sources: "osm,wof,gn,oa",
        });

        const url = `${base}?${params.toString()}`;

        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          lastError = `${base} -> ${response.status}`;
          continue;
        }

        const data = await response.json();

        const features = (data?.features || [])
          .map((feature) => {
            const properties = feature?.properties || {};
            const name = properties.name || properties.label || "Unknown location";
            const locality =
              properties.locality ||
              properties.localadmin ||
              properties.county ||
              properties.region ||
              "";
            const country = properties.country || "";
            const layer = properties.layer || "";
            const category = properties.category || properties.kind || properties.source || "";

            const labelParts = [
              name,
              locality && locality !== name ? locality : "",
              country && !/^(Netherlands|Nederland)$/i.test(country) ? country : "",
            ].filter(Boolean);

            return {
              id: properties.id || properties.gid || crypto.randomUUID(),
              label: properties.label || labelParts.join(", ") || name,
              name,
              locality,
              layer,
              category,
              lat: Number(feature?.geometry?.coordinates?.[1]),
              lon: Number(feature?.geometry?.coordinates?.[0]),
            };
          })
          .filter((feature) => Number.isFinite(feature.lat) && Number.isFinite(feature.lon));

        return NextResponse.json({ features });
      } catch (error) {
        lastError = error?.message || "Geocoding failed";
      }
    }

    return NextResponse.json(
      { error: lastError || "Could not geocode location." },
      { status: 502 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Search failed." },
      { status: 500 }
    );
  }
}
