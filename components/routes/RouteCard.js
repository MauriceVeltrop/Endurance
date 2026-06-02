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
    : "No elevation profile";

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

      <Link href={href} className="route-osm-card-body" aria-label={`Open ${route.title || "route"}`}>
        <div className="route-osm-card-topline">
          <div className="route-feed-badges">
            <span className="sport-badge">{sportLabel}</span>
            <span className="status-badge">{route.visibility}</span>
          </div>
          <span className="route-osm-arrow">→</span>
        </div>

        <h2 className="route-osm-title">{route.title || "Running Route"}</h2>

        <div className="route-osm-meta-row">
          <span>{distanceText(route)}</span>
          <i />
          <span>{elevationGainText(route)}</span>
        </div>

        <div className="route-osm-submeta">
          <span>{elevationRange}</span>
          <span>⌖ {routeArea(route)}</span>
        </div>
      </Link>
    </article>
  );
}
