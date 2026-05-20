// app/api/routes/reroute/route.js
import { NextResponse } from "next/server";
export const runtime = "nodejs";
const ORS_BASE = "https://api.openrouteservice.org/v2/directions";
const PROFILE_MAP = { running:"foot-walking", trail_running:"foot-hiking", walking:"foot-walking", hiking:"foot-hiking", road_cycling:"cycling-road", cycling:"cycling-regular", gravel_cycling:"cycling-regular", mountain_biking:"cycling-mountain", mtb:"cycling-mountain" };
function profileForSport(s){return PROFILE_MAP[String(s||"").toLowerCase()]||"foot-walking";}
function normalize(points){return (Array.isArray(points)?points:[]).map(p=>({lat:Number(p.lat??p.latitude),lon:Number(p.lon??p.lng??p.longitude)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));}
function toPoints(coords){return (coords||[]).map(c=>({lon:Number(c[0]),lat:Number(c[1]),ele:Number.isFinite(Number(c[2]))?Number(c[2]):null})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));}
export async function POST(request){
  try{
    const apiKey=process.env.OPENROUTE_API_KEY||process.env.ORS_API_KEY||process.env.NEXT_PUBLIC_OPENROUTE_API_KEY;
    if(!apiKey) return NextResponse.json({error:"Missing OPENROUTE_API_KEY or ORS_API_KEY environment variable."},{status:500});
    const body=await request.json(); const waypoints=normalize(body?.points); const profile=body?.profile||profileForSport(body?.sport_id);
    if(waypoints.length<2) return NextResponse.json({error:"At least two route points are required."},{status:400});
    const res=await fetch(`${ORS_BASE}/${profile}/geojson`,{method:"POST",headers:{Authorization:apiKey,"Content-Type":"application/json",Accept:"application/json, application/geo+json"},body:JSON.stringify({coordinates:waypoints.map(p=>[p.lon,p.lat]),elevation:true,instructions:false,preference:"recommended",geometry_simplify:false,format:"geojson"})});
    if(!res.ok){const text=await res.text(); return NextResponse.json({error:`OpenRouteService failed (${res.status}): ${text}`},{status:res.status});}
    const data=await res.json(); const feature=data?.features?.[0]; const coords=feature?.geometry?.coordinates||[]; const summary=feature?.properties?.summary||{};
    if(!coords.length) return NextResponse.json({error:"No routed geometry returned."},{status:502});
    return NextResponse.json({ok:true,profile,route_points:{source:"openrouteservice",profile,waypoints,points:toPoints(coords),point_count:coords.length,routed_at:new Date().toISOString()},distance_km:summary.distance?Number((summary.distance/1000).toFixed(2)):null,duration_min:summary.duration?Math.round(summary.duration/60):null,elevation_gain_m:Number.isFinite(Number(feature?.properties?.ascent))?Math.round(Number(feature.properties.ascent)):null,elevation_loss_m:Number.isFinite(Number(feature?.properties?.descent))?Math.round(Number(feature.properties.descent)):null});
  }catch(e){return NextResponse.json({error:e?.message||"Could not reroute."},{status:500});}
}
