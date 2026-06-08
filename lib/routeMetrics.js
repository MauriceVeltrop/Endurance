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
function median(values) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function interpolateElevationSeries(values) {
  const result = values.slice();

  for (let index = 0; index < result.length; index += 1) {
    if (Number.isFinite(result[index])) continue;

    let prevIndex = index - 1;
    while (prevIndex >= 0 && !Number.isFinite(result[prevIndex])) prevIndex -= 1;

    let nextIndex = index + 1;
    while (nextIndex < result.length && !Number.isFinite(result[nextIndex])) nextIndex += 1;

    const prev = prevIndex >= 0 ? result[prevIndex] : null;
    const next = nextIndex < result.length ? result[nextIndex] : null;

    if (Number.isFinite(prev) && Number.isFinite(next)) {
      const ratio = (index - prevIndex) / (nextIndex - prevIndex);
      result[index] = prev + ((next - prev) * ratio);
    } else if (Number.isFinite(prev)) {
      result[index] = prev;
    } else if (Number.isFinite(next)) {
      result[index] = next;
    }
  }

  return result;
}

export function cleanElevationSeries(routePoints) {
  const pts = normalizeRoutePoints(routePoints);
  const raw = pts.map((point) => (Number.isFinite(Number(point.ele)) ? Number(point.ele) : null));
  const nonZero = raw.filter((value) => Number.isFinite(value) && value !== 0);
  const medianElevation = median(nonZero);
  const cleaned = raw.slice();
  let zeroOutliers = 0;
  let spikeOutliers = 0;
  let interpolated = 0;

  for (let index = 0; index < cleaned.length; index += 1) {
    const value = cleaned[index];
    if (!Number.isFinite(value)) continue;

    const prev = index > 0 ? cleaned[index - 1] : null;
    const next = index < cleaned.length - 1 ? cleaned[index + 1] : null;

    const zeroBetweenNormalPoints =
      value === 0 &&
      ((Number.isFinite(prev) && prev > 10) || (Number.isFinite(next) && next > 10) || (Number.isFinite(medianElevation) && medianElevation > 10));

    if (zeroBetweenNormalPoints) {
      cleaned[index] = null;
      zeroOutliers += 1;
      continue;
    }

    if (!Number.isFinite(prev) || !Number.isFinite(next)) continue;

    const spikeThreshold = Math.max(10, Math.abs(prev - next) + 8);
    const looksLikeSinglePointSpike =
      Math.abs(value - prev) > spikeThreshold &&
      Math.abs(value - next) > spikeThreshold &&
      Math.abs(prev - next) < 10;

    if (looksLikeSinglePointSpike) {
      cleaned[index] = null;
      spikeOutliers += 1;
    }
  }

  const interpolatedSeries = interpolateElevationSeries(cleaned).map((value, index) => {
    if (!Number.isFinite(cleaned[index]) && Number.isFinite(value)) interpolated += 1;
    return value;
  });

  const smoothed = interpolatedSeries.map((value, index) => {
    if (!Number.isFinite(value)) return null;
    const window = [];
    for (let offset = -2; offset <= 2; offset += 1) {
      const candidate = interpolatedSeries[index + offset];
      if (Number.isFinite(candidate)) window.push(candidate);
    }
    return median(window) ?? value;
  });

  return {
    raw,
    cleaned: interpolatedSeries,
    zero_outliers_removed: zeroOutliers,
    spike_outliers_removed: spikeOutliers,
    interpolated_points: interpolated,
  };
}

export function calculateRouteMetrics(routePoints){
  const pts=normalizeRoutePoints(routePoints);
  let distanceMeters=0,gain=0,loss=0,max=null;
  if(pts.length<2)return{distance_km:"",elevation_gain_m:"",elevation_loss_m:"",max_elevation_m:"",point_count:pts.length,elevation_quality:null};

  const elevation=cleanElevationSeries(pts);
  const values=elevation.cleaned;
  const minElevationStep=0.5;

  for(let i=0;i<pts.length;i++){
    const e=values[i];
    if(Number.isFinite(e))max=max===null?e:Math.max(max,e);

    if(i>0){
      const horizontal=haversineMeters(pts[i-1],pts[i]);
      distanceMeters+=horizontal;

      const previous=values[i-1];
      const current=values[i];

      if(Number.isFinite(previous)&&Number.isFinite(current)){
        const diff=current-previous;

        // Ignore impossible elevation jumps but keep normal short climbs.
        // ORS elevation is already model-based; heavy smoothing/pending-climb filters undercounted real climbs.
        const maxPlausibleStep=Math.max(8,horizontal*0.45);
        if(Math.abs(diff)>maxPlausibleStep)continue;

        if(diff>minElevationStep)gain+=diff;
        if(diff<-minElevationStep)loss+=Math.abs(diff);
      }
    }
  }

  return{
    distance_km:Number((distanceMeters/1000).toFixed(2)),
    elevation_gain_m:Math.round(gain),
    elevation_loss_m:Math.round(loss),
    max_elevation_m:max===null?"":Math.round(max),
    point_count:pts.length,
    elevation_quality:{
      corrected:elevation.zero_outliers_removed>0||elevation.spike_outliers_removed>0,
      zero_outliers_removed:elevation.zero_outliers_removed,
      spike_outliers_removed:elevation.spike_outliers_removed,
      interpolated_points:elevation.interpolated_points,
      method:"cleaned_distance_based_elevation_threshold_0_5m"
    }
  };
}

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
