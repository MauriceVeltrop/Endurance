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

const ROUTE_COLOR = "#dfff00";
const DARK_LINE = "#2d3436";
const CARD_BG = "rgba(255,255,255,0.06)";
const CARD_BORDER = "rgba(255,255,255,0.10)";

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
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();

    if (map.tap) {
      map.tap.disable();
    }
  }, [map]);

  return null;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePoint(point) {
  if (!point) return null;

  const lat = toNumber(point.lat ?? point.latitude);
  const lng = toNumber(point.lng ?? point.lon ?? point.longitude);
  const eleRaw =
    point.ele ??
    point.elevation ??
    point.elevation_m ??
    point.alt ??
    point.altitude;
  const ele = toNumber(eleRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    ele,
  };
}

function parseGpx(gpxText) {
  if (!gpxText) return [];

  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(gpxText, "application/xml");

    const parserError = xml.getElementsByTagName("parsererror")[0];
    if (parserError) return [];

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

        return {
          lat,
          lng,
          ele: Number.isFinite(ele) ? ele : null,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error("GPX parse error:", error);
    return [];
  }
}

function downsamplePoints(points, maxPoints = 1200) {
  if (!points || points.length <= maxPoints) return points;

  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, index) => index % step === 0);

  const last = points[points.length - 1];
  if (last && sampled[sampled.length - 1] !== last) sampled.push(last);

  return sampled;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (degree) => (degree * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function movingAverage(values, radius = 2) {
  if (!values || values.length === 0) return [];

  return values.map((value, index) => {
    let total = 0;
    let count = 0;

    for (let i = index - radius; i <= index + radius; i++) {
      if (i >= 0 && i < values.length && Number.isFinite(values[i])) {
        total += values[i];
        count += 1;
      }
    }

    return count ? total / count : value;
  });
}

function interpolateElevationAtDistance(profile, targetMeters) {
  if (!profile || profile.length === 0) return null;

  if (targetMeters <= profile[0].distanceMeters) return profile[0].ele;
  const last = profile[profile.length - 1];
  if (targetMeters >= last.distanceMeters) return last.ele;

  for (let i = 1; i < profile.length; i++) {
    const previous = profile[i - 1];
    const current = profile[i];

    if (current.distanceMeters >= targetMeters) {
      const span = current.distanceMeters - previous.distanceMeters || 1;
      const ratio = (targetMeters - previous.distanceMeters) / span;
      return previous.ele + (current.ele - previous.ele) * ratio;
    }
  }

  return last.ele;
}

function smoothElevationByDistance(rawProfile, windowMeters = 70) {
  if (!rawProfile || rawProfile.length === 0) return [];

  return rawProfile.map((point, index) => {
    let total = 0;
    let count = 0;

    for (let i = index; i >= 0; i--) {
      if (point.distanceMeters - rawProfile[i].distanceMeters > windowMeters) break;
      if (Number.isFinite(rawProfile[i].ele)) {
        total += rawProfile[i].ele;
        count += 1;
      }
    }

    for (let i = index + 1; i < rawProfile.length; i++) {
      if (rawProfile[i].distanceMeters - point.distanceMeters > windowMeters) break;
      if (Number.isFinite(rawProfile[i].ele)) {
        total += rawProfile[i].ele;
        count += 1;
      }
    }

    return {
      ...point,
      ele: count ? total / count : point.ele,
    };
  });
}

function calculateRollingGrades(profile, windowMeters = 120) {
  if (!profile || profile.length < 2) {
    return { steepestClimb: null, steepestDescent: null };
  }

  const totalDistance = profile[profile.length - 1].distanceMeters || 0;

  if (totalDistance < windowMeters) {
    return { steepestClimb: null, steepestDescent: null };
  }

  let steepestClimb = null;
  let steepestDescent = null;

  for (let startMeters = 0; startMeters + windowMeters <= totalDistance; startMeters += 10) {
    const endMeters = startMeters + windowMeters;
    const startEle = interpolateElevationAtDistance(profile, startMeters);
    const endEle = interpolateElevationAtDistance(profile, endMeters);

    if (!Number.isFinite(startEle) || !Number.isFinite(endEle)) continue;

    const grade = ((endEle - startEle) / windowMeters) * 100;

    if (grade > 0 && (steepestClimb === null || grade > steepestClimb)) {
      steepestClimb = grade;
    }

    if (grade < 0 && (steepestDescent === null || grade < steepestDescent)) {
      steepestDescent = grade;
    }
  }

  return {
    steepestClimb,
    steepestDescent,
  };
}

function buildRouteAnalysis(points) {
  if (!points || points.length < 2) {
    return {
      profile: [],
      distanceKm: null,
      elevationGain: null,
      elevationLoss: null,
      minEle: null,
      maxEle: null,
      steepestClimb: null,
      steepestDescent: null,
      pointCount: points?.length || 0,
    };
  }

  let distanceMeters = 0;
  let lastKnownElevation = null;

  const rawProfile = points.map((point, index) => {
    if (index > 0) {
      distanceMeters += haversineMeters(points[index - 1], point);
    }

    if (Number.isFinite(point.ele)) {
      lastKnownElevation = Number(point.ele);
    }

    return {
      distanceMeters,
      distanceKm: distanceMeters / 1000,
      ele: Number.isFinite(lastKnownElevation) ? lastKnownElevation : 0,
      rawEle: Number.isFinite(point.ele) ? Number(point.ele) : null,
      lat: point.lat,
      lng: point.lng,
    };
  });

  // Distance-based smoothing is more accurate than point-based smoothing,
  // because GPX points are not evenly spaced.
  const profile = smoothElevationByDistance(rawProfile, 120);

  let elevationGain = 0;
  let elevationLoss = 0;
  let accumulatedClimb = 0;
  let accumulatedDescent = 0;

  for (let i = 1; i < profile.length; i++) {
    const diff = profile[i].ele - profile[i - 1].ele;

    if (diff > 0) {
      accumulatedClimb += diff;

      if (accumulatedDescent >= 3) {
        elevationLoss += accumulatedDescent;
      }

      accumulatedDescent = 0;
    } else if (diff < 0) {
      accumulatedDescent += Math.abs(diff);

      if (accumulatedClimb >= 3) {
        elevationGain += accumulatedClimb;
      }

      accumulatedClimb = 0;
    }
  }

  if (accumulatedClimb >= 3) elevationGain += accumulatedClimb;
  if (accumulatedDescent >= 3) elevationLoss += accumulatedDescent;

  const elevations = profile.map((p) => p.ele);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);

  // Use a rolling 120m window for realistic maximum gradients.
  // This avoids false spikes from GPS/elevation noise between two close points.
  const { steepestClimb, steepestDescent } = calculateRollingGrades(profile, 150);

  return {
    profile,
    distanceKm: distanceMeters / 1000,
    elevationGain,
    elevationLoss,
    minEle,
    maxEle,
    steepestClimb,
    steepestDescent,
    pointCount: points.length,
  };
}

