"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const CSS_ID = "endurance-leaflet-css";
const SCRIPT_ID = "endurance-leaflet-script";

const LAYERS = {
  light: {
    label: "Light",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    filter: "brightness(1.03) saturate(.9) contrast(.96)",
    maxZoom: 20,
  },
  outdoor: {
    label: "Outdoor",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    filter: "brightness(1.05) saturate(.95) contrast(.98)",
    maxZoom: 17,
  },
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    filter: "brightness(.98) saturate(1.05) contrast(1.02)",
    maxZoom: 20,
  },
};

function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("Window unavailable"));
  if (window.L) return Promise.resolve(window.L);

  if (!document.getElementById(CSS_ID)) {
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);

    if (existing) {
      existing.addEventListener("load", () => resolve(window.L), { once: true });
      existing.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Leaflet failed to load"));
    document.body.appendChild(script);
  });
}

function norm(input) {
  const raw = Array.isArray(input) ? input : Array.isArray(input?.points) ? input.points : [];

  return raw
    .map((point) => ({
      lat: Number(point.lat ?? point.latitude),
      lon: Number(point.lon ?? point.lng ?? point.longitude),
      ele: point.ele ?? null,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

function distSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));

  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function closestRoutePoint(eventLatLng, map, linePoints) {
  if (!map || !Array.isArray(linePoints) || !linePoints.length) return null;

  const clickPoint = map.latLngToLayerPoint(eventLatLng);
  let best = null;
  let bestDistance = Infinity;

  linePoints.forEach((point) => {
    const layerPoint = map.latLngToLayerPoint([point.lat, point.lon]);
    const distance = Math.hypot(clickPoint.x - layerPoint.x, clickPoint.y - layerPoint.y);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  });

  return best
    ? {
        lat: Number(best.lat.toFixed(6)),
        lon: Number(best.lon.toFixed(6)),
        ele: best.ele ?? null,
      }
    : null;
}

function insertionIndexForRouteClick(eventLatLng, map, controlPoints) {
  if (!map || !Array.isArray(controlPoints) || controlPoints.length < 2) return controlPoints.length;

  const clickPoint = map.latLngToLayerPoint(eventLatLng);
  let bestIndex = controlPoints.length;
  let bestDistance = Infinity;

  for (let index = 0; index < controlPoints.length - 1; index += 1) {
    const a = map.latLngToLayerPoint([controlPoints[index].lat, controlPoints[index].lon]);
    const b = map.latLngToLayerPoint([controlPoints[index + 1].lat, controlPoints[index + 1].lon]);
    const distance = distSeg(clickPoint, a, b);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index + 1;
    }
  }

  return bestIndex;
}

export default function RouteDrawMap({
  points = [],
  routedPoints = [],
  onChange,
  height = 430,
  center = [50.887, 6.023],
  title = "Draw route",
  insertMode = false,
  layer = "light",
  onLayerChange,
  routeMode = "routed",
  currentLocation = null,
  focusCurrentLocation = false,
  targetLocation = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const routeRef = useRef(null);
  const locationRef = useRef(null);
  const pointsRef = useRef(points);
  const hasFocusedLocationRef = useRef(false);
  const lastManualFocusRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [error, setError] = useState("");

  const waypoints = useMemo(() => norm(points), [points]);
  const linePoints = useMemo(() => {
    const routed = norm(routedPoints);
    return routed.length >= 2 && routeMode === "routed" ? routed : waypoints;
  }, [routedPoints, waypoints, routeMode]);

  useEffect(() => {
    pointsRef.current = waypoints;
  }, [waypoints]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = L.map(containerRef.current, {
            zoomControl: true,
            attributionControl: false,
            scrollWheelZoom: false,
            doubleClickZoom: true,
            dragging: true,
            tap: true,
            touchZoom: true,
          }).setView(center, 13);

          mapRef.current.on("click", (event) => {
            const point = {
              lat: Number(event.latlng.lat.toFixed(6)),
              lon: Number(event.latlng.lng.toFixed(6)),
              ele: null,
            };

            let next = [...pointsRef.current];

            if (insertMode && next.length >= 2) {
              let bestIndex = next.length;
              let bestDistance = Infinity;

              for (let index = 0; index < next.length - 1; index += 1) {
                const a = mapRef.current.latLngToLayerPoint([next[index].lat, next[index].lon]);
                const b = mapRef.current.latLngToLayerPoint([next[index + 1].lat, next[index + 1].lon]);
                const p = mapRef.current.latLngToLayerPoint(event.latlng);
                const distance = distSeg(p, a, b);

                if (distance < bestDistance) {
                  bestDistance = distance;
                  bestIndex = index + 1;
                }
              }

              next.splice(bestIndex, 0, point);
            } else {
              next.push(point);
            }

            onChange?.(next);
          });
        }

        setTimeout(() => mapRef.current?.invalidateSize(true), 140);
      } catch (err) {
        console.error("Route draw map error", err);
        setError(err?.message || "Could not load map.");
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function updateTiles() {
      const L = await loadLeaflet();
      if (cancelled || !mapRef.current) return;

      const selected = LAYERS[layer] || LAYERS.light;

      if (tileRef.current) tileRef.current.remove();

      tileRef.current = L.tileLayer(selected.url, {
        maxZoom: selected.maxZoom || 20,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapRef.current);

      const tilePane = mapRef.current.getPane("tilePane");
      if (tilePane) tilePane.style.filter = selected.filter;
    }

    updateTiles();

    return () => {
      cancelled = true;
    };
  }, [layer]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const L = await loadLeaflet();
      if (cancelled || !mapRef.current) return;

      if (routeRef.current) routeRef.current.remove();

      const group = L.layerGroup();
      const routeLatLngs = linePoints.map((point) => [point.lat, point.lon]);
      const waypointLatLngs = waypoints.map((point) => [point.lat, point.lon]);

      if (routeLatLngs.length >= 2) {
        L.polyline(routeLatLngs, {
          color: "#000",
          weight: 7,
          opacity: 0.38,
          lineJoin: "round",
          lineCap: "round",
          interactive: false,
        }).addTo(group);

        const routeLine = L.polyline(routeLatLngs, {
          color: "#e6ff00",
          weight: routeMode === "routed" ? 8 : 7,
          opacity: 0,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(group);

        L.polyline(routeLatLngs, {
          color: "#e6ff00",
          weight: routeMode === "routed" ? 3 : 2.6,
          opacity: 1,
          lineJoin: "round",
          lineCap: "round",
          interactive: false,
        }).addTo(group);

        routeLine.on("click", (event) => {
          if (event?.originalEvent) L.DomEvent.stop(event.originalEvent);

          const currentControlPoints = pointsRef.current;
          const newControlPoint = closestRoutePoint(event.latlng, mapRef.current, linePoints);

          if (!newControlPoint) return;

          const next = [...currentControlPoints];
          const insertAt = insertionIndexForRouteClick(event.latlng, mapRef.current, currentControlPoints);

          next.splice(insertAt, 0, newControlPoint);
          onChange?.(next);
        });
      }

      waypoints.forEach((point, index) => {
        const isStart = index === 0;
        const isFinish = index === waypoints.length - 1 && waypoints.length > 1;

        const icon = L.divIcon({
          className: isStart
            ? "route-draw-marker route-draw-marker-start"
            : isFinish
              ? "route-draw-marker route-draw-marker-finish"
              : "route-draw-marker",
          html: `<span>${isStart ? "▶" : isFinish ? "⚑" : index + 1}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        L.marker([point.lat, point.lon], {
          icon,
          draggable: true,
        })
          .on("dragstart", () => {
            isDraggingRef.current = true;
          })
          .on("dragend", (event) => {
            const latLng = event.target.getLatLng();
            const next = pointsRef.current.map((existing, pointIndex) =>
              pointIndex === index
                ? {
                    ...existing,
                    lat: Number(latLng.lat.toFixed(6)),
                    lon: Number(latLng.lng.toFixed(6)),
                  }
                : existing
            );

            isDraggingRef.current = false;
            lastManualFocusRef.current = Date.now();
            onChange?.(next);
          })
          .on("click", () => {
            if (isDraggingRef.current) return;
            const next = pointsRef.current.filter((_, pointIndex) => pointIndex !== index);
            lastManualFocusRef.current = Date.now();
            onChange?.(next);
          })
          .addTo(group);
      });

      group.addTo(mapRef.current);
      routeRef.current = group;

      const boundsSource =
        routeLatLngs.length >= 2
          ? routeLatLngs
          : waypointLatLngs;

      const hasExplicitTarget =
        Number.isFinite(Number(targetLocation?.lat)) && Number.isFinite(Number(targetLocation?.lon));

      const recentlyFocused =
        Date.now() - lastManualFocusRef.current < 8000;

      if (boundsSource.length >= 2 && !hasExplicitTarget && !recentlyFocused && !isDraggingRef.current) {
        mapRef.current.fitBounds(L.latLngBounds(boundsSource), {
          padding: [32, 32],
          maxZoom: 15,
          animate: false,
        });
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [linePoints, waypoints, onChange, routeMode, targetLocation?.lat, targetLocation?.lon]);



  useEffect(() => {
    function handleFlyTo(event) {
      if (!mapRef.current) return;

      const lat = Number(event?.detail?.lat);
      const lon = Number(event?.detail?.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      mapRef.current.flyTo([lat, lon], 15, {
        animate: true,
        duration: 1.1,
      });
    }

    window.addEventListener("endurance:fly-to-location", handleFlyTo);

    return () => {
      window.removeEventListener("endurance:fly-to-location", handleFlyTo);
    };
  }, []);



  useEffect(() => {
    if (!mapRef.current) return;

    const lat = Number(targetLocation?.lat);
    const lon = Number(targetLocation?.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    lastManualFocusRef.current = Date.now();

    mapRef.current.flyTo([lat, lon], 15, {
      animate: true,
      duration: 1.1,
    });
  }, [targetLocation?.lat, targetLocation?.lon]);

  useEffect(() => {
    let cancelled = false;

    async function renderCurrentLocation() {
      const L = await loadLeaflet();
      if (cancelled || !mapRef.current) return;

      if (locationRef.current) {
        locationRef.current.remove();
        locationRef.current = null;
      }

      const lat = Number(currentLocation?.lat);
      const lon = Number(currentLocation?.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const layer = L.layerGroup();

      L.circle([lat, lon], {
        radius: Number(currentLocation?.accuracy || 35),
        color: "#2d8cff",
        weight: 1,
        opacity: 0.55,
        fillColor: "#2d8cff",
        fillOpacity: 0.12,
      }).addTo(layer);

      L.marker([lat, lon], {
        icon: L.divIcon({
          className: "route-current-location-marker",
          html: "<span></span>",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        interactive: false,
      }).addTo(layer);

      layer.addTo(mapRef.current);
      locationRef.current = layer;

      if (focusCurrentLocation && !hasFocusedLocationRef.current) {
        hasFocusedLocationRef.current = true;
        mapRef.current.setView([lat, lon], 15, { animate: true });
      }
    }

    renderCurrentLocation();

    return () => {
      cancelled = true;
    };
  }, [currentLocation, focusCurrentLocation]);

  return (
    <div className="route-draw-map-wrap route-draw-map-wrap-light">
      <div className="route-draw-map-toolbar">
        <span>{title}</span>
        <small>{insertMode ? "Insert mode · tap near a segment" : "Tap route line to create a draggable control point · drag control points"}</small>
      </div>

      <div ref={containerRef} className="route-draw-map" style={{ height, minHeight: height }} />

      <div className="route-draw-layer-switcher">
        {Object.entries(LAYERS).map(([key, value]) => (
          <button
            key={key}
            type="button"
            className={layer === key ? "active" : ""}
            onClick={() => onLayerChange?.(key)}
          >
            <span />
            {value.label}
          </button>
        ))}
      </div>

      {error ? <div className="route-draw-error">{error}</div> : null}
    </div>
  );
}
