export const dynamic = "force-dynamic";

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
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Forecast";
}

function weatherIcon(code, night = false) {
  if (code === 0) return night ? "🌙" : "☀️";
  if ([1, 2].includes(code)) return night ? "🌙" : "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return night ? "🌙" : "🌡️";
}

function useEuropeanForecast(latitude, longitude) {
  return (
    latitude >= 34 &&
    latitude <= 72 &&
    longitude >= -25 &&
    longitude <= 45
  );
}

async function geocodeLocation(location) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(location) +
    "&count=1&language=en&format=json";

  const response = await fetch(url, {
    next: { revalidate: 86400 },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const result = data?.results?.[0];

  if (!result) return null;

  return {
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    name: result.name || location,
    country: result.country || "",
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const location = searchParams.get("location") || "";
  const time = searchParams.get("time");

  if (!location || !time) {
    return Response.json(
      { ok: false, error: "Missing location or time" },
      { status: 400 }
    );
  }

  const targetDate = new Date(time);

  if (Number.isNaN(targetDate.getTime())) {
    return Response.json(
      { ok: false, error: "Invalid date" },
      { status: 400 }
    );
  }

  let latitude = Number(searchParams.get("latitude"));
  let longitude = Number(searchParams.get("longitude"));
  let place = location;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const geo = await geocodeLocation(location);

    if (!geo) {
      return Response.json(
        { ok: false, error: "Could not geocode location" },
        { status: 404 }
      );
    }

    latitude = geo.latitude;
    longitude = geo.longitude;
    place = geo.country
      ? `${geo.name}, ${geo.country}`
      : geo.name;
  }

  const endpoint = useEuropeanForecast(latitude, longitude)
    ? "knmi"
    : "forecast";

  const source =
    endpoint === "knmi"
      ? "KNMI HARMONIE via Open-Meteo"
      : "Open-Meteo global forecast";

  const dateString = targetDate.toISOString().slice(0, 10);

  const url =
    `https://api.open-meteo.com/v1/${endpoint}` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,uv_index` +
    `&start_date=${dateString}` +
    `&end_date=${dateString}` +
    `&timezone=auto`;

  const response = await fetch(url, {
    next: { revalidate: 1800 },
  });

  if (!response.ok) {
    return Response.json(
      { ok: false, error: "Forecast unavailable" },
      { status: 502 }
    );
  }

  const data = await response.json();
  const hourly = data?.hourly || {};

  const index = nearestIndex(hourly.time, targetDate);

  if (index < 0) {
    return Response.json(
      { ok: false, error: "No hourly forecast found" },
      { status: 404 }
    );
  }

  const forecastTime = hourly.time?.[index];
  const forecastDate = forecastTime
    ? new Date(forecastTime)
    : targetDate;

  const isNight = isNightHour(forecastDate);
  const code = hourly.weather_code?.[index];

  return Response.json({
    ok: true,
    forecast: {
      source,
      place,
      latitude,
      longitude,
      forecastTime,
      temperature: Math.round(hourly.temperature_2m?.[index]),
      precipitation: hourly.precipitation_probability?.[index],
      wind: Math.round(hourly.wind_speed_10m?.[index] || 0),
      uv: Math.round(hourly.uv_index?.[index] || 0),
      code,
      isNight,
      condition: weatherCodeText(code, isNight),
      icon: weatherIcon(code, isNight),
    },
  });
}
