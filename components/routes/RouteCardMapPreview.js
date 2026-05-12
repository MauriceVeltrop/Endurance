"use client";

import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";

function normalizePoints(routePoints) {
  if (!routePoints) return [];

  const raw = Array.isArray(routePoints)
    ? routePoints
    : Array.isArray(routePoints.points)
      ? routePoints.points
      : [];

  return raw
    .map((point) => ({
      lat: Number(point.lat ?? point.latitude),
      lng: Number(point.lng ?? point.lon ?? point.longitude),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function FitBounds({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (!positions?.length) return;

    const bounds = L.latLngBounds(positions);

    setTimeout(() => {
      map.invalidateSize(true);
      map.fitBounds(bounds, {
        padding: [18, 18],
        maxZoom: 15,
        animate: false,
      });
    }, 150);
  }, [map, positions]);

  return null;
}

export default function RouteCardMapPreview({ routePoints }) {
  const positions = useMemo(() => {
    return normalizePoints(routePoints).map((point) => [point.lat, point.lng]);
  }, [routePoints]);

  if (positions.length < 2) {
    return (
      <div style={styles.empty}>
        Import GPX to show route map
      </div>
    );
  }

  const start = positions[0];
  const finish = positions[positions.length - 1];

  return (
    <div style={styles.wrapper}>
      <MapContainer
        center={start}
        zoom={13}
        scrollWheelZoom={false}
        dragging={false}
        zoomControl={false}
        doubleClickZoom={false}
        attributionControl={false}
        style={styles.map}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <Polyline
          positions={positions}
          pathOptions={{
            color: "#000000",
            weight: 10,
            opacity: 0.55,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        <Polyline
          positions={positions}
          pathOptions={{
            color: "#e4ef16",
            weight: 5,
            opacity: 1,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        <CircleMarker
          center={start}
          radius={6}
          pathOptions={{
            color: "#101406",
            weight: 3,
            fillColor: "#e4ef16",
            fillOpacity: 1,
          }}
        />

        <CircleMarker
          center={finish}
          radius={6}
          pathOptions={{
            color: "#101406",
            weight: 3,
            fillColor: "#ffffff",
            fillOpacity: 1,
          }}
        />

        <FitBounds positions={positions} />
      </MapContainer>

      <div style={styles.overlay} />
    </div>
  );
}

const styles = {
  wrapper: {
    position: "relative",
    height: 210,
    width: "100%",
    overflow: "hidden",
    background: "#050805",
  },
  map: {
    height: "100%",
    width: "100%",
    filter: "brightness(0.72) contrast(1.08) saturate(0.85)",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.48)), radial-gradient(circle at 75% 20%, rgba(228,239,22,0.14), transparent 38%)",
  },
  empty: {
    height: 210,
    display: "grid",
    placeItems: "center",
    color: "rgba(255,255,255,0.58)",
    fontWeight: 900,
    background:
      "radial-gradient(circle at 74% 20%, rgba(228,239,22,0.16), transparent 36%), linear-gradient(145deg, #0d1812, #050806)",
  },
};
