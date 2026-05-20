// components/routes/RouteElevationProfile.js
"use client";

import { useMemo } from "react";
import { getRoutePoints, getElevationStats } from "../../lib/routePreview";

function normalize(points) {
  const elevations = getRoutePoints(points)
    .map((point) => Number(point.ele))
    .filter((value) => Number.isFinite(value));

  if (elevations.length < 2) return null;

  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const range = max - min || 1;

  const width = 720;
  const height = 180;
  const padding = 18;

  const line = elevations
    .map((ele, index) => {
      const x = padding + (index / Math.max(1, elevations.length - 1)) * (width - padding * 2);
      const y = padding + ((max - ele) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;

  return { line, area, min, max, width, height };
}

export default function RouteElevationProfile({ routePoints }) {
  const chart = useMemo(() => normalize(routePoints), [routePoints]);
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
      <div className="premium-elevation-summary">
        <span>
          <b>{stats.min} m</b>
          Min
        </span>
        <span>
          <b>{stats.max} m</b>
          Max
        </span>
        <span>
          <b>{stats.range} m</b>
          Range
        </span>
      </div>

      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" className="premium-elevation-svg">
        <defs>
          <linearGradient id="premiumElevationStroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#a8ff00" />
            <stop offset="45%" stopColor="#e6ff00" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
          <linearGradient id="premiumElevationFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(230,255,0,0.30)" />
            <stop offset="100%" stopColor="rgba(230,255,0,0.01)" />
          </linearGradient>
        </defs>

        <polygon points={chart.area} fill="url(#premiumElevationFill)" />
        <polyline points={chart.line} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={chart.line} fill="none" stroke="url(#premiumElevationStroke)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
