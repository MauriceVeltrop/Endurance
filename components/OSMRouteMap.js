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

function normalizeRoutePoints(routePoints) {
  return getRoutePoints(routePoints)
    .map((point) => ({
      lat: Number(point.lat ?? point.latitude),
      lon: Number(point.lon ?? point.lng ?? point.longitude),
      ele: point.ele ?? null,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
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
      existing.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
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

export default function OSMRouteMap({ routePoints, title = "Route", compact = false, interactive = true, showLegend = true, height = 390 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const [error, setError] = useState("");

  const points = useMemo(() => normalizeRoutePoints(routePoints), [routePoints]);

  useEffect(() => {
    let cancelled = false;
    let timeoutIds = [];

    async function renderMap() {
      if (!containerRef.current || points.length < 2) return;

      try {
        setError("");
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = L.map(containerRef.current, {
            zoomControl: interactive,
            attributionControl: !compact,
            scrollWheelZoom: false,
            doubleClickZoom: interactive,
            dragging: interactive,
            tap: interactive,
            touchZoom: interactive,
            boxZoom: interactive,
            keyboard: interactive,
          });

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
            crossOrigin: true,
          }).addTo(mapRef.current);

          if (compact && mapRef.current.getPane("tilePane")) {
            mapRef.current.getPane("tilePane").style.filter = "brightness(0.55) saturate(0.85) contrast(1.1)";
          }
        }

        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
        }

        const latLngs = points.map((point) => [point.lat, point.lon]);
        const bounds = L.latLngBounds(latLngs);

        const group = L.layerGroup();

        L.polyline(latLngs, {
          color: "#050505",
          weight: 10,
          opacity: 0.70,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(group);

        L.polyline(latLngs, {
          color: "#e4ef16",
          weight: 5,
          opacity: 1,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(group);

        L.circleMarker(latLngs[0], {
          radius: 8,
          color: "#101406",
          weight: 3,
          fillColor: "#e4ef16",
          fillOpacity: 1,
        }).bindPopup(`${title}<br/>Start`).addTo(group);

        L.circleMarker(latLngs[latLngs.length - 1], {
          radius: 8,
          color: "#101406",
          weight: 3,
          fillColor: "#ffffff",
          fillOpacity: 1,
        }).bindPopup(`${title}<br/>Finish`).addTo(group);

        group.addTo(mapRef.current);
        routeLayerRef.current = group;

        const fit = () => {
          if (!mapRef.current || cancelled) return;

          mapRef.current.invalidateSize(true);
          mapRef.current.fitBounds(bounds, {
            padding: compact ? [18, 18] : [28, 28],
            maxZoom: compact ? 14 : 15,
            animate: false,
          });
        };

        timeoutIds = [80, 250, 650].map((delay) => window.setTimeout(fit, delay));

        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
        }

        if ("ResizeObserver" in window) {
          resizeObserverRef.current = new ResizeObserver(() => fit());
          resizeObserverRef.current.observe(containerRef.current);
        }
      } catch (err) {
        console.error("OSM route map error", err);
        setError(err?.message || "Map failed to load");
      }
    }

    renderMap();

    return () => {
      cancelled = true;
      timeoutIds.forEach((id) => window.clearTimeout(id));

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [points, title, compact, interactive]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (points.length < 2) {
    return (
      <div style={compact ? { ...styles.empty, minHeight: height } : styles.empty}>
        <strong>No map data yet</strong>
        <span>Import a GPX file to show this route on OpenStreetMap.</span>
      </div>
    );
  }

  return (
    <div style={compact ? styles.compactWrapper : styles.wrapper}>
      <div ref={containerRef} style={{ ...styles.map, height, minHeight: height, borderRadius: compact ? 0 : styles.map.borderRadius }} />

      {showLegend ? (
      <div style={styles.legend}>
        <span style={styles.legendItem}>
          <span style={styles.startDot} />
          Start
        </span>

        <span style={styles.legendItem}>
          <span style={styles.finishDot} />
          Finish
        </span>

        <span style={styles.osmLabel}>OpenStreetMap</span>
      </div>
      ) : null}

      {compact ? <div style={styles.compactShade} /> : null}

      {error ? <div style={compact ? styles.compactError : styles.error}>{error}</div> : null}
    </div>
  );
}

const styles = {
  wrapper: {
    display: "grid",
    gap: 12,
  },
  compactWrapper: {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    background: "linear-gradient(145deg, #101811, #050705)",
  },
  map: {
    width: "100%",
    height: 390,
    minHeight: 390,
    borderRadius: 28,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(145deg, #101811, #050705)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.34)",
  },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: 850,
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
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
    background: "#ffffff",
    display: "inline-block",
  },
  osmLabel: {
    marginLeft: "auto",
    color: "#e4ef16",
    fontWeight: 950,
  },
  empty: {
    minHeight: 240,
    borderRadius: 28,
    padding: 22,
    boxSizing: "border-box",
    background:
      "radial-gradient(circle at 78% 18%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #151915, #060706)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.72)",
    display: "grid",
    alignContent: "center",
    gap: 8,
  },
  compactShade: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.26)), radial-gradient(circle at 74% 12%, rgba(228,239,22,0.13), transparent 36%)",
  },
  compactError: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 16,
    padding: 10,
    background: "rgba(10,12,10,0.78)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.82)",
    fontWeight: 850,
    fontSize: 12,
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
