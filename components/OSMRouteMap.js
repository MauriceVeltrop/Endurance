"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const LEAFLET_CSS_ID = "endurance-leaflet-css";
const LEAFLET_SCRIPT_ID = "endurance-leaflet-script";

const TILE_LAYERS = {
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 20,
  },
  osm: {
    label: "OSM",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  },
  cyclosm: {
    label: "Cycling",
    url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors, CyclOSM",
    maxZoom: 20,
  },
  topo: {
    label: "Outdoor",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors, SRTM, OpenTopoMap",
    maxZoom: 17,
  },
};

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

export default function OSMRouteMap({
  routePoints,
  title = "Route",
  compact = false,
  interactive = true,
  showLegend = true,
  height = 390,
  className = "",
  showFullscreen = false,
  showLayerControl = false,
  defaultLayer = "dark",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [layerKey, setLayerKey] = useState(defaultLayer);
  const [mounted, setMounted] = useState(false);

  const points = useMemo(() => normalizeRoutePoints(routePoints), [routePoints]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!fullscreen || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    const timers = [50, 250, 700].map((delay) =>
      window.setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize(true);
        }
      }, delay)
    );

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [fullscreen]);

  useEffect(() => {
    let cancelled = false;
    let timeoutIds = [];

    async function renderMap() {
      if (!containerRef.current || points.length < 2) return;

      try {
        setError("");
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        const selectedLayer = TILE_LAYERS[layerKey] || TILE_LAYERS.dark;

        if (!mapRef.current) {
          mapRef.current = L.map(containerRef.current, {
            zoomControl: interactive && !compact,
            attributionControl: !compact,
            scrollWheelZoom: false,
            doubleClickZoom: interactive,
            dragging: interactive,
            tap: interactive,
            touchZoom: interactive,
            boxZoom: interactive,
            keyboard: interactive,
          });
        }

        if (tileLayerRef.current) {
          tileLayerRef.current.remove();
        }

        tileLayerRef.current = L.tileLayer(selectedLayer.url, {
          attribution: selectedLayer.attribution,
          maxZoom: selectedLayer.maxZoom,
          crossOrigin: true,
        }).addTo(mapRef.current);

        if (selectedLayer === TILE_LAYERS.dark && mapRef.current.getPane("tilePane")) {
          mapRef.current.getPane("tilePane").style.filter = compact
            ? "brightness(0.78) saturate(1.05) contrast(1.08)"
            : "brightness(0.86) saturate(1.05) contrast(1.06)";
        } else if (mapRef.current.getPane("tilePane")) {
          mapRef.current.getPane("tilePane").style.filter = compact
            ? "brightness(0.62) saturate(0.88) contrast(1.12)"
            : "brightness(0.82) saturate(0.95) contrast(1.08)";
        }

        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
        }

        const latLngs = points.map((point) => [point.lat, point.lon]);
        const bounds = L.latLngBounds(latLngs);
        const group = L.layerGroup();

        L.polyline(latLngs, {
          color: "#000000",
          weight: compact ? 12 : 17,
          opacity: 0.62,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(group);

        L.polyline(latLngs, {
          color: "#e6ff00",
          weight: compact ? 8 : 11,
          opacity: 0.20,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(group);

        L.polyline(latLngs, {
          color: "#e6ff00",
          weight: compact ? 4.5 : 6,
          opacity: 1,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(group);

        const startIcon = L.divIcon({
          className: "endurance-map-marker-start",
          html: `<span>${compact ? "" : "START"}</span>`,
          iconSize: compact ? [18, 18] : [62, 28],
          iconAnchor: compact ? [9, 9] : [31, 14],
        });

        const finishIcon = L.divIcon({
          className: "endurance-map-marker-finish",
          html: `<span>${compact ? "" : "FINISH"}</span>`,
          iconSize: compact ? [18, 18] : [66, 28],
          iconAnchor: compact ? [9, 9] : [33, 14],
        });

        L.marker(latLngs[0], { icon: startIcon }).bindPopup(`${title}<br/>Start`).addTo(group);
        L.marker(latLngs[latLngs.length - 1], { icon: finishIcon }).bindPopup(`${title}<br/>Finish`).addTo(group);

        group.addTo(mapRef.current);
        routeLayerRef.current = group;

        const fit = () => {
          if (!mapRef.current || cancelled) return;

          mapRef.current.invalidateSize(true);
          mapRef.current.fitBounds(bounds, {
            padding: fullscreen ? [70, 42] : compact ? [14, 14] : [34, 34],
            maxZoom: compact ? 14 : 15,
            animate: false,
          });
        };

        timeoutIds = [80, 250, 650, 1100].map((delay) => window.setTimeout(fit, delay));

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
  }, [points, title, compact, interactive, fullscreen, layerKey]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    mapRef.current.remove();
    mapRef.current = null;
    tileLayerRef.current = null;
    routeLayerRef.current = null;
  }, [fullscreen]);

  if (points.length < 2) {
    return (
      <div style={compact ? { ...styles.empty, minHeight: height, borderRadius: 0 } : styles.empty}>
        <strong>No map data yet</strong>
        <span>Import a GPX file to show this route on OpenStreetMap.</span>
      </div>
    );
  }

  const mapContent = (
    <div className={fullscreen ? "" : className} style={fullscreen ? styles.fullscreenWrapper : compact ? styles.compactWrapper : styles.wrapper}>
      <div
        ref={containerRef}
        style={{
          ...styles.map,
          position: fullscreen ? "absolute" : "relative",
          inset: fullscreen ? 0 : "auto",
          height: fullscreen ? "100%" : height,
          minHeight: fullscreen ? "100%" : height,
          borderRadius: fullscreen || compact ? 0 : styles.map.borderRadius,
          border: fullscreen || compact ? 0 : styles.map.border,
          boxShadow: fullscreen ? "none" : styles.map.boxShadow,
        }}
      />

      {showLayerControl && !compact ? (
        <div style={fullscreen ? styles.layerControlFullscreen : styles.layerControl}>
          {Object.entries(TILE_LAYERS).map(([key, layer]) => (
            <button
              key={key}
              type="button"
              onClick={() => setLayerKey(key)}
              style={layerKey === key ? styles.layerButtonActive : styles.layerButton}
            >
              {layer.label}
            </button>
          ))}
        </div>
      ) : null}

      {showFullscreen ? (
        <button
          type="button"
          onClick={() => setFullscreen((value) => !value)}
          style={fullscreen ? styles.closeFullscreenButton : styles.fullscreenButton}
        >
          {fullscreen ? "Close map" : "Fullscreen"}
        </button>
      ) : null}

      {compact ? <div style={styles.compactShade} /> : null}

      {showLegend ? (
        <div style={fullscreen ? styles.legendFullscreen : styles.legend}>
          <span style={styles.legendItem}>
            <span style={styles.startDot} />
            Start
          </span>

          <span style={styles.legendItem}>
            <span style={styles.finishDot} />
            Finish
          </span>

          <span style={styles.osmLabel}>{TILE_LAYERS[layerKey]?.label || "OpenStreetMap"}</span>
        </div>
      ) : null}

      {error ? <div style={compact ? styles.compactError : styles.error}>{error}</div> : null}
    </div>
  );

  if (fullscreen && mounted && typeof document !== "undefined") {
    return createPortal(mapContent, document.body);
  }

  return mapContent;
}

const styles = {
  wrapper: {
    display: "grid",
    gap: 12,
    position: "relative",
  },
  compactWrapper: {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    background: "linear-gradient(145deg, #101811, #050705)",
  },
  fullscreenWrapper: {
    position: "fixed",
    inset: 0,
    width: "100vw",
    height: "100dvh",
    minHeight: "100dvh",
    zIndex: 2147483000,
    background: "#05070a",
    overflow: "hidden",
    display: "block",
    isolation: "isolate",
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
  layerControl: {
    position: "absolute",
    left: 14,
    top: 14,
    zIndex: 999,
    display: "flex",
    gap: 7,
    flexWrap: "wrap",
    maxWidth: "calc(100% - 128px)",
  },
  layerControlFullscreen: {
    position: "fixed",
    left: 14,
    top: "calc(env(safe-area-inset-top, 0px) + 14px)",
    zIndex: 2147483002,
    display: "flex",
    gap: 7,
    flexWrap: "wrap",
    maxWidth: "calc(100vw - 150px)",
  },
  layerButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(5,8,5,0.72)",
    color: "rgba(255,255,255,0.78)",
    borderRadius: 999,
    padding: "8px 10px",
    fontWeight: 950,
    fontSize: 12,
    backdropFilter: "blur(10px)",
    cursor: "pointer",
  },
  layerButtonActive: {
    border: "1px solid rgba(230,255,0,0.36)",
    background: "rgba(230,255,0,0.14)",
    color: "#e6ff00",
    borderRadius: 999,
    padding: "8px 10px",
    fontWeight: 1000,
    fontSize: 12,
    backdropFilter: "blur(10px)",
    cursor: "pointer",
  },
  fullscreenButton: {
    position: "absolute",
    right: 14,
    top: 14,
    zIndex: 2147483002,
    border: "1px solid rgba(230,255,0,0.30)",
    background: "rgba(5,8,5,0.82)",
    color: "#e6ff00",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 1000,
    cursor: "pointer",
    backdropFilter: "blur(10px)",
  },
  closeFullscreenButton: {
    position: "fixed",
    right: 14,
    top: "calc(env(safe-area-inset-top, 0px) + 14px)",
    zIndex: 2147483003,
    border: "1px solid rgba(230,255,0,0.30)",
    background: "rgba(5,8,5,0.88)",
    color: "#e6ff00",
    borderRadius: 999,
    padding: "11px 15px",
    fontWeight: 1000,
    cursor: "pointer",
    backdropFilter: "blur(10px)",
  },
  compactShade: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.36)), radial-gradient(circle at 72% 18%, rgba(230,255,0,0.12), transparent 36%)",
  },
  compactError: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 14,
    padding: 9,
    background: "rgba(10,12,10,0.80)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.82)",
    fontWeight: 850,
    fontSize: 12,
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
  legendFullscreen: {
    position: "absolute",
    left: 16,
    bottom: 16,
    zIndex: 2147483002,
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontWeight: 900,
    padding: "11px 13px",
    borderRadius: 999,
    background: "rgba(5,8,5,0.72)",
    border: "1px solid rgba(255,255,255,0.10)",
    backdropFilter: "blur(10px)",
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
    background: "#e6ff00",
    display: "inline-block",
    boxShadow: "0 0 18px rgba(230,255,0,0.38)",
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
    color: "#e6ff00",
    fontWeight: 950,
  },
  empty: {
    minHeight: 240,
    borderRadius: 28,
    padding: 22,
    boxSizing: "border-box",
    background:
      "radial-gradient(circle at 78% 18%, rgba(230,255,0,0.16), transparent 34%), linear-gradient(145deg, #151915, #060706)",
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
