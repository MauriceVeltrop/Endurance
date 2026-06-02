// components/routes/RouteCard.js
"use client";

import Link from "next/link";
import OSMRouteMap from "../OSMRouteMap";
import { getSportLabel } from "../../lib/trainingHelpers";
import { getElevationStats } from "../../lib/routePreview";

function formatNumber(value, digits = 1) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number.toFixed(digits).replace(/\.0$/, "");
}

function distanceText(route) {
  const distance = formatNumber(route?.distance_km, 1);
  return distance ? `${distance} km` : "Distance not set";
}

function elevationGainText(route) {
  const elevation = formatNumber(route?.elevation_gain_m, 0);
  return elevation ? `+${elevation} m` : "Elevation not set";
}

function routeArea(route) {
  const title = String(route?.title || "").trim();
  const description = String(route?.description || "").trim();
  const haystack = `${title} ${description}`;

  if (/landgraaf/i.test(haystack)) return "Landgraaf";
  if (/heerlen/i.test(haystack)) return "Heerlen";
  if (/brunssum/i.test(haystack)) return "Brunssum";

  return "Saved route";
}

export default function RouteCard({ route }) {
  if (!route) return null;

  const href = `/routes/${route.id}`;
  const sportLabel = getSportLabel(route.sport_id);
  const elevationStats = getElevationStats(route.route_points);
  const elevationRange = elevationStats.available
    ? `${elevationStats.min}–${elevationStats.max} m elevation`
    : null;

  return (
    <Link href={href} className="route-feed-card-premium" aria-label={`Open ${route.title || "route"}`}>
      <div className="route-feed-map" aria-hidden="true">
        <OSMRouteMap
          routePoints={route.route_points}
          title={route.title}
          compact
          interactive={false}
          showLegend={false}
          height={190}
        />
        <span className="route-feed-map-dot" />
      </div>

      <div className="route-feed-content">
        <div className="route-feed-top">
          <div className="route-feed-badges">
            <span className="sport-badge">{sportLabel}</span>
            <span className="status-badge">{route.visibility}</span>
          </div>
          <span className="route-feed-more">→</span>
        </div>

        <span className="route-feed-title">
          {route.title || "Running Route"}
        </span>

        <div className="route-feed-stats">
          <span>{distanceText(route)}</span>
          <i />
          <span>{elevationGainText(route)}</span>
        </div>

        {elevationRange ? <span className="route-feed-elevation">{elevationRange}</span> : null}
        <span className="route-feed-place">⌖ {routeArea(route)}</span>
      </div>
    </Link>
  );
}
