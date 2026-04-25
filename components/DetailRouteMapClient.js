"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

function FitRouteBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length < 2) return;

    const bounds = points.map((p) => [p.lat, p.lng]);

    map.fitBounds(bounds, {
      padding: [24, 24],
      maxZoom: 15,
    });
  }, [map, points]);

  return null;
}

function DisableMapInteraction() {
  const map = useMap();

  useEffect(() => {
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();

    if (map.tap) {
      map.tap.disable();
    }
  }, [map]);

  return null;
}

function parseGpx(gpxText) {
  if (!gpxText) return [];

  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(gpxText, "application/xml");

    const trkpts = Array.from(xml.getElementsByTagName("trkpt"));
    const rtepts = Array.from(xml.getElementsByTagName("rtept"));

    const sourcePoints = trkpts.length > 0 ? trkpts : rtepts;

    return sourcePoints
      .map((pt) => {
        const lat = Number(pt.getAttribute("lat"));
        const lng = Number(pt.getAttribute("lon"));
        const eleNode = pt.getElementsByTagName("ele")[0];
        const ele = eleNode ? Number(eleNode.textContent) : null;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        return { lat, lng, ele };
      })
      .filter(Boolean);
  } catch (error) {
    console.error("GPX parse error:", error);
    return [];
  }
}

function smoothPoints(points, maxPoints = 900) {
  if (!points || points.length <= maxPoints) return points;

  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % step === 0);
}

export default function DetailRouteMapClient({
  gpxText,
  gpx,
  gpxUrl,
  gpx_url,
  event,
  route,
  height = 245,
  showElevation = true,
}) {
  const [mounted, setMounted] = useState(false);
  const [remoteGpxText, setRemoteGpxText] = useState("");

  const finalGpxUrl =
    gpxUrl ||
    gpx_url ||
    event?.gpxUrl ||
    event?.gpx_url ||
    event?.gpx_file_url ||
    "";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRemoteGpx() {
      if (!finalGpxUrl) return;
      if (typeof gpxText === "string" && gpxText.trim()) return;
      if (typeof gpx === "string" && gpx.trim().startsWith("<")) return;

      try {
        const response = await fetch(finalGpxUrl);
        if (!response.ok) throw new Error("Could not fetch GPX");

        const text = await response.text();

        if (!cancelled) {
          setRemoteGpxText(text);
        }
      } catch (error) {
        console.error("GPX fetch error:", error);
      }
    }

    loadRemoteGpx();

    return () => {
      cancelled = true;
    };
  }, [finalGpxUrl, gpxText, gpx]);

  const rawPoints = useMemo(() => {
    if (Array.isArray(route)) return route;

    if (typeof gpxText === "string" && gpxText.trim()) {
      return parseGpx(gpxText);
    }

    if (typeof gpx === "string" && gpx.trim().startsWith("<")) {
      return parseGpx(gpx);
    }

    if (typeof remoteGpxText === "string" && remoteGpxText.trim()) {
      return parseGpx(remoteGpxText);
    }

    return [];
  }, [gpxText, gpx, remoteGpxText, route]);

  const points = useMemo(() => smoothPoints(rawPoints), [rawPoints]);

  const polyline = useMemo(() => {
    return points.map((p) => [p.lat, p.lng]);
  }, [points]);

  const startPoint = points[0];
  const endPoint = points[points.length - 1];

  const elevationData = useMemo(() => {
    return points
      .filter((p) => Number.isFinite(p.ele))
      .map((p) => p.ele);
  }, [points]);

  if (!mounted) return null;

  if (finalGpxUrl && points.length < 2) {
    return (
      <div
        style={{
          width: "100%",
          height,
          borderRadius: 18,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.65)",
          fontSize: 14,
          marginTop: 12,
          marginBottom: 14,
        }}
      >
        Loading route…
      </div>
    );
  }

  if (!points || points.length < 2) return null;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        marginTop: 12,
        marginBottom: 14,
        zIndex: 1,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height,
          borderRadius: 18,
          overflow: "hidden",
          background: "#1b1b1b",
          border: "1px solid rgba(255,255,255,0.12)",
          zIndex: 1,
          touchAction: "pan-y",
        }}
      >
        <MapContainer
          center={[startPoint.lat, startPoint.lng]}
          zoom={13}
          zoomControl={false}
          attributionControl={true}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          boxZoom={false}
          keyboard={false}
          style={{
            width: "100%",
            height: "100%",
            zIndex: 1,
            pointerEvents: "none",
            touchAction: "pan-y",
          }}
        >
          <TileLayer
            attribution="© OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Polyline
            positions={polyline}
            pathOptions={{
              color: "#2d3436",
              weight: 8,
              opacity: 0.35,
            }}
          />

          <Polyline
            positions={polyline}
            pathOptions={{
              color: "#dfff00",
              weight: 5,
              opacity: 0.95,
            }}
          />

          <CircleMarker
            center={[startPoint.lat, startPoint.lng]}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#33d17a",
              fillOpacity: 1,
            }}
          />

          <CircleMarker
            center={[endPoint.lat, endPoint.lng]}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#ff4d4d",
              fillOpacity: 1,
            }}
          />

          <FitRouteBounds points={points} />
          <DisableMapInteraction />
        </MapContainer>
      </div>

      {showElevation && elevationData.length > 5 && (
        <div
          style={{
            width: "100%",
            height: 52,
            marginTop: 8,
            borderRadius: 14,
            overflow: "hidden",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <svg
            viewBox="0 0 300 52"
            preserveAspectRatio="none"
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          >
            {(() => {
              const min = Math.min(...elevationData);
              const max = Math.max(...elevationData);
              const range = max - min || 1;
              const step = 300 / (elevationData.length - 1);

              const path = elevationData
                .map((ele, index) => {
                  const x = index * step;
                  const y = 44 - ((ele - min) / range) * 34;
                  return `${index === 0 ? "M" : "L"} ${x} ${y}`;
                })
                .join(" ");

              const fillPath = `${path} L 300 52 L 0 52 Z`;

              return (
                <>
                  <path d={fillPath} fill="rgba(223,255,0,0.18)" />
                  <path
                    d={path}
                    fill="none"
                    stroke="#dfff00"
                    strokeWidth="2.5"
                  />
                </>
              );
            })()}
          </svg>
        </div>
      )}
    </div>
  );
}
