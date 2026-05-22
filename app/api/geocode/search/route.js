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
        const url = `${base}?api_key=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(text)}&size=8`;

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

        const features = (data?.features || []).map((feature) => ({
          id: feature?.properties?.id || feature?.properties?.gid || crypto.randomUUID(),
          label:
            feature?.properties?.label ||
            feature?.properties?.name ||
            "Unknown location",
          lat: Number(feature?.geometry?.coordinates?.[1]),
          lon: Number(feature?.geometry?.coordinates?.[0]),
        }));

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
