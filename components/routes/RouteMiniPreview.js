"use client";

import { makeSvgPolyline } from "../../lib/routePreview";

export default function RouteMiniPreview({ routePoints, height = 180 }) {
  const previewLine = makeSvgPolyline(routePoints, 320, height, 18);

  return (
    <div style={{ ...styles.wrapper, height }}>
      <div style={styles.grid} />
      <div style={styles.glow} />

      {previewLine ? (
        <svg viewBox={`0 0 320 ${height}`} preserveAspectRatio="xMidYMid meet" style={styles.svg}>
          <polyline
            points={previewLine}
            fill="none"
            stroke="rgba(0,0,0,0.66)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={previewLine}
            fill="none"
            stroke="#e4ef16"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={previewLine.split(" ")[0]?.split(",")[0] || 18}
            cy={previewLine.split(" ")[0]?.split(",")[1] || 18}
            r="6"
            fill="#e4ef16"
            stroke="#111"
            strokeWidth="3"
          />
          <circle
            cx={previewLine.split(" ").at(-1)?.split(",")[0] || 302}
            cy={previewLine.split(" ").at(-1)?.split(",")[1] || height - 18}
            r="6"
            fill="#ffffff"
            stroke="#111"
            strokeWidth="3"
          />
        </svg>
      ) : (
        <div style={styles.empty}>No route preview yet</div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 24,
    background: "linear-gradient(145deg,#0d120d,#040604)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  grid: {
    position: "absolute",
    inset: 0,
    opacity: 0.22,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
    backgroundSize: "28px 28px",
  },
  glow: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 75% 20%, rgba(228,239,22,0.16), transparent 34%), radial-gradient(circle at 20% 78%, rgba(255,255,255,0.06), transparent 34%)",
  },
  svg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    filter: "drop-shadow(0 10px 20px rgba(228,239,22,0.28))",
  },
  empty: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    color: "rgba(255,255,255,0.58)",
    fontWeight: 900,
  },
};
