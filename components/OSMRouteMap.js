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

function editableHandleIndexes(points) {
  if (!Array.isArray(points) || points.length < 2) return [];

  if (points.length <= 80) {
    return points.map((_, index) => index);
  }

  const maxHandles = 36;
  const step = Math.max(1, Math.floor((points.length - 1) / (maxHandles - 1)));
  const indexes = [];

  for (let index = 0; index < points.length; index += step) {
    indexes.push(index);
  }

  const lastIndex = points.length - 1;
  if (indexes[indexes.length - 1] !== lastIndex) indexes.push(lastIndex);

  return [...new Set(indexes)];
}

function clonePoint(point) {
  return {
    lat: Number(point.lat),
    lon: Number(point.lon),
    ele: Number.isFinite(Number(point.ele)) ? Number(point.ele) : null,
  };
}

function haversineMeters(a, b) {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const lat1 = Number(a?.lat);
  const lon1 = Number(a?.lon);
  const lat2 = Number(b?.lat);
  const lon2 = Number(b?.lon);

  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;

  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function calculateMapMetrics(points) {
  const safePoints = Array.isArray(points) ? points : [];
  let distanceMeters = 0;
  let gain = 0;

  for (let index = 1; index < safePoints.length; index += 1) {
    distanceMeters += haversineMeters(safePoints[index - 1], safePoints[index]);

    const previousElevation = Number(safePoints[index - 1]?.ele);
    const currentElevation = Number(safePoints[index]?.ele);
    if (Number.isFinite(previousElevation) && Number.isFinite(currentElevation)) {
      const difference = currentElevation - previousElevation;
      if (difference > 1) gain += difference;
    }
  }

  return {
    distanceKm: Number((distanceMeters / 1000).toFixed(2)),
    elevationGainM: Math.round(gain),
  };
}

function formatDistanceKm(value) {
  const distance = Number(value || 0);
  if (!Number.isFinite(distance) || distance <= 0) return "—";
  return `${distance.toFixed(1).replace(".0", "")} km`;
}

function formatElevationMeters(value) {
  const elevation = Number(value || 0);
  if (!Number.isFinite(elevation) || elevation <= 0) return "—";
  return `${Math.round(elevation)} m`;
}

function compactRoutingPoints(points) {
  const safePoints = (Array.isArray(points) ? points : []).map(clonePoint).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

  if (safePoints.length <= 9) return safePoints;
  if (safePoints.length <= 40) return editableHandleIndexes(safePoints).map((index) => safePoints[index]).filter(Boolean);

  const maxPoints = 18;
  const step = Math.max(1, Math.floor((safePoints.length - 1) / (maxPoints - 1)));
  const result = [];

  for (let index = 0; index < safePoints.length; index += step) {
    result.push(safePoints[index]);
  }

  const last = safePoints[safePoints.length - 1];
  if (result[result.length - 1] !== last) result.push(last);

  return result;
}

function getSavedControlPoints(routePoints, fallbackPoints) {
  const candidates = [
    routePoints?.control_points,
    routePoints?.waypoints,
    routePoints?.controlPoints,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeRoutePoints(candidate);
    if (normalized.length >= 2) return normalized.map(clonePoint);
  }

  const safeFallback = (Array.isArray(fallbackPoints) ? fallbackPoints : []).map(clonePoint);
  if (safeFallback.length < 2) return [];

  return editableHandleIndexes(safeFallback).map((index) => safeFallback[index]).filter(Boolean);
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
  fullscreenLabel = "Fullscreen",
  onFullscreenClick = null,
  editable = false,
  saving = false,
  onSaveRoutePoints = null,
  sportId = "",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const editLayerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const preserveViewRef = useRef(false);
  const pendingViewRef = useRef(null);

  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [layerKey, setLayerKey] = useState(defaultLayer);
  const [mounted, setMounted] = useState(false);
  const [editablePoints, setEditablePoints] = useState([]);
  const [editControlPoints, setEditControlPoints] = useState([]);
  const [hasUnsavedEdit, setHasUnsavedEdit] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [routingStatus, setRoutingStatus] = useState("idle");
  const [routeMetrics, setRouteMetrics] = useState({ distanceKm: 0, elevationGainM: 0 });

  const points = useMemo(() => normalizeRoutePoints(routePoints), [routePoints]);
  const mapPoints = useMemo(
    () => (fullscreen && editable && editablePoints.length >= 2 ? editablePoints : points),
    [fullscreen, editable, editablePoints, points]
  );
  const mapIsInteractive = fullscreen || interactive;

  useEffect(() => {
    setEditablePoints(points.map(clonePoint));
    setEditControlPoints(getSavedControlPoints(routePoints, points));
    setHasUnsavedEdit(false);
    setRoutingStatus("idle");
    setSaveMessage("");
  }, [points, routePoints]);

  useEffect(() => {
    setRouteMetrics(calculateMapMetrics(mapPoints));
  }, [mapPoints]);

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
      if (!containerRef.current || mapPoints.length < 2) return;

      try {
        setError("");
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        const selectedLayer = TILE_LAYERS[layerKey] || TILE_LAYERS.dark;

        if (!mapRef.current) {
          mapRef.current = L.map(containerRef.current, {
            zoomControl: mapIsInteractive && !compact,
            attributionControl: !compact,
            scrollWheelZoom: false,
            doubleClickZoom: mapIsInteractive,
            dragging: mapIsInteractive,
            tap: mapIsInteractive,
            touchZoom: mapIsInteractive,
            boxZoom: mapIsInteractive,
            keyboard: mapIsInteractive,
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

        if (editLayerRef.current) {
          editLayerRef.current.remove();
          editLayerRef.current = null;
        }

        const latLngs = mapPoints.map((point) => [point.lat, point.lon]);
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

        if (fullscreen && editable) {
          const editGroup = L.layerGroup();
          const handleIcon = L.divIcon({
            className: "endurance-route-edit-handle",
            html: `<span></span>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });

          const handles = editControlPoints.length >= 2 ? editControlPoints : getSavedControlPoints(routePoints, mapPoints);

          handles.forEach((point, pointIndex) => {
            const marker = L.marker([point.lat, point.lon], {
              icon: handleIcon,
              draggable: true,
              autoPan: true,
              title: "Drag route point",
              zIndexOffset: 1000,
            });

            marker.on("dragend", (event) => {
              const nextLatLng = event.target.getLatLng();
              const base = handles.map(clonePoint);
              const nextControl = base.map(clonePoint);

              if (!nextControl[pointIndex]) return;

              nextControl[pointIndex] = {
                ...nextControl[pointIndex],
                lat: Number(nextLatLng.lat.toFixed(6)),
                lon: Number(nextLatLng.lng.toFixed(6)),
              };

              setEditControlPoints(nextControl);
              setHasUnsavedEdit(true);
              setSaveMessage("Route changed. Rerouting...");
              rerouteEditedControlPoints(nextControl);
            });

            marker.addTo(editGroup);
          });

          editGroup.addTo(mapRef.current);
          editLayerRef.current = editGroup;
        }

        const fit = () => {
          if (!mapRef.current || cancelled) return;

          mapRef.current.invalidateSize(true);

          if (preserveViewRef.current && pendingViewRef.current) {
            mapRef.current.setView(pendingViewRef.current.center, pendingViewRef.current.zoom, { animate: false });
            return;
          }

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
  }, [mapPoints, title, compact, mapIsInteractive, fullscreen, layerKey, editable, editControlPoints, routePoints]);

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
    editLayerRef.current = null;
  }, [fullscreen, interactive]);

  async function rerouteEditedControlPoints(nextControlPoints) {
    const control = (Array.isArray(nextControlPoints) ? nextControlPoints : []).map(clonePoint);
    if (control.length < 2) return nextControlPoints;

    const map = mapRef.current;
    if (map) {
      const center = map.getCenter();
      pendingViewRef.current = {
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      };
      preserveViewRef.current = true;
    }

    try {
      setRoutingStatus("routing");
      setSaveMessage("Rerouting route on OSM paths...");

      const response = await fetch("/api/routes/reroute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sport_id: sportId,
          points: control,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Rerouting failed.");
      }

      const routed = data.route_points || data;
      const geometry = normalizeRoutePoints(routed?.points?.length ? routed.points : routed);

      if (geometry.length < 2) {
        throw new Error("No routed geometry returned.");
      }

      setEditablePoints(geometry.map(clonePoint));
      setRouteMetrics({
        distanceKm: Number(data?.distance_km || calculateMapMetrics(geometry).distanceKm || 0),
        elevationGainM: Number(data?.elevation_gain_m || calculateMapMetrics(geometry).elevationGainM || 0),
      });
      setRoutingStatus("done");
      setHasUnsavedEdit(true);
      setSaveMessage("Route rerouted. Save to keep these changes.");
      return geometry;
    } catch (error) {
      console.error("Fullscreen reroute failed", error);
      setRoutingStatus("error");
      setHasUnsavedEdit(true);
      setSaveMessage(error?.message || "Could not reroute. Save keeps the adjusted control points.");
      return nextPoints;
    }
  }

  async function saveEditedRoute() {
    if (!onSaveRoutePoints || !hasUnsavedEdit) return;

    try {
      setSaveMessage("Saving route...");
      await onSaveRoutePoints(editablePoints, editControlPoints);
      setHasUnsavedEdit(false);
      setRoutingStatus("done");
      setSaveMessage("Route saved.");
    } catch (err) {
      setSaveMessage(err?.message || "Could not save route.");
    }
  }

  function resetEditedRoute() {
    preserveViewRef.current = false;
    pendingViewRef.current = null;
    setEditablePoints(points.map(clonePoint));
    setEditControlPoints(getSavedControlPoints(routePoints, points));
    setRouteMetrics(calculateMapMetrics(points));
    setHasUnsavedEdit(false);
    setRoutingStatus("idle");
    setSaveMessage("");
  }

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
      {fullscreen && editable ? (
        <style>{`.endurance-route-edit-handle span{display:block;width:18px;height:18px;border-radius:999px;background:#e6ff00;border:3px solid rgba(5,8,5,.9);box-shadow:0 0 0 4px rgba(230,255,0,.22),0 0 24px rgba(230,255,0,.5);}`}</style>
      ) : null}
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

      {showLayerControl && fullscreen && !compact ? (
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
          onClick={() => {
            if (!fullscreen && typeof onFullscreenClick === "function") {
              onFullscreenClick();
              return;
            }

            setFullscreen((value) => !value);
          }}
          style={fullscreen ? styles.closeFullscreenButton : styles.fullscreenButton}
        >
          {fullscreen ? "Close map" : fullscreenLabel}
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

      {fullscreen && editable ? (
        <div style={styles.editToolbarFullscreen}>
          <strong>Edit route</strong>
          <span>{hasUnsavedEdit ? saveMessage || "Drag the yellow control points to adjust the route." : "Drag the yellow control points to adjust the route."}</span>
          <div style={styles.editMetricsRow}>
            <b>{formatDistanceKm(routeMetrics.distanceKm)}</b>
            <small>distance</small>
            <b>{formatElevationMeters(routeMetrics.elevationGainM)}</b>
            <small>elevation gain</small>
            <b>{routingStatus === "routing" ? "Rerouting..." : routingStatus === "error" ? "Check route" : "OSM route"}</b>
          </div>
          <div style={styles.editToolbarActions}>
            <button type="button" onClick={resetEditedRoute} style={styles.editToolbarSecondary} disabled={saving || !hasUnsavedEdit}>
              Reset
            </button>
            <button type="button" onClick={saveEditedRoute} style={styles.editToolbarPrimary} disabled={saving || !hasUnsavedEdit}>
              {saving ? "Saving..." : "Save route"}
            </button>
          </div>
        </div>
      ) : null}

      {fullscreen && !editable ? (
        <div style={styles.viewerHintFullscreen}>View only</div>
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
  editToolbarFullscreen: {
    position: "fixed",
    left: 14,
    right: 14,
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
    zIndex: 2147483004,
    borderRadius: 22,
    padding: 14,
    display: "grid",
    gap: 8,
    background: "rgba(5,8,5,0.86)",
    border: "1px solid rgba(230,255,0,0.22)",
    color: "white",
    backdropFilter: "blur(14px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.38)",
  },
  editMetricsRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    color: "rgba(255,255,255,0.74)",
    fontWeight: 850,
  },
  editToolbarActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  editToolbarPrimary: {
    border: 0,
    borderRadius: 999,
    padding: "12px 14px",
    background: "#e6ff00",
    color: "#101406",
    fontWeight: 1000,
    cursor: "pointer",
  },
  editToolbarSecondary: {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 999,
    padding: "12px 14px",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
  },
  viewerHintFullscreen: {
    position: "fixed",
    left: 16,
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
    zIndex: 2147483004,
    borderRadius: 999,
    padding: "10px 13px",
    background: "rgba(5,8,5,0.78)",
    color: "rgba(255,255,255,0.82)",
    border: "1px solid rgba(255,255,255,0.12)",
    fontWeight: 900,
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
