import { normalizeRoutePoints } from "../routeMetrics";

export function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function routePointsToGpx(points, name = "Endurance Route") {
  const normalized = normalizeRoutePoints(points);
  const trackPoints = normalized
    .map((point) => {
      const ele = Number.isFinite(Number(point.ele)) ? `\n        <ele>${Number(point.ele).toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${Number(point.lat).toFixed(6)}" lon="${Number(point.lon).toFixed(6)}">${ele}\n      </trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Endurance" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata>\n    <name>${xmlEscape(name)}</name>\n    <time>${new Date().toISOString()}</time>\n  </metadata>\n  <trk>\n    <name>${xmlEscape(name)}</name>\n    <trkseg>\n${trackPoints}\n    </trkseg>\n  </trk>\n</gpx>`;
}

export function downloadTextFile({ filename, text, type = "application/gpx+xml" }) {
  if (typeof window === "undefined") return;

  const blob = new Blob([text], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 400);
}
