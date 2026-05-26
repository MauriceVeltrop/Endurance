"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const CSS_ID = "endurance-leaflet-css";
const SCRIPT_ID = "endurance-leaflet-script";

const LAYERS = {
  standard: {
    label: "OSM",
    provider: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    filter: "none",
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  },
  minimal: {
    label: "Minimal",
    provider: "Carto Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    filter: "brightness(1) saturate(.92) contrast(1.02)",
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  },
  outdoor: {
    label: "Outdoor",
    provider: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    filter: "brightness(1.04) saturate(.96) contrast(.98)",
    maxZoom: 17,
    attribution: "&copy; OpenStreetMap contributors, SRTM | OpenTopoMap",
  },
  cycling: {
    label: "Cycling",
    provider: "CyclOSM",
    url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    filter: "brightness(1.03) saturate(.92) contrast(.98)",
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors | CyclOSM",
  },
  satellite: {
    label: "Satellite",
    provider: "Esri World Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    filter: "brightness(.92) saturate(.98) contrast(1.04)",
    maxZoom: 19,
    attribution: "Tiles &copy; Esri",
  },
  dark: {
    label: "Dark",
    provider: "Carto Dark Matter",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    filter: "brightness(.98) saturate(1.04) contrast(1.03)",
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
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

function nearestPointIndex(target, linePoints) {
  if (!target || !Array.isArray(linePoints) || !linePoints.length) return -1;

  let bestIndex = -1;
  let bestDistance = Infinity;

  linePoints.forEach((point, index) => {
    const distance = Math.hypot(Number(point.lat) - Number(target.lat), Number(point.lon) - Number(target.lon));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function buildShapeHandles(controlPoints, linePoints) {
  if (!Array.isArray(controlPoints) || controlPoints.length < 2) return [];

  return controlPoints.slice(0, -1).map((point, index) => {
    const next = controlPoints[index + 1];
    let handle = {
      lat: Number(((Number(point.lat) + Number(next.lat)) / 2).toFixed(6)),
      lon: Number(((Number(point.lon) + Number(next.lon)) / 2).toFixed(6)),
      segmentIndex: index,
    };

    if (Array.isArray(linePoints) && linePoints.length >= 2) {
      const startIndex = nearestPointIndex(point, linePoints);
      const endIndex = nearestPointIndex(next, linePoints);

      if (startIndex >= 0 && endIndex >= 0 && startIndex !== endIndex) {
        const low = Math.min(startIndex, endIndex);
        const high = Math.max(startIndex, endIndex);
        const mid = linePoints[Math.round((low + high) / 2)];

        if (mid) {
          handle = {
            lat: Number(Number(mid.lat).toFixed(6)),
            lon: Number(Number(mid.lon).toFixed(6)),
            segmentIndex: index,
          };
        }
      }
    }

    return handle;
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

function disableMarkerDragging(markers) {
  (markers || []).forEach((marker) => {
    try {
      marker?.dragging?.disable?.();
    } catch (_) {}
  });
}

function enableMarkerDragging(markers) {
  (markers || []).forEach((marker) => {
    try {
      marker?.dragging?.enable?.();
    } catch (_) {}
  });
}

function isMultiTouchEvent(event) {
  const source = event?.originalEvent || event;
  return Number(source?.touches?.length || 0) > 1 || Number(source?.targetTouches?.length || 0) > 1;
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
  onTargetLocationHandled,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const routeRef = useRef(null);
  const locationRef = useRef(null);
  const pointsRef = useRef(points);
  const hasFocusedLocationRef = useRef(false);
  const lastManualFocusRef = useRef(0);
  const userOwnsCameraRef = useRef(false);
  const hasInitialRouteFitRef = useRef(false);
  const lastRouteFitKeyRef = useRef("");
  const lastTargetFocusKeyRef = useRef("");
  const isDraggingRef = useRef(false);
  const isMultiTouchRef = useRef(false);
  const markerRefs = useRef([]);
  const [error, setError] = useState("");
  const [dynamicHandle, setDynamicHandle] = useState(null);
  const [mapZoom, setMapZoom] = useState(13);

  const waypoints = useMemo(() => norm(points), [points]);
  const linePoints = useMemo(() => {
    const routed = norm(routedPoints);
    return routed.length >= 2 && routeMode === "routed" ? routed : waypoints;
  }, [routedPoints, waypoints, routeMode]);

  useEffect(() => {
    pointsRef.current = waypoints;
  }, [waypoints]);

  useEffect(() => {
    if (waypoints.length < 2 && linePoints.length < 2) {
      hasInitialRouteFitRef.current = false;
      lastRouteFitKeyRef.current = "";
      userOwnsCameraRef.current = false;
    }
  }, [waypoints.length, linePoints.length]);

  useEffect(() => {
    setDynamicHandle(null);
  }, [waypoints.length]);

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

          const markUserCamera = () => {
            userOwnsCameraRef.current = true;
            lastManualFocusRef.current = Date.now();
          };

          mapRef.current.on("zoomstart", markUserCamera);
          mapRef.current.on("movestart", markUserCamera);
          mapRef.current.on("dragstart", markUserCamera);
          mapRef.current.on("zoomend", () => {
            setMapZoom(Number(mapRef.current?.getZoom?.() || 13));
          });

          const container = mapRef.current.getContainer?.();
          const startMultiTouch = (event) => {
            if (Number(event?.touches?.length || 0) > 1) {
              userOwnsCameraRef.current = true;
              lastManualFocusRef.current = Date.now();
              isMultiTouchRef.current = true;
              isDraggingRef.current = false;
              disableMarkerDragging(markerRefs.current);
              mapRef.current?.dragging?.enable?.();
              mapRef.current?.touchZoom?.enable?.();
            }
          };
          const endMultiTouch = (event) => {
            if (Number(event?.touches?.length || 0) <= 1) {
              window.setTimeout(() => {
                isMultiTouchRef.current = false;
                enableMarkerDragging(markerRefs.current);
              }, 120);
            }
          };

          container?.addEventListener("touchstart", startMultiTouch, { passive: true, capture: true });
          container?.addEventListener("touchmove", startMultiTouch, { passive: true, capture: true });
          container?.addEventListener("touchend", endMultiTouch, { passive: true, capture: true });
          container?.addEventListener("touchcancel", endMultiTouch, { passive: true, capture: true });

          mapRef.current.__enduranceTouchCleanup = () => {
            container?.removeEventListener("touchstart", startMultiTouch, { capture: true });
            container?.removeEventListener("touchmove", startMultiTouch, { capture: true });
            container?.removeEventListener("touchend", endMultiTouch, { capture: true });
            container?.removeEventListener("touchcancel", endMultiTouch, { capture: true });
          };

          mapRef.current.on("click", (event) => {
            if (isMultiTouchRef.current || isMultiTouchEvent(event)) return;
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

      const selected = LAYERS[layer] || LAYERS.standard;

      if (tileRef.current) tileRef.current.remove();

      tileRef.current = L.tileLayer(selected.url, {
        maxZoom: selected.maxZoom || 20,
        attribution: selected.attribution || "&copy; OpenStreetMap contributors",
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
      markerRefs.current = [];

      const group = L.layerGroup();
      const routeLatLngs = linePoints.map((point) => [point.lat, point.lon]);
      const waypointLatLngs = waypoints.map((point) => [point.lat, point.lon]);

      if (routeLatLngs.length >= 2) {
        L.polyline(routeLatLngs, {
          color: "#031006",
          weight: routeMode === "routed" ? 11 : 9,
          opacity: 0.42,
          lineJoin: "round",
          lineCap: "round",
          interactive: false,
        }).addTo(group);

        L.polyline(routeLatLngs, {
          color: "#e6ff00",
          weight: routeMode === "routed" ? 8 : 6,
          opacity: 0.24,
          lineJoin: "round",
          lineCap: "round",
          interactive: false,
        }).addTo(group);

        const routeLine = L.polyline(routeLatLngs, {
          color: "#e6ff00",
          weight: 20,
          opacity: 0,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(group);

        L.polyline(routeLatLngs, {
          color: "#e6ff00",
          weight: routeMode === "routed" ? 4 : 3,
          opacity: 1,
          lineJoin: "round",
          lineCap: "round",
          interactive: false,
        }).addTo(group);

        L.polyline(routeLatLngs, {
          color: "#ffffff",
          weight: 1.15,
          opacity: routeMode === "routed" ? 0.62 : 0.35,
          lineJoin: "round",
          lineCap: "round",
          interactive: false,
        }).addTo(group);

        routeLine.on("click", (event) => {
          if (isMultiTouchRef.current || isMultiTouchEvent(event)) return;
          if (event?.originalEvent) L.DomEvent.stop(event.originalEvent);

          const currentControlPoints = pointsRef.current;
          if (!currentControlPoints || currentControlPoints.length < 2) return;

          const newShapePoint = closestRoutePoint(event.latlng, mapRef.current, linePoints);
          if (!newShapePoint) return;

          const insertAt = insertionIndexForRouteClick(event.latlng, mapRef.current, currentControlPoints);

          setDynamicHandle({
            ...newShapePoint,
            insertAt,
            createdAt: Date.now(),
          });
        });
      }

      const shapeHandles = buildShapeHandles(waypoints, linePoints);
      const currentZoom = Number(mapRef.current?.getZoom?.() || 13);
      const showShapeHandles = routeLatLngs.length >= 2 && waypoints.length >= 2 && currentZoom >= 13;

      if (showShapeHandles) {
        shapeHandles.forEach((handle) => {
          const icon = L.divIcon({
            className: "route-shape-handle route-shape-handle-visible",
            html: "<span></span>",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });

          L.marker([handle.lat, handle.lon], {
            icon,
            draggable: true,
            zIndexOffset: 520,
          })
            .on("dragstart", (event) => {
              if (isMultiTouchRef.current || isMultiTouchEvent(event)) {
                isDraggingRef.current = false;
                return;
              }
              isDraggingRef.current = true;
              mapRef.current?.dragging?.disable?.();
            })
            .on("dragend", (event) => {
              const latLng = event.target.getLatLng();
              const promoted = {
                lat: Number(latLng.lat.toFixed(6)),
                lon: Number(latLng.lng.toFixed(6)),
                ele: null,
              };

              const next = [...pointsRef.current];
              const insertAt = Math.max(1, Math.min(Number(handle.segmentIndex) + 1, next.length));
              next.splice(insertAt, 0, promoted);

              isDraggingRef.current = false;
              mapRef.current?.dragging?.enable?.();
              lastManualFocusRef.current = Date.now();
              setDynamicHandle(null);
              onChange?.(next, {
                type: "promote_shape_handle",
                insertAt,
                segmentIndex: Number(handle.segmentIndex),
              });
            })
            .on("click", (event) => {
              if (event?.originalEvent) L.DomEvent.stop(event.originalEvent);
            })
            .addTo(group);
        });
      }

      if (dynamicHandle && Number.isFinite(dynamicHandle.lat) && Number.isFinite(dynamicHandle.lon)) {
        const icon = L.divIcon({
          className: "route-dynamic-shape-handle",
          html: "<span></span><em>Drag to shape</em>",
          iconSize: [94, 34],
          iconAnchor: [17, 17],
        });

        L.marker([dynamicHandle.lat, dynamicHandle.lon], {
          icon,
          draggable: true,
          zIndexOffset: 650,
        })
          .on("dragstart", () => {
            isDraggingRef.current = true;
          })
          .on("dragend", (event) => {
            const latLng = event.target.getLatLng();
            const promoted = {
              lat: Number(latLng.lat.toFixed(6)),
              lon: Number(latLng.lng.toFixed(6)),
              ele: null,
            };

            const next = [...pointsRef.current];
            const insertAt = Math.max(1, Math.min(Number(dynamicHandle.insertAt) || next.length, next.length));
            next.splice(insertAt, 0, promoted);

            isDraggingRef.current = false;
            lastManualFocusRef.current = Date.now();
            setDynamicHandle(null);
            onChange?.(next, {
              type: "promote_shape_handle",
              insertAt,
              segmentIndex: Number(dynamicHandle.insertAt) - 1,
            });
          })
          .on("click", (event) => {
            if (event?.originalEvent) L.DomEvent.stop(event.originalEvent);
          })
          .addTo(group);
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
            mapRef.current?.dragging?.disable?.();
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
            mapRef.current?.dragging?.enable?.();
            lastManualFocusRef.current = Date.now();
            onChange?.(next, {
              type: "move_control_point",
              index,
            });
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
      markerRefs.current = group.getLayers ? group.getLayers().filter((layer) => layer?.dragging) : [];
      if (isMultiTouchRef.current) disableMarkerDragging(markerRefs.current);

      const boundsSource =
        routeLatLngs.length >= 2
          ? routeLatLngs
          : waypointLatLngs;

      const recentlyFocused = Date.now() - lastManualFocusRef.current < 3500;
      const routeFitKey = boundsSource.length >= 2
        ? `${boundsSource[0]?.lat?.toFixed?.(5) || boundsSource[0]?.[0] || ""}:${boundsSource[0]?.lon?.toFixed?.(5) || boundsSource[0]?.lng?.toFixed?.(5) || boundsSource[0]?.[1] || ""}:${boundsSource.length}`
        : "";

      const mayAutoFitRoute =
        boundsSource.length >= 2 &&
        !hasInitialRouteFitRef.current &&
        !userOwnsCameraRef.current &&
        !recentlyFocused &&
        !isDraggingRef.current &&
        !isMultiTouchRef.current &&
        routeFitKey &&
        lastRouteFitKeyRef.current !== routeFitKey;

      if (mayAutoFitRoute) {
        hasInitialRouteFitRef.current = true;
        lastRouteFitKeyRef.current = routeFitKey;
        mapRef.current.fitBounds(L.latLngBounds(boundsSource), {
          padding: [42, 42],
          maxZoom: 15,
          animate: false,
        });
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [linePoints, waypoints, onChange, routeMode, targetLocation?.lat, targetLocation?.lon, dynamicHandle?.lat, dynamicHandle?.lon, dynamicHandle?.insertAt, mapZoom]);



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

    const focusKey = `${lat.toFixed(6)}:${lon.toFixed(6)}:${targetLocation?.selectedAt || targetLocation?.forceFocusAt || "manual"}`;
    if (lastTargetFocusKeyRef.current === focusKey) return;

    lastTargetFocusKeyRef.current = focusKey;
    lastManualFocusRef.current = Date.now();

    mapRef.current.flyTo([lat, lon], Number(targetLocation?.zoom || 15), {
      animate: true,
      duration: 0.85,
    });

    window.setTimeout(() => {
      onTargetLocationHandled?.();
    }, 900);
  }, [targetLocation?.lat, targetLocation?.lon, targetLocation?.selectedAt, targetLocation?.forceFocusAt, targetLocation?.zoom, onTargetLocationHandled]);

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

      const hasExistingRoute = pointsRef.current.length > 0 || linePoints.length >= 2;

      if (focusCurrentLocation && !hasFocusedLocationRef.current && !hasExistingRoute) {
        hasFocusedLocationRef.current = true;
        lastManualFocusRef.current = Date.now();
        mapRef.current.setView([lat, lon], 15, { animate: true });
      }
    }

    renderCurrentLocation();

    return () => {
      cancelled = true;
    };
  }, [currentLocation, focusCurrentLocation, linePoints.length]);

  return (
    <div className="route-draw-map-wrap route-draw-map-wrap-light">
      <div className="route-draw-map-toolbar">
        <span>{title}</span>
        <small>{insertMode ? "Insert mode · tap near a segment" : "Drag white handles to shape the route"}</small>
      </div>

      <div ref={containerRef} className="route-draw-map endurance-premium-map" style={{ height, minHeight: height }} />


      {error ? <div className="route-draw-error">{error}</div> : null}
    </div>
  );
}
