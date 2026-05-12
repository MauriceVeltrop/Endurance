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
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window unavailable"));
  }

  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const link = document.createElement("link");
    link.id = LEAFLET_CSS_ID;
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(LEAFLET_SCRIPT_ID);

    if (existing) {
      existing.addEventListener("load", () => resolve(window.L), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Leaflet failed to load"));

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
    let cancelled = false;

    async function renderMap() {
      if (!containerRef.current) return;
      if (points.length < 2) return;

      try {
        const L = await loadLeaflet();

        if (cancelled) return;

        if (!mapRef.current) {
          mapRef.current = L.map(containerRef.current, {
            zoomControl: true,
            scrollWheelZoom: false,
          });

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
          }).addTo(mapRef.current);
        }

        if (layerRef.current) {
          layerRef.current.remove();
        }

        const latLngs = points.map((point) => [point.lat, point.lon]);

        const group = L.layerGroup();

        const shadowLine = L.polyline(latLngs, {
          color: "#000000",
          weight: 9,
          opacity: 0.55,
        });

        const routeLine = L.polyline(latLngs, {
          color: "#e4ef16",
          weight: 5,
          opacity: 1,
        });

        const startMarker = L.circleMarker(latLngs[0], {
          radius: 8,
          color: "#111111",
          weight: 3,
          fillColor: "#e4ef16",
          fillOpacity: 1,
        });

        const finishMarker = L.circleMarker(latLngs[latLngs.length - 1], {
          radius: 8,
          color: "#111111",
          weight: 3,
          fillColor: "#ffffff",
          fillOpacity: 1,
        });

        group.addLayer(shadowLine);
        group.addLayer(routeLine);
        group.addLayer(startMarker);
        group.addLayer(finishMarker);

        group.addTo(mapRef.current);

        layerRef.current = group;

        const bounds = L.latLngBounds(latLngs);

        setTimeout(() => {
          if (!mapRef.current) return;

          mapRef.current.invalidateSize(true);

          mapRef.current.fitBounds(bounds, {
            padding: [24, 24],
            maxZoom: 15,
            animate: false,
          });
        }, 300);
      } catch (err) {
        console.error(err);
        setError("Map failed to load");
      }
    }

    renderMap();

    return () => {
      cancelled = true;
    };
  }, [points]);

  if (points.length < 2) {
    return (
      <div style={styles.empty}>
        No route points available yet.
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div ref={containerRef} style={styles.map} />

      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <span style={styles.startDot} />
          Start
        </div>

        <div style={styles.legendItem}>
          <span style={styles.finishDot} />
          Finish
        </div>

        <div style={styles.osm}>OpenStreetMap</div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
    </div>
  );
}

const styles = {
  wrapper: {
    display: "grid",
    gap: 12,
  },

  map: {
    width: "100%",
    height: 360,
    borderRadius: 28,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)",
  },

  legend: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    color: "rgba(255,255,255,0.75)",
    fontWeight: 700,
    fontSize: 14,
  },

  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  startDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#e4ef16",
    display: "inline-block",
  },

  finishDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#ffffff",
    display: "inline-block",
  },

  osm: {
    marginLeft: "auto",
    color: "#e4ef16",
  },

  empty: {
    minHeight: 220,
    borderRadius: 24,
    padding: 24,
    background: "#111111",
    color: "rgba(255,255,255,0.7)",
  },

  error: {
    color: "#ff8080",
    fontWeight: 700,
  },
};
