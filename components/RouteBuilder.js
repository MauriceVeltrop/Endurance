"use client";

import { useEffect, useState } from "react";
import DetailRouteMap from "./DetailRouteMap";
import {
  field,
  helperText,
  label,
  primaryBtnSmall,
  secondaryBtnSmall,
} from "../lib/enduranceStyles";

export default function RouteBuilder({
  form,
  setForm,
  canUseRouteBuilder,
}) {
  const [generating, setGenerating] = useState(false);
  const [locating, setLocating] = useState(false);
  const [routeError, setRouteError] = useState("");

  const [startLocation, setStartLocation] = useState(form.location || "");
  const [startCoordinates, setStartCoordinates] = useState(null);

  if (!canUseRouteBuilder) return null;

  const firstSport = Array.isArray(form.sports) ? form.sports[0] : null;

  const supportedSports = [
    "running",
    "trail-running",
    "walking",
    "road-cycling",
    "gravel-cycling",
    "mountain-biking",
  ];

  const canGenerate =
    form.distance &&
    firstSport &&
    supportedSports.includes(firstSport) &&
    (startLocation || startCoordinates);

  useEffect(() => {
    if (!navigator.geolocation) return;

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lon = position.coords.longitude;
        const lat = position.coords.latitude;

        setStartCoordinates([lon, lat]);
        setStartLocation("Current location");
        setLocating(false);
      },
      () => {
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  }, []);

  const useCurrentLocation = () => {
    setRouteError("");

    if (!navigator.geolocation) {
      setRouteError("Current location is not supported by this browser.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lon = position.coords.longitude;
        const lat = position.coords.latitude;

        setStartCoordinates([lon, lat]);
        setStartLocation("Current location");
        setLocating(false);
      },
      () => {
        setLocating(false);
        setRouteError("Could not access your current location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  };

  const generateRoute = async () => {
    setRouteError("");

    if (!canGenerate) {
      setRouteError(
        "Choose a supported sport, distance and start location before generating a route."
      );
      return;
    }

    setGenerating(true);

    try {
      const response = await fetch("/api/routes/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startLocation:
            startCoordinates && startLocation === "Current location"
              ? null
              : startLocation,
          startCoordinates,
          distanceKm: Number(form.distance),
          sport: firstSport,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Route generation failed");
      }

      setForm({
        ...form,
        distance: Number(data.distance).toFixed(2),
        route_distance_km: Number(data.route_distance_km).toFixed(2),
        elevation_gain_m: data.elevation_gain_m,
        route_points: data.route_points,
        gpxFile: null,
        gpx_file_path: null,
        gpx_file_url: null,
        gpx_uploaded_by: null,
      });
    } catch (error) {
      setRouteError(error.message || "Could not generate route.");
    } finally {
      setGenerating(false);
    }
  };

  const clearGeneratedRoute = () => {
    setForm({
      ...form,
      route_points: null,
      route_distance_km: null,
      elevation_gain_m: null,
    });
  };

  return (
    <div
      style={{
        background: "#101010",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 14,
        display: "grid",
        gap: 12,
      }}
    >
      <div>
        <div style={label}>Start location</div>

        <input
          value={startLocation}
          onChange={(e) => {
            setStartLocation(e.target.value);
            setStartCoordinates(null);
          }}
          placeholder="Example: Schanserweg 18, Landgraaf"
          style={field}
        />

        <div style={helperText}>
          Default: current location when permission is allowed.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={useCurrentLocation}
          style={secondaryBtnSmall}
          disabled={locating}
        >
          {locating ? "Locating..." : "Use Current Location"}
        </button>
      </div>

      <div style={helperText}>
        Route type: <strong>{firstSport || "choose a sport first"}</strong>
      </div>

      {!supportedSports.includes(firstSport) && firstSport && (
        <div style={{ ...helperText, color: "#ffb4b4" }}>
          This sport is not supported for route generation yet.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={generateRoute}
          disabled={generating || !canGenerate}
          style={{
            ...primaryBtnSmall,
            opacity: generating || !canGenerate ? 0.55 : 1,
          }}
        >
          {generating ? "Building..." : "Build Route"}
        </button>

        {form.route_points && (
          <button
            type="button"
            onClick={clearGeneratedRoute}
            style={secondaryBtnSmall}
          >
            Clear
          </button>
        )}
      </div>

      {routeError && (
        <div style={{ ...helperText, color: "#ffb4b4" }}>
          {routeError}
        </div>
      )}

      {form.route_points && (
        <div>
          <DetailRouteMap points={form.route_points} />

          <div style={helperText}>
            Distance:{" "}
            {Number(form.route_distance_km || form.distance).toFixed(2)} km
            {form.elevation_gain_m !== null &&
              form.elevation_gain_m !== undefined &&
              ` • ${form.elevation_gain_m} m+`}
          </div>
        </div>
      )}
    </div>
  );
}
