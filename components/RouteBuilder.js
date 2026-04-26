"use client";

import { useEffect, useRef, useState } from "react";
import DetailRouteMap from "./DetailRouteMap";
import {
  helperText,
  label,
  secondaryBtnSmall,
} from "../lib/enduranceStyles";

export default function RouteBuilder({
  form,
  setForm,
  canUseRouteBuilder,
  createRouteTrigger = 0,
}) {
  const [generating, setGenerating] = useState(false);
  const [routeError, setRouteError] = useState("");
  const lastTriggerRef = useRef(0);

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
    canUseRouteBuilder &&
    form.distance &&
    firstSport &&
    supportedSports.includes(firstSport) &&
    (form.location || form.startCoordinates);

  const generateRoute = async () => {
    setRouteError("");

    if (!canGenerate) {
      setRouteError(
        "Choose a supported sport, distance and location before generating a route."
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
            form.startCoordinates && form.location === "Current location"
              ? null
              : form.location,
          startCoordinates: form.startCoordinates || null,
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

  useEffect(() => {
    if (!canUseRouteBuilder) return;
    if (!createRouteTrigger) return;
    if (lastTriggerRef.current === createRouteTrigger) return;

    lastTriggerRef.current = createRouteTrigger;
    generateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRouteTrigger]);

  const clearGeneratedRoute = () => {
    setForm({
      ...form,
      route_points: null,
      route_distance_km: null,
      elevation_gain_m: null,
    });
  };

  if (!canUseRouteBuilder) return null;

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
        <div style={label}>Route Builder</div>

        <div style={helperText}>
          Start point: <strong>{form.location || "add a location first"}</strong>
        </div>

        <div style={helperText}>
          Route type: <strong>{firstSport || "choose a sport first"}</strong>
        </div>
      </div>

      {generating && (
        <div style={helperText}>Creating route...</div>
      )}

      {!supportedSports.includes(firstSport) && firstSport && (
        <div style={{ ...helperText, color: "#ffb4b4" }}>
          This sport is not supported for route generation yet.
        </div>
      )}

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

          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={clearGeneratedRoute}
              style={secondaryBtnSmall}
            >
              Clear Generated Route
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
