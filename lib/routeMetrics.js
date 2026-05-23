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
