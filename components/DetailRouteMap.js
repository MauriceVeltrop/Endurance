
import {
  routeMapMeta,
  routeMapTitle,
  routeMapWrap,
  routeSvg,
} from "../lib/enduranceStyles";

export default function DetailRouteMap({ points }) {
  if (!points || points.length < 2) return null;

  const width = 360;
  const height = 230;
  const padding = 24;

  const validPoints = points.filter(
    (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))
  );

  if (validPoints.length < 2) return null;

  const latValues = validPoints.map((p) => Number(p.lat));
  const lonValues = validPoints.map((p) => Number(p.lon));
  const eleValues = validPoints
    .map((p) => Number(p.ele || 0))
    .filter((v) => Number.isFinite(v));

  const minLat = Math.min(...latValues);
  const maxLat = Math.max(...latValues);
  const minLon = Math.min(...lonValues);
  const maxLon = Math.max(...lonValues);

  const latRange = maxLat - minLat || 1;
  const lonRange = maxLon - minLon || 1;

  const toXY = (point) => {
    const x =
      padding +
      ((Number(point.lon) - minLon) / lonRange) * (width - padding * 2);

    const y =
      height -
      padding -
      ((Number(point.lat) - minLat) / latRange) * (height - padding * 2);

    return { x, y };
  };

  const step = Math.max(1, Math.floor(validPoints.length / 800));

  const simplifiedPoints = validPoints.filter((_, index) => {
    return index % step === 0 || index === validPoints.length - 1;
  });

  const routePath = simplifiedPoints
    .map((point, index) => {
      const { x, y } = toXY(point);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const start = toXY(validPoints[0]);
  const finish = toXY(validPoints[validPoints.length - 1]);

  const minEle = eleValues.length ? Math.min(...eleValues) : null;
  const maxEle = eleValues.length ? Math.max(...eleValues) : null;

  return (
    <div style={routeMapWrap}>
      <div style={routeMapTitle}>Route map</div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={routeSvg}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          rx="18"
          fill="#101010"
        />

        {[0.25, 0.5, 0.75].map((line) => (
          <g key={line}>
            <line
              x1={padding}
              x2={width - padding}
              y1={padding + (height - padding * 2) * line}
              y2={padding + (height - padding * 2) * line}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />

            <line
              x1={padding + (width - padding * 2) * line}
              x2={padding + (width - padding * 2) * line}
              y1={padding}
              y2={height - padding}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          </g>
        ))}

        <path
          d={routePath}
          fill="none"
          stroke="rgba(228,239,22,0.18)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d={routePath}
          fill="none"
          stroke="#e4ef16"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle cx={start.x} cy={start.y} r="6" fill="#22c55e" />
        <circle cx={finish.x} cy={finish.y} r="6" fill="#ef4444" />

        <text x={start.x + 8} y={start.y - 8} fill="white" fontSize="10">
          Start
        </text>

        <text x={finish.x + 8} y={finish.y - 8} fill="white" fontSize="10">
          Finish
        </text>
      </svg>

      {minEle !== null && maxEle !== null && (
        <div style={routeMapMeta}>
          Elevation range: {Math.round(minEle)} m - {Math.round(maxEle)} m
        </div>
      )}
    </div>
  );
}
