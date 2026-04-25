import {
  routeMapMeta,
  routeMapTitle,
  routeMapWrap,
  routeSvg,
} from "../lib/enduranceStyles";

export default function DetailRouteMap({ points }) {
  if (!points || points.length < 2) return null;

  const mapWidth = 360;
  const mapHeight = 230;
  const profileWidth = 360;
  const profileHeight = 76;
  const padding = 24;

  const validPoints = points.filter(
    (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))
  );

  if (validPoints.length < 2) return null;

  const latValues = validPoints.map((p) => Number(p.lat));
  const lonValues = validPoints.map((p) => Number(p.lon));
  const eleValues = validPoints
    .map((p) => Number(p.ele))
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
      ((Number(point.lon) - minLon) / lonRange) * (mapWidth - padding * 2);

    const y =
      mapHeight -
      padding -
      ((Number(point.lat) - minLat) / latRange) * (mapHeight - padding * 2);

    return { x, y };
  };

  const step = Math.max(1, Math.floor(validPoints.length / 900));

  const simplifiedPoints = validPoints.filter(
    (_, index) => index % step === 0 || index === validPoints.length - 1
  );

  const routePath = simplifiedPoints
    .map((point, index) => {
      const { x, y } = toXY(point);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const start = toXY(validPoints[0]);
  const finish = toXY(validPoints[validPoints.length - 1]);

  const hasElevation = eleValues.length >= 2;
  const minEle = hasElevation ? Math.min(...eleValues) : null;
  const maxEle = hasElevation ? Math.max(...eleValues) : null;
  const eleRange = hasElevation ? maxEle - minEle || 1 : 1;

  const elevationPoints = validPoints
    .filter((p) => Number.isFinite(Number(p.ele)))
    .filter((_, index) => index % step === 0 || index === validPoints.length - 1);

  const elevationPath =
    hasElevation &&
    elevationPoints
      .map((point, index) => {
        const x =
          padding +
          (index / Math.max(elevationPoints.length - 1, 1)) *
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
    ? `${elevationPath} L ${profileWidth - padding} ${profileHeight - 10} L ${padding} ${profileHeight - 10} Z`
    : "";

  return (
    <div style={routeMapWrap}>
      <div style={routeMapTitle}>Route map</div>

      <svg
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        style={routeSvg}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="routeBackground" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#161616" />
            <stop offset="100%" stopColor="#080808" />
          </linearGradient>

          <filter id="routeGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          x="0"
          y="0"
          width={mapWidth}
          height={mapHeight}
          rx="18"
          fill="url(#routeBackground)"
        />

        {[0.2, 0.4, 0.6, 0.8].map((line) => (
          <g key={line}>
            <line
              x1={padding}
              x2={mapWidth - padding}
              y1={padding + (mapHeight - padding * 2) * line}
              y2={padding + (mapHeight - padding * 2) * line}
              stroke="rgba(255,255,255,0.055)"
              strokeWidth="1"
            />

            <line
              x1={padding + (mapWidth - padding * 2) * line}
              x2={padding + (mapWidth - padding * 2) * line}
              y1={padding}
              y2={mapHeight - padding}
              stroke="rgba(255,255,255,0.055)"
              strokeWidth="1"
            />
          </g>
        ))}

        <path
          d={routePath}
          fill="none"
          stroke="rgba(228,239,22,0.16)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d={routePath}
          fill="none"
          stroke="#e4ef16"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#routeGlow)"
        />

        <circle cx={start.x} cy={start.y} r="7" fill="#22c55e" />
        <circle cx={start.x} cy={start.y} r="3" fill="#04140a" />

        <circle cx={finish.x} cy={finish.y} r="7" fill="#ef4444" />
        <circle cx={finish.x} cy={finish.y} r="3" fill="#1c0505" />

        <text x={start.x + 9} y={start.y - 9} fill="white" fontSize="10">
          Start
        </text>

        <text x={finish.x + 9} y={finish.y - 9} fill="white" fontSize="10">
          Finish
        </text>
      </svg>

      {hasElevation && (
        <div style={{ marginTop: 10 }}>
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
