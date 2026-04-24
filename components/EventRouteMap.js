"use client";

export default function EventRouteMap({ points }) {
  if (!points || points.length < 2) return null;

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const width = 320;
  const height = 180;
  const padding = 18;

  const latRange = maxLat - minLat || 1;
  const lonRange = maxLon - minLon || 1;

  const path = points
    .map((p, index) => {
      const x =
        padding +
        ((p.lon - minLon) / lonRange) * (width - padding * 2);

      const y =
        height -
        padding -
        ((p.lat - minLat) / latRange) * (height - padding * 2);

      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div style={wrap}>
      <div style={title}>Route</div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={svg}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          rx="18"
          fill="#151515"
        />

        <path
          d={path}
          fill="none"
          stroke="#e4ef16"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          cx={
            padding +
            ((points[0].lon - minLon) / lonRange) *
              (width - padding * 2)
          }
          cy={
            height -
            padding -
            ((points[0].lat - minLat) / latRange) *
              (height - padding * 2)
          }
          r="5"
          fill="#22c55e"
        />

        <circle
          cx={
            padding +
            ((points[points.length - 1].lon - minLon) / lonRange) *
              (width - padding * 2)
          }
          cy={
            height -
            padding -
            ((points[points.length - 1].lat - minLat) / latRange) *
              (height - padding * 2)
          }
          r="5"
          fill="#ef4444"
        />
      </svg>
    </div>
  );
}

const wrap = {
  marginTop: 14,
  marginBottom: 14,
};

const title = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 8,
};

const svg = {
  width: "100%",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "#151515",
};
