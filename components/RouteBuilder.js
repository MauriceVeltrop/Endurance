
"use client";

import { useState } from "react";
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
  const [routeError, setRouteError] = useState("");

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
    form.location &&
    form.distance &&
    firstSport &&
    supportedSports.includes(firstSport);

  const generateRoute = async () => {
    setRouteError("");

    if (!canGenerate) {
      setRouteError(
        "Choose a supported sport, location and distance before generating a route."
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
          startLocation: form.location,
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
        background: "#0b0b0b",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: 14,
        display: "grid",
        gap: 12,
      }}
    >
      <div>
        <div style={{ ...label, color: "#e4ef16", fontWeight: 700 }}>
          Route Builder
        </div>

        <div style={helperText}>
          Generate a route from the event location using OpenRouteService.
          Available for moderators and organizers.
        </div>
      </div>

      <div>
        <div style={label}>Start location</div>
        <input
          value={form.location || ""}
          onChange={(e) =>
            setForm({
              ...form,
              location: e.target.value,
            })
          }
          placeholder="Example: Schanserweg 18, Landgraaf"
          style={field}
        />
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
          {generating ? "Generating..." : "Generate Route"}
        </button>

        {form.route_points && (
          <button
            type="button"
            onClick={clearGeneratedRoute}
            style={secondaryBtnSmall}
          >
            Clear Route
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
            Distance: {Number(form.route_distance_km || form.distance).toFixed(2)} km
            {form.elevation_gain_m !== null &&
              form.elevation_gain_m !== undefined &&
              ` • ${form.elevation_gain_m} m+`}
          </div>
        </div>
      )}
    </div>
  );
}
