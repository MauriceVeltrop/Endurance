"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  routeMapMeta,
  routeMapTitle,
  routeMapWrap,
  routeSvg,
} from "../lib/enduranceStyles";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject();

    if (window.L) {
      resolve(window.L);
      return;
    }

    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector(`script[src="${LEAFLET_JS}"]`);

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.L));
      existingScript.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

export default function DetailRouteMap({ points }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const validPoints = useMemo(() => {
    return (points || []).filter(
      (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))
    );
  }, [points]);

  const elevationPoints = useMemo(() => {
    return validPoints.filter((p) => Number.isFinite(Number(p.ele)));
  }, [validPoints]);

  const hasElevation = elevationPoints.length >= 2;

  const minEle = hasElevation
    ? Math.min(...elevationPoints.map((p) => Number(p.ele)))
    : null;

  const maxEle = hasElevation
    ? Math.max(...elevationPoints.map((p) => Number(p.ele)))
    : null;

  useEffect(() => {
    if (!mapRef.current || validPoints.length < 2) return;

    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !mapRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const latLngs = validPoints.map((p) => [
        Number(p.lat),
        Number(p.lon),
      ]);

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
        dragging: false,
        tap: false,
        touchZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
      });

      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      L.polyline(latLngs, {
        color: "#111",
        weight: 6,
        opacity: 0.35,
      }).addTo(map);

      const route = L.polyline(latLngs, {
        color: "#e4ef16",
        weight: 3,
        opacity: 0.95,
      }).addTo(map);

      L.circleMarker(latLngs[0], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#22c55e",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup("Start");

      L.circleMarker(latLngs[latLngs.length - 1], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#ef4444",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup("Finish");

      map.fitBounds(route.getBounds(), {
        padding: [24, 24],
      });

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    });

    return () => {
      cancelled = true;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [validPoints]);

  if (validPoints.length < 2) return null;

  const profileWidth = 360;
  const profileHeight = 76;
  const padding = 24;
  const eleRange = hasElevation ? maxEle - minEle || 1 : 1;

  const step = Math.max(1, Math.floor(elevationPoints.length / 600));

  const simplifiedElevation = elevationPoints.filter(
    (_, index) => index % step === 0 || index === elevationPoints.length - 1
  );

  const elevationPath =
    hasElevation &&
    simplifiedElevation
      .map((point, index) => {
        const x =
          padding +
          (index / Math.max(simplifiedElevation.length - 1, 1)) *
            (profileWidth - padding * 2);

        const y =
          profileHeight -
          padding +
          4 -
          ((Number(point.ele) - minEle) / eleRange) *
            (profileHeight - padding);

        return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const elevationFillPath = elevationPath
    ? `${elevationPath} L ${profileWidth - padding} ${
        profileHeight - 10
      } L ${padding} ${profileHeight - 10} Z`
    : "";

  return (
    <div style={routeMapWrap}>
      <div style={routeMapTitle}>Route map</div>

      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: 260,
          borderRadius: 18,
          overflow: "hidden",
          background: "#101010",
          border: "1px solid rgba(255,255,255,0.08)",
          touchAction: "pan-x",
        }}
      />

      {hasElevation && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...routeMapTitle, marginBottom: 6 }}>
            Elevation profile
          </div>

          <svg
            viewBox={`0 0 ${profileWidth} ${profileHeight}`}
            style={routeSvg}
            preserveAspectRatio="none"
          >
            <rect
              x="0"
              y="0"
              width={profileWidth}
              height={profileHeight}
              rx="14"
              fill="#101010"
            />

            <path d={elevationFillPath} fill="rgba(228,239,22,0.12)" />

            <path
              d={elevationPath}
              fill="none"
              stroke="#e4ef16"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <line
              x1={padding}
              x2={profileWidth - padding}
              y1={profileHeight - 10}
              y2={profileHeight - 10}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
          </svg>
        </div>
      )}

      {hasElevation && (
        <div style={routeMapMeta}>
          Elevation range: {Math.round(minEle)} m - {Math.round(maxEle)} m
        </div>
      )}
    </div>
  );
}