function formatKm(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(2)} km`;
}

function formatMeters(value) {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)} m`;
}

function formatGrade(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}


function smoothVisualProfile(profile, radius = 5) {
  if (!profile || profile.length === 0) return [];

  return profile.map((point, index) => {
    let weightedTotal = 0;
    let weightTotal = 0;

    for (let offset = -radius; offset <= radius; offset++) {
      const candidate = profile[index + offset];

      if (!candidate || !Number.isFinite(candidate.ele)) continue;

      const weight = radius + 1 - Math.abs(offset);
      weightedTotal += candidate.ele * weight;
      weightTotal += weight;
    }

    return {
      ...point,
      ele: weightTotal ? weightedTotal / weightTotal : point.ele,
    };
  });
}

function buildSmoothSvgPath(points) {
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];

    const midX = ((current.x + next.x) / 2).toFixed(2);
    const midY = ((current.y + next.y) / 2).toFixed(2);

    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  path += ` T ${last.x} ${last.y}`;

  return path;
}

function ElevationProfile({ analysis }) {
  const profile = analysis.profile || [];

  if (profile.length < 6) return null;

  const chartData = smoothVisualProfile(downsamplePoints(profile, 900), 6);
  const visualElevations = chartData.map((point) => point.ele);
  const min = Math.min(...visualElevations);
  const max = Math.max(...visualElevations);
  const range = max - min || 1;

  const width = 360;
  const height = 92;
  const topPad = 12;
  const bottomPad = 18;
  const usableHeight = height - topPad - bottomPad;

  const svgPoints = chartData.map((point, index) => {
    const x = ((index / Math.max(chartData.length - 1, 1)) * width).toFixed(2);
    const y = (
      topPad +
      (1 - (point.ele - min) / range) * usableHeight
    ).toFixed(2);

    return { x, y };
  });

  const path = buildSmoothSvgPath(svgPoints);
  const fillPath = `${path} L ${width} ${height} L 0 ${height} Z`;

  const gridLines = [0.25, 0.5, 0.75].map((ratio) => {
    const y = topPad + ratio * usableHeight;
    return (
      <line
        key={ratio}
        x1="0"
        x2={width}
        y1={y}
        y2={y}
        stroke="rgba(255,255,255,0.10)"
        strokeDasharray="4 5"
      />
    );
  });

  return (
    <div style={styles.elevationCard}>
      <div style={styles.elevationHeader}>
        <div>
          <div style={styles.elevationTitle}>Elevation profile v2</div>
          <div style={styles.elevationSub}>
            {formatKm(analysis.distanceKm)} • {analysis.pointCount} points • filtered
          </div>
        </div>

        <div style={styles.elevationRange}>
          {formatMeters(min)}–{formatMeters(max)}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={styles.elevationSvg}
      >
        <defs>
          <linearGradient id="enduranceElevationFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(223,255,0,0.55)" />
            <stop offset="100%" stopColor="rgba(223,255,0,0.08)" />
          </linearGradient>
        </defs>

        {gridLines}
        <path d={fillPath} fill="url(#enduranceElevationFill)" />
        <path
          d={path}
          fill="none"
          stroke={ROUTE_COLOR}
          strokeWidth="2.7"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div style={styles.elevationStats}>
        <div style={styles.statPill}>
          <span style={styles.statLabel}>Gain</span>
          <strong>{formatMeters(analysis.elevationGain)}+</strong>
        </div>

        <div style={styles.statPill}>
          <span style={styles.statLabel}>Loss</span>
          <strong>{formatMeters(analysis.elevationLoss)}−</strong>
        </div>

        <div style={styles.statPill}>
          <span style={styles.statLabel}>Max 150m</span>
          <strong>{formatGrade(analysis.steepestClimb)}</strong>
        </div>

        <div style={styles.statPill}>
          <span style={styles.statLabel}>Min 150m</span>
          <strong>{formatGrade(analysis.steepestDescent)}</strong>
        </div>
      </div>
    </div>
  );
}

