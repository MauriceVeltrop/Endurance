// components/routes/RouteCard.js
"use client";

import Link from "next/link";
import OSMRouteMap from "../OSMRouteMap";
import { getSportLabel } from "../../lib/trainingHelpers";
import { getElevationStats } from "../../lib/routePreview";

function distanceText(route) {
  return route?.distance_km ? `${route.distance_km} km` : "Distance not set";
}

function elevationText(route) {
  return route?.elevation_gain_m ? `${route.elevation_gain_m} m` : "Elevation not set";
}

export default function RouteCard({ route }) {
  if (!route) return null;

  const href = `/routes/${route.id}`;
  const sportLabel = getSportLabel(route.sport_id);
  const elevationStats = getElevationStats(route.route_points);

  return (
    <article className="training-card route-feed-card route-feed-card-compact">
      <Link href={href} className="training-card-media route-card-map route-card-map-compact" aria-label={route.title}>
        <OSMRouteMap
          routePoints={route.route_points}
          title={route.title}
          compact
          interactive={false}
          showLegend={false}
          height={150}
        />
        <span className="route-card-map-label">OSM</span>
      </Link>

      <div className="training-card-body">
        <div className="training-card-badges">
          <span className="sport-badge">{sportLabel}</span>
          <span className="status-badge">{route.visibility}</span>
        </div>

        <Link href={href} className="training-card-title">
          {route.title || "Route"}
        </Link>

        {route.description ? (
          <p className="route-card-description">{route.description}</p>
        ) : null}

        <div className="training-card-meta">
          <span>↗ {distanceText(route)}</span>
          <span>⛰ {elevationText(route)}</span>
          <span>
            {elevationStats.available
              ? `Elevation ${elevationStats.min}-${elevationStats.max} m`
              : "No elevation profile"}
          </span>
        </div>

        <div className="training-card-actions">
          <Link href={href} className="primary-action small">
            Open route
          </Link>
          {route.gpx_file_url ? (
            <a href={route.gpx_file_url} target="_blank" rel="noreferrer" className="secondary-action small">
              GPX
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
