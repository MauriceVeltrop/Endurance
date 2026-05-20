"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const LEAFLET_CSS_ID = "endurance-leaflet-css";
const LEAFLET_SCRIPT_ID = "endurance-leaflet-script";

function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("Window unavailable"));

  if (window.L) return Promise.resolve(window.L);

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

function normalize(points) {
  return (points || [])
    .map((point) => ({
      lat: Number(point.lat ?? point.latitude),
      lon: Number(point.lon ?? point.lng ?? point.longitude),
      ele: point.ele ?? null,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}


function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  const projectionX = a.x + t * dx;
  const projectionY = a.y + t * dy;

  return Math.hypot(p.x - projectionX, p.y - projectionY);
}

export default function RouteDrawMap({
  points = [],
  onChange,
  height = 420,
  center = [50.887, 6.023],
  title = "Draw route",
  insertMode = false,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const pointsRef = useRef(points);

  const [error, setError] = useState("");
  const normalizedPoints = useMemo(() => normalize(points), [points]);

  useEffect(() => {
    pointsRef.current = normalizedPoints;
  }, [normalizedPoints]);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
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

          L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
            maxZoom: 20,
            attribution: "&copy; OpenStreetMap &copy; CARTO",
          }).addTo(mapRef.current);

          if (mapRef.current.getPane("tilePane")) {
            mapRef.current.getPane("tilePane").style.filter = "brightness(0.82) saturate(1.08) contrast(1.08)";
          }

          mapRef.current.on("click", (event) => {
            const newPoint = {
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
                const distance = distanceToSegment(p, a, b);

                if (distance < bestDistance) {
                  bestDistance = distance;
                  bestIndex = index + 1;
                }
              }

              next.splice(bestIndex, 0, newPoint);
            } else {
              next.push(newPoint);
            }

            onChange?.(next);
          });
        }

        setTimeout(() => mapRef.current?.invalidateSize(true), 150);
      } catch (err) {
        console.error("Route draw map error", err);
        setError(err?.message || "Could not load draw map.");
      }
    }

    initMap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderRoute() {
      const L = await loadLeaflet();
      if (cancelled || !mapRef.current) return;

      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
        routeLayerRef.current = null;
      }

      const group = L.layerGroup();
      const latLngs = normalizedPoints.map((point) => [point.lat, point.lon]);

      if (latLngs.length >= 2) {
        L.polyline(latLngs, {
          color: "#000",
          weight: 15,
          opacity: 0.58,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(group);

        L.polyline(latLngs, {
          color: "#e6ff00",
          weight: 6,
          opacity: 1,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(group);
      }

      normalizedPoints.forEach((point, index) => {
        const isStart = index === 0;
        const isFinish = index === normalizedPoints.length - 1 && normalizedPoints.length > 1;

        const icon = L.divIcon({
          className: isStart
            ? "route-draw-marker route-draw-marker-start"
            : isFinish
              ? "route-draw-marker route-draw-marker-finish"
              : "route-draw-marker",
          html: `<span>${index + 1}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        L.marker([point.lat, point.lon], {
          icon,
          draggable: true,
        })
          .on("dragend", (event) => {
            const marker = event.target;
            const latLng = marker.getLatLng();
            const next = pointsRef.current.map((existing, pointIndex) =>
              pointIndex === index
                ? {
                    ...existing,
                    lat: Number(latLng.lat.toFixed(6)),
                    lon: Number(latLng.lng.toFixed(6)),
                  }
                : existing
            );

            onChange?.(next);
          })
          .on("click", () => {
            const next = pointsRef.current.filter((_, pointIndex) => pointIndex !== index);
            onChange?.(next);
          })
          .bindTooltip(`Point ${index + 1} · tap to remove`, { direction: "top", opacity: 0.9 })
          .addTo(group);
      });

      group.addTo(mapRef.current);
      routeLayerRef.current = group;

      if (latLngs.length >= 2) {
        mapRef.current.fitBounds(L.latLngBounds(latLngs), {
          padding: [28, 28],
          maxZoom: 15,
          animate: false,
        });
      }
    }

    renderRoute();

    return () => {
      cancelled = true;
    };
  }, [normalizedPoints, onChange]);

  return (
    <div className="route-draw-map-wrap">
      <div className="route-draw-map-toolbar">
        <span>{title}</span>
        <small>{insertMode ? "Insert mode · tap near a segment" : "Tap map to add points · drag markers · tap marker to remove"}</small>
      </div>
      <div ref={containerRef} className="route-draw-map" style={{ height, minHeight: height }} />
      {error ? <div className="route-draw-error">{error}</div> : null}
    </div>
  );
}
