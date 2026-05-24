// components/routes/RouteElevationProfile.js
"use client";

import { useMemo } from "react";
import { getElevationSeries, getElevationStats } from "../../lib/routePreview";

function buildChart(routePoints) {
  const series = getElevationSeries(routePoints);

  if (series.length < 2) return null;

  const elevations = series.map((point) => point.ele);
  const distances = series.map((point) => point.distanceKm);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const range = max - min || 1;
  const maxDistance = Math.max(...distances) || 1;

  const width = 720;
  const height = 190;
  const paddingX = 22;
  const paddingY = 18;

  const line = series
    .map((point) => {
      const x = paddingX + (point.distanceKm / maxDistance) * (width - paddingX * 2);
      const y = paddingY + ((max - point.ele) / range) * (height - paddingY * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const area = `${paddingX},${height - paddingY} ${line} ${width - paddingX},${height - paddingY}`;

  return { line, area, min, max, width, height, maxDistance };
}

export default function RouteElevationProfile({ routePoints }) {
  const chart = useMemo(() => buildChart(routePoints), [routePoints]);
  const stats = useMemo(() => getElevationStats(routePoints), [routePoints]);

  if (!chart) {
    return (
      <div className="premium-elevation-empty">
        <strong>No elevation profile</strong>
        <span>Upload a GPX with elevation data to unlock climb analysis.</span>
      </div>
    );
  }

  return (
    <div className="premium-elevation">
      <div className="premium-elevation-summary premium-elevation-summary-v2">
        <span>
          <b>{stats.gain ?? "—"} m</b>
          Gain
        </span>
        <span>
          <b>{stats.loss ?? "—"} m</b>
          Loss
        </span>
        <span>
          <b>{stats.min}–{stats.max} m</b>
          Altitude
        </span>
        <span>
          <b>{chart.maxDistance.toFixed(1)} km</b>
          Profile length
        </span>
      </div>

      <div className="premium-elevation-chart-shell">
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" className="premium-elevation-svg premium-elevation-svg-v2">
          <defs>
            <linearGradient id="premiumElevationStrokeV2" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#a8ff00" />
              <stop offset="45%" stopColor="#e6ff00" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <linearGradient id="premiumElevationFillV2" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(230,255,0,0.28)" />
              <stop offset="100%" stopColor="rgba(230,255,0,0.015)" />
            </linearGradient>
          </defs>

          <polygon points={chart.area} fill="url(#premiumElevationFillV2)" />
          <polyline points={chart.line} fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={chart.line} fill="none" stroke="url(#premiumElevationStrokeV2)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <div className="premium-elevation-axis">
          <span>0 km</span>
          <span>{chart.maxDistance.toFixed(1)} km</span>
        </div>
      </div>
    </div>
  );
}
