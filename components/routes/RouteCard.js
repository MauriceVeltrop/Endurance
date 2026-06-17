// components/routes/RouteCard.js
"use client";

import Link from "next/link";
import OSMRouteMap from "../OSMRouteMap";
import { getSportLabel } from "../../lib/trainingHelpers";
import { getElevationStats } from "../../lib/routePreview";

function distanceText(route) {
  return route?.distance_km ? `${Number(route.distance_km).toFixed(1).replace(".0", "")} km` : "Distance not set";
}

function elevationGainText(route) {
  return route?.elevation_gain_m ? `+${Math.round(Number(route.elevation_gain_m))} m` : "Elevation not set";
}

function creatorName(route) {
  const creator = route?.creator || route?.profiles || route?.profile || {};
  return (
    creator.name ||
    [creator.first_name, creator.last_name].filter(Boolean).join(" ") ||
    route?.creator_name ||
    "Endurance athlete"
  );
}

function creatorId(route) {
  return route?.creator?.id || route?.profiles?.id || route?.creator_id || null;
}

export default function RouteCard({ route }) {
  if (!route) return null;

  const href = `/routes/${route.id}`;
  const sportLabel = getSportLabel(route.sport_id);
  const elevationStats = getElevationStats(route.route_points);
  const elevationRange = elevationStats.available
    ? `${elevationStats.min}–${elevationStats.max} m elevation`
    : "No elevation profile";
  const makerName = creatorName(route);
  const makerId = creatorId(route);

  return (
    <article className="route-osm-card">
      <Link href={href} className="route-osm-card-map" aria-label={`Open ${route.title || "route"} on OpenStreetMap`}>
        <OSMRouteMap
          routePoints={route.route_points}
          title={route.title}
          compact
          interactive={false}
          showLegend={false}
          height={230}
          defaultLayer="osm"
        />
      </Link>

      <div className="route-osm-card-body">
        {makerId ? (
          <Link href={`/profile/${makerId}`} className="card-creator-link">
            {makerName}
          </Link>
        ) : (
          <span className="card-creator-link">{makerName}</span>
        )}

        <Link href={href} className="route-osm-title">
          {route.title || "Running Route"}
        </Link>

        <div className="route-feed-badges">
          <span className="sport-badge">{sportLabel}</span>
          <span className="status-badge">{route.visibility}</span>
        </div>

        <div className="route-osm-meta-row">
          <span>{distanceText(route)}</span>
          <i />
          <span>{elevationGainText(route)}</span>
        </div>

        <div className="route-osm-submeta">
          <span>{elevationRange}</span>
        </div>
      </div>
    </article>
  );
}
