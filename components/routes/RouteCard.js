// components/routes/RouteCard.js
"use client";

import Link from "next/link";
import OSMRouteMap from "../OSMRouteMap";
import { getSportLabel } from "../../lib/trainingHelpers";
import { getElevationStats } from "../../lib/routePreview";

function distanceText(route) {
  return route?.distance_km ? `${route.distance_km} km` : "Distance not set";
}

function elevationGainText(route) {
  return route?.elevation_gain_m ? `${route.elevation_gain_m} m` : "Elevation not set";
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
    ? `Elevation ${elevationStats.min}-${elevationStats.max} m`
    : "No elevation profile";

  return (
    <article className="route-feed-card-premium">
      <Link href={href} className="route-feed-map" aria-label={route.title || "Open route"}>
        <OSMRouteMap
          routePoints={route.route_points}
          title={route.title}
          compact
          interactive={false}
          showLegend={false}
          height={164}
        />
        <span className="route-feed-map-dot" />
      </Link>

      <div className="route-feed-content">
        <div className="route-feed-top">
          <div className="route-feed-badges">
            <span className="sport-badge">{sportLabel}</span>
            <span className="status-badge">{route.visibility}</span>
          </div>
          <span className="route-feed-more">•••</span>
        </div>

        <Link href={href} className="route-feed-title">
          {route.title || "Running Route"}
        </Link>

        <div className="route-feed-stats">
          <span>↗ {distanceText(route)}</span>
          <i />
          <span>△ {elevationGainText(route)}</span>
        </div>

        <span className="route-feed-elevation">{elevationRange}</span>
        <span className="route-feed-place">⌖ {routeArea(route)}</span>

        <div className="route-feed-actions">
          <Link href={href} className="route-feed-open">
            Open route <span>→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
