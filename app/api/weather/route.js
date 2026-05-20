export const dynamic = "force-dynamic";

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isNightHour(date) {
  if (!date) return false;
  const hour = date.getHours();
  return hour >= 21 || hour < 6;
}

function nearestIndex(times = [], targetDate) {
  if (!Array.isArray(times) || !times.length || !targetDate) return -1;

  let bestIndex = -1;
  let bestDiff = Infinity;

  times.forEach((time, index) => {
    const value = new Date(time).getTime();
    if (!Number.isFinite(value)) return;

    const diff = Math.abs(value - targetDate.getTime());

    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function weatherCodeText(code, night = false) {
  if (code === 0) return night ? "Clear night" : "Clear";
  if ([1, 2].includes(code)) return night ? "Partly clear" : "Partly cloudy";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Forecast";
}

function weatherIcon(code, night = false) {
  if (code === 0) return night ? "🌙" : "☀️";
  if ([1, 2].includes(code)) return night ? "🌙" : "⛅";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return night ? "🌙" : "🌡️";
}

function isEurope(latitude, longitude) {
  return latitude >= 34 && latitude <= 72 && longitude >= -25 && longitude <= 45;
}

function isNetherlandsNearby(latitude, longitude) {
  return latitude >= 50.6 && latitude <= 53.7 && longitude >= 3.1 && longitude <= 7.4;
}

function looksLikeCurrentLocation(location) {
  return /^(current location|huidige locatie|my location|near me)$/i.test(String(location || "").trim());
}

async function geocodeWithNominatim(location) {
  const query = String(location || "").trim();
  if (!query || looksLikeCurrentLocation(query)) return null;

  const searchQuery = /nederland|netherlands|belgium|belgië/i.test(query)
    ? query
    : `${query}, Nederland`;

  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=nl,be&q=" +
    encodeURIComponent(searchQuery);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Endurance/1.0 weather geocoding",
    },
    next: { revalidate: 86400 },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const place = data?.[0];

  if (!place?.lat || !place?.lon) return null;

  return {
    latitude: Number(place.lat),
    longitude: Number(place.lon),
    name: place.display_name || query,
    source: "nominatim",
  };
}

async function geocodeWithOpenMeteo(location) {
  const query = String(location || "").trim();
  if (!query || looksLikeCurrentLocation(query)) return null;

  const searchQuery = /nederland|netherlands|belgium|belgië/i.test(query)
    ? query
    : `${query}, Nederland`;

  const url =
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(searchQuery) +
    "&count=1&language=en&format=json";

  const response = await fetch(url, {
    next: { revalidate: 86400 },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const result = data?.results?.[0];

  if (!result?.latitude || !result?.longitude) return null;

  return {
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    name: [result.name, result.country].filter(Boolean).join(", ") || query,
    source: "open-meteo-geocoding",
  };
}

async function resolveLocation({ location, latitude, longitude }) {
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return {
      latitude,
      longitude,
      name: location || "Current location",
      source: "coordinates",
    };
  }

  if (looksLikeCurrentLocation(location)) {
    return null;
  }

  return (await geocodeWithNominatim(location)) || (await geocodeWithOpenMeteo(location));
}

async function fetchOpenMeteo({ endpoint, latitude, longitude, targetDate }) {
  const dateString = targetDate.toISOString().slice(0, 10);

  const url =
    `https://api.open-meteo.com/v1/${endpoint}` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,uv_index` +
    `&start_date=${dateString}` +
    `&end_date=${dateString}` +
    `&timezone=Europe/Amsterdam`;

  const response = await fetch(url, {
    next: { revalidate: 1800 },
  });

  if (!response.ok) return null;

  return response.json();
}

async function loadForecast({ latitude, longitude, targetDate }) {
  const preferKnmi = isEurope(latitude, longitude);
  const attempts = preferKnmi ? ["knmi", "forecast"] : ["forecast"];

  for (const endpoint of attempts) {
    const data = await fetchOpenMeteo({ endpoint, latitude, longitude, targetDate });
    const hourly = data?.hourly || {};
    const index = nearestIndex(hourly.time, targetDate);

    if (index >= 0) {
      return {
        endpoint,
        hourly,
        index,
      };
    }
  }

  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const location = searchParams.get("location") || "";
  const time = searchParams.get("time");
  const latitude = parseNumber(searchParams.get("latitude"));
  const longitude = parseNumber(searchParams.get("longitude"));

  if (!time) {
    return Response.json({ ok: false, error: "Missing forecast time." }, { status: 400 });
  }

  const targetDate = new Date(time);

  if (Number.isNaN(targetDate.getTime())) {
    return Response.json({ ok: false, error: "Invalid forecast time." }, { status: 400 });
  }

  const resolved = await resolveLocation({ location, latitude, longitude });

  if (!resolved) {
    return Response.json(
      {
        ok: false,
        error: "Current location needs coordinates. Save the training with latitude and longitude.",
      },
      { status: 422 }
    );
  }

  const forecastData = await loadForecast({
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    targetDate,
  });

  if (!forecastData) {
    return Response.json({ ok: false, error: "Forecast unavailable." }, { status: 502 });
  }

  const { endpoint, hourly, index } = forecastData;
  const forecastTime = hourly.time?.[index];
  const forecastDate = forecastTime ? new Date(forecastTime) : targetDate;
  const night = isNightHour(forecastDate);
  const code = hourly.weather_code?.[index];

  const providerLabel =
    endpoint === "knmi"
      ? isNetherlandsNearby(resolved.latitude, resolved.longitude)
        ? "KNMI HARMONIE"
        : "KNMI/European model"
      : "Global forecast";

  const source =
    endpoint === "knmi"
      ? "KNMI HARMONIE via Open-Meteo"
      : "Open-Meteo global fallback";

  return Response.json({
    ok: true,
    provider: endpoint,
    providerLabel,
    forecast: {
      source,
      provider: endpoint,
      providerLabel,
      place: resolved.name,
      locationSource: resolved.source,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      forecastTime,
      temperature: Math.round(hourly.temperature_2m?.[index]),
      precipitation: hourly.precipitation_probability?.[index],
      wind: Math.round(hourly.wind_speed_10m?.[index] || 0),
      uv: Math.round(hourly.uv_index?.[index] || 0),
      code,
      isNight: night,
      condition: weatherCodeText(code, night),
      icon: weatherIcon(code, night),
    },
  });
}
