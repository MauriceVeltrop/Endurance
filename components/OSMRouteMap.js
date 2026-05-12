"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const LEAFLET_CSS_ID = "endurance-leaflet-css";
const LEAFLET_SCRIPT_ID = "endurance-leaflet-script";

function getRoutePoints(routePoints) {
  if (!routePoints) return [];
  if (Array.isArray(routePoints)) return routePoints;
  if (Array.isArray(routePoints.points)) return routePoints.points;
  return [];
}

function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("Window unavailable."));

  if (window.L) return Promise.resolve(window.L);

  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const link = document.createElement("link");
    link.id = LEAFLET_CSS_ID;
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIINfQfSgHk0bLxUwQfutFfR8dENsA0m1s0=";
    link.crossOrigin = "";
    document.head.appendChild(link);
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(LEAFLET_SCRIPT_ID);

    if (existing) {
      existing.addEventListener("load", () => resolve(window.L), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Leaflet.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "";
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Could not load Leaflet."));
    document.body.appendChild(script);
  });
}

export default function OSMRouteMap({ routePoints, title = "Route" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [error, setError] = useState("");

  const points = useMemo(() => {
    return getRoutePoints(routePoints)
      .map((point) => ({
        lat: Number(point.lat),
        lon: Number(point.lon),
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  }, [routePoints]);

  useEffect(() => {
    let cancelled = FalseFlag();

    async function renderMap() {
      if (!containerRef.current) return;
      if (points.length < 2) return;

      try {
        const L = await loadLeaflet();
        if (cancelled.value) return;

        if (!mapRef.current) {
          mapRef.current = L.map(containerRef.current, {
            zoomControl: true,
            attributionControl: true,
            scrollWheelZoom: false,
          });

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
          }).addTo(mapRef.current);
        }

        if (layerRef.current) {
          layerRef.current.remove();
        }

        const latLngs = points.map((point) => [point.lat, point.lon]);
        const group = L.layerGroup();

        const shadowLine = L.polyline(latLngs, {
          color: "#050505",
          weight: 9,
          opacity: 0.72,
          lineJoin: "round",
          lineCap: "round",
        });

        const routeLine = L.polyline(latLngs, {
          color: "#e4ef16",
          weight: 5,
          opacity: 0.98,
          lineJoin: "round",
          lineCap: "round",
        });

        const start = latLngs[0];
        const finish = latLngs[latLngs.length - 1];

        const startMarker = L.circleMarker(start, {
          radius: 8,
          color: "#101406",
          weight: 3,
          fillColor: "#e4ef16",
          fillOpacity: 1,
        }).bindPopup(`${title}<br/>Start`);

        const finishMarker = L.circleMarker(finish, {
          radius: 8,
          color: "#101406",
          weight: 3,
          fillColor: "#ffffff",
          fillOpacity: 1,
        }).bindPopup(`${title}<br/>Finish`);

        group.addLayer(shadowLine);
        group.addLayer(routeLine);
        group.addLayer(startMarker);
        group.addLayer(finishMarker);
        group.addTo(mapRef.current);

        layerRef.current = group;

        const bounds = L.latLngBounds(latLngs);
        mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });

        setTimeout(() => {
          mapRef.current?.invalidateSize();
        }, 120);
      } catch (err) {
        console.error("OSM route map error", err);
        setError(err?.message || "Could not load map.");
      }
    }

    renderMap();

    return () => {
      cancelled.value = true;
    };
  }, [points, title]);

  if (points.length < 2) {
    return (
      <div style={styles.emptyMap}>
        <strong>No map data yet</strong>
        <span>Import a GPX file to show this route on OpenStreetMap.</span>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <div ref={containerRef} style={styles.map} />
      <div style={styles.legend}>
        <span style={styles.startDot} /> Start
        <span style={styles.finishDot} /> Finish
        <span style={styles.routeLabel}>OpenStreetMap</span>
      </div>
      {error ? <div style={styles.error}>{error}</div> : null}
    </div>
  );
}

function FalseFlag() {
  return { value: false };
}

const styles = {
  shell: {
    display: "grid",
    gap: 10,
  },
  map: {
    height: 360,
    width: "100%",
    borderRadius: 26,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(145deg, #151915, #060706)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.32)",
  },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    fontWeight: 850,
  },
  startDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#e4ef16",
    display: "inline-block",
    boxShadow: "0 0 18px rgba(228,239,22,0.38)",
  },
  finishDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "white",
    display: "inline-block",
  },
  routeLabel: {
    marginLeft: "auto",
    color: "#e4ef16",
  },
  emptyMap: {
    minHeight: 220,
    borderRadius: 26,
    padding: 20,
    boxSizing: "border-box",
    background: "radial-gradient(circle at 78% 18%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #151915, #060706)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.72)",
    display: "grid",
    alignContent: "center",
    gap: 8,
  },
  error: {
    borderRadius: 18,
    padding: 12,
    background: "rgba(120,20,20,0.35)",
    border: "1px solid rgba(255,80,80,0.22)",
    color: "rgba(255,255,255,0.82)",
    fontWeight: 850,
  },
};