export default function DetailRouteMapClient({
  gpxText,
  gpx,
  gpxUrl,
  gpx_url,
  event,
  route,
  points: pointsProp,
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
    if (Array.isArray(pointsProp)) return pointsProp.map(normalizePoint).filter(Boolean);
    if (Array.isArray(route)) return route.map(normalizePoint).filter(Boolean);
    if (Array.isArray(event?.route_points)) {
      return event.route_points.map(normalizePoint).filter(Boolean);
    }

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
  }, [pointsProp, gpxText, gpx, remoteGpxText, route, event?.route_points]);

  const points = useMemo(() => downsamplePoints(rawPoints, 900), [rawPoints]);
  const analysis = useMemo(() => buildRouteAnalysis(rawPoints), [rawPoints]);

  const polyline = useMemo(() => {
    return points.map((p) => [p.lat, p.lng]);
  }, [points]);

  const startPoint = points[0];
  const endPoint = points[points.length - 1];

  if (!mounted) return null;

  if (finalGpxUrl && rawPoints.length < 2) {
    return (
      <div style={{ ...styles.loadingBox, height }}>
        Loading route…
      </div>
    );
  }

  if (!points || points.length < 2) return null;

  return (
    <div style={styles.wrap}>
      <div style={{ ...styles.mapBox, height }}>
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
          style={styles.map}
        >
          <TileLayer
            attribution="© OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Polyline
            positions={polyline}
            pathOptions={{
              color: DARK_LINE,
              weight: 9,
              opacity: 0.42,
            }}
          />

          <Polyline
            positions={polyline}
            pathOptions={{
              color: ROUTE_COLOR,
              weight: 5,
              opacity: 0.98,
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

      {showElevation && <ElevationProfile analysis={analysis} />}
    </div>
  );
}

const styles = {
  wrap: {
    position: "relative",
    width: "100%",
    marginTop: 12,
    marginBottom: 14,
    zIndex: 1,
  },

  mapBox: {
    position: "relative",
    width: "100%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
    background: "#1b1b1b",
    border: "1px solid rgba(255,255,255,0.12)",
    borderBottom: "none",
    zIndex: 1,
    touchAction: "pan-y",
  },

  map: {
    width: "100%",
    height: "100%",
    zIndex: 1,
    pointerEvents: "none",
    touchAction: "pan-y",
  },

  loadingBox: {
    width: "100%",
    borderRadius: 18,
    background: CARD_BG,
    border: `1px solid ${CARD_BORDER}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    marginTop: 12,
    marginBottom: 14,
  },

  elevationCard: {
    width: "100%",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: "hidden",
    background:
      "linear-gradient(180deg, rgba(30,31,22,0.98), rgba(19,20,16,0.98))",
    border: "1px solid rgba(255,255,255,0.12)",
    borderTop: "1px solid rgba(223,255,0,0.20)",
    boxSizing: "border-box",
  },

  elevationHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "11px 12px 6px",
  },

  elevationTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 950,
    letterSpacing: "-0.02em",
  },

  elevationSub: {
    marginTop: 2,
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: 750,
  },

  elevationRange: {
    color: ROUTE_COLOR,
    fontSize: 12,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },

  elevationSvg: {
    width: "100%",
    height: 92,
    display: "block",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.10))",
  },

  elevationStats: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 6,
    padding: "8px 8px 10px",
  },

  statPill: {
    minWidth: 0,
    borderRadius: 12,
    padding: "7px 6px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    gap: 2,
    textAlign: "center",
  },

  statLabel: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 9,
    fontWeight: 850,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
  },
};
