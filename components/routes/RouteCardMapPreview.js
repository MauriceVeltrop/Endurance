"use client";

function normalizePoints(routePoints) {
  if (!routePoints) return [];

  const raw = Array.isArray(routePoints)
    ? routePoints
    : Array.isArray(routePoints.points)
      ? routePoints.points
      : [];

  return raw
    .map((point) => ({
      lat: Number(point.lat ?? point.latitude),
      lng: Number(point.lng ?? point.lon ?? point.longitude),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function createPolyline(points, width = 320, height = 190, padding = 16) {
  if (!points?.length) return "";

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;

  return points.map((p) => {
    const x =
      padding +
      ((p.lng - minLng) / lngRange) * (width - padding * 2);

    const y =
      height -
      padding -
      ((p.lat - minLat) / latRange) * (height - padding * 2);

    return `${x},${y}`;
  }).join(" ");
}

export default function RouteCardMapPreview({ routePoints }) {
  const points = normalizePoints(routePoints);

  if (points.length < 2) {
    return (
      <div style={styles.empty}>
        No route preview
      </div>
    );
  }

  const polyline = createPolyline(points);

  const start = polyline.split(" ")[0]?.split(",");
  const finish = polyline.split(" ").at(-1)?.split(",");

  return (
    <div style={styles.wrapper}>
      <div style={styles.mapTexture} />

      <svg
        viewBox="0 0 320 190"
        preserveAspectRatio="xMidYMid meet"
        style={styles.svg}
      >
        <polyline
          points={polyline}
          fill="none"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <polyline
          points={polyline}
          fill="none"
          stroke="#e4ef16"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          cx={start?.[0]}
          cy={start?.[1]}
          r="6"
          fill="#e4ef16"
          stroke="#111"
          strokeWidth="3"
        />

        <circle
          cx={finish?.[0]}
          cy={finish?.[1]}
          r="6"
          fill="#ffffff"
          stroke="#111"
          strokeWidth="3"
        />
      </svg>

      <div style={styles.overlay} />
    </div>
  );
}

const styles = {
  wrapper: {
    position: "relative",
    height: 210,
    overflow: "hidden",
    background:
      "linear-gradient(145deg,#0d120d,#040604)",
  },

  mapTexture: {
    position: "absolute",
    inset: 0,
    opacity: 0.22,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
    backgroundSize: "28px 28px",
  },

  svg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    filter:
      "drop-shadow(0 10px 20px rgba(228,239,22,0.28))",
  },

  overlay: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 75% 20%, rgba(228,239,22,0.14), transparent 34%)",
    pointerEvents: "none",
  },

  empty: {
    height: 210,
    display: "grid",
    placeItems: "center",
    color: "rgba(255,255,255,0.55)",
    fontWeight: 800,
    background:
      "linear-gradient(145deg,#0d120d,#040604)",
  },
};
