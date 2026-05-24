// lib/routeMetrics.js
export function normalizeRoutePoints(routePoints) {
  const raw = Array.isArray(routePoints) ? routePoints : Array.isArray(routePoints?.points) ? routePoints.points : [];

  return raw
    .map((p) => {
      if (Array.isArray(p)) {
        return {
          lat: Number(p[0]),
          lon: Number(p[1]),
          ele: p.length > 2 ? p[2] : null,
        };
      }

      return {
        lat: Number(p.lat ?? p.latitude),
        lon: Number(p.lon ?? p.lng ?? p.longitude),
        ele: p.ele ?? null,
      };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export function haversineMeters(a,b){const R=6371000,dLat=rad(Number(b.lat)-Number(a.lat)),dLon=rad(Number(b.lon)-Number(a.lon)),lat1=rad(Number(a.lat)),lat2=rad(Number(b.lat));const x=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
export function calculateRouteMetrics(routePoints){const pts=normalizeRoutePoints(routePoints);let d=0,gain=0,loss=0,max=null;if(pts.length<2)return{distance_km:"",elevation_gain_m:"",elevation_loss_m:"",max_elevation_m:"",point_count:pts.length};for(let i=0;i<pts.length;i++){const e=Number(pts[i].ele);if(Number.isFinite(e))max=max===null?e:Math.max(max,e);if(i>0){d+=haversineMeters(pts[i-1],pts[i]);const a=Number(pts[i-1].ele),b=Number(pts[i].ele);if(Number.isFinite(a)&&Number.isFinite(b)){const diff=b-a;if(diff>1)gain+=diff;if(diff<-1)loss+=Math.abs(diff);}}}return{distance_km:Number((d/1000).toFixed(2)),elevation_gain_m:Math.round(gain),elevation_loss_m:Math.round(loss),max_elevation_m:max===null?"":Math.round(max),point_count:pts.length};}
export function estimateTimeText(distanceKm,sportId){const d=Number(distanceKm||0),s=String(sportId||"");if(!d)return"—";let kmh=9.5;if(s.includes('road_cycling'))kmh=26;else if(s.includes('gravel'))kmh=20;else if(s.includes('mountain')||s.includes('mtb'))kmh=13;else if(s.includes('walking'))kmh=5.2;else if(s.includes('trail'))kmh=8.2;const m=Math.max(1,Math.round((d/kmh)*60));const h=Math.floor(m/60),mm=m%60;return h?`${h}:${String(mm).padStart(2,'0')} h`:`${mm} min`;}
function rad(v){return v*Math.PI/180;}


function pointDistanceToSegmentMeters(point, start, end) {
  const metersPerDegreeLat = 111320;
  const avgLat = rad((Number(start.lat) + Number(end.lat)) / 2);
  const metersPerDegreeLon = Math.cos(avgLat) * 111320;

  const px = (Number(point.lon) - Number(start.lon)) * metersPerDegreeLon;
  const py = (Number(point.lat) - Number(start.lat)) * metersPerDegreeLat;
  const ex = (Number(end.lon) - Number(start.lon)) * metersPerDegreeLon;
  const ey = (Number(end.lat) - Number(start.lat)) * metersPerDegreeLat;

  const lenSq = ex * ex + ey * ey;
  if (!lenSq) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * ex + py * ey) / lenSq));
  return Math.hypot(px - t * ex, py - t * ey);
}

function douglasPeucker(points, toleranceMeters) {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = pointDistanceToSegmentMeters(points[i], points[0], points[points.length - 1]);

    if (distance > maxDistance) {
      index = i;
      maxDistance = distance;
    }
  }

  if (maxDistance > toleranceMeters) {
    const left = douglasPeucker(points.slice(0, index + 1), toleranceMeters);
    const right = douglasPeucker(points.slice(index), toleranceMeters);
    return left.slice(0, -1).concat(right);
  }

  return [points[0], points[points.length - 1]];
}

export function simplifyRoutePoints(routePoints, toleranceMeters = 5) {
  const points = normalizeRoutePoints(routePoints);

  if (points.length <= 2) return points;

  const simplified = douglasPeucker(points, Math.max(0.5, Number(toleranceMeters) || 5));
  const first = points[0];
  const last = points[points.length - 1];

  if (simplified[0] !== first) simplified.unshift(first);
  if (simplified[simplified.length - 1] !== last) simplified.push(last);

  return simplified.map((point) => ({
    lat: Number(Number(point.lat).toFixed(6)),
    lon: Number(Number(point.lon).toFixed(6)),
    ele: Number.isFinite(Number(point.ele)) ? Number(Number(point.ele).toFixed(1)) : null,
  }));
}
