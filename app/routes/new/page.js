// app/routes/new/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import BottomNav from "../../../components/BottomNav";
import OSMRouteMap from "../../../components/OSMRouteMap";
import RouteDrawMap from "../../../components/routes/RouteDrawMap";
import { supabase } from "../../../lib/supabase";
import { getSportLabel } from "../../../lib/trainingHelpers";
import { parseGpxText, formatRoutePointSummary } from "../../../lib/gpxUtils";
import { calculateRouteMetrics, estimateTimeText } from "../../../lib/routeMetrics";

const FALLBACK_ROUTE_SPORTS = [
  "running",
  "trail_running",
  "road_cycling",
  "gravel_cycling",
  "mountain_biking",
  "walking",
  "kayaking",
];

const METHOD_ORDER = ["draw", "wizard", "upload"];

const METHOD_DETAILS = {
  draw: {
    title: "Draw Route",
    eyebrow: "Manual",
    icon: "✏️",
    action: "Open fullscreen editor",
    body: "Build the route yourself on the map. The line follows roads and paths automatically.",
  },
  wizard: {
    title: "Route Wizard",
    eyebrow: "Smart",
    icon: "✨",
    action: "Set up route idea",
    body: "Let Endurance create a sport-specific route based on distance, start point and terrain.",
  },
  upload: {
    title: "Upload GPX",
    eyebrow: "Import",
    icon: "⬆️",
    action: "Choose GPX file",
    body: "Import an existing route from Garmin, Komoot, Strava, RouteYou or another planner.",
  },
};

const METHOD_COPY_BY_SPORT = {
  running: {
    draw: "Draw a paved running route yourself and let the app snap it to logical roads and paths.",
    wizard: "Generate a paved running loop with quiet streets, parks and fluent running lines.",
    upload: "Import a road-running GPX from Garmin, Strava, Komoot or another planner.",
  },
  trail_running: {
    draw: "Shape your own trail route over forest paths, tracks and technical sections.",
    wizard: "Generate a trail-focused loop with forest paths, unpaved surfaces and elevation.",
    upload: "Import a trail GPX with known paths, climbs and terrain from another platform.",
  },
  road_cycling: {
    draw: "Draw a road cycling route over asphalt and logical cycling roads.",
    wizard: "Generate a fast road loop that prefers safe asphalt and cycling infrastructure.",
    upload: "Import a road cycling GPX from Garmin, Strava, Komoot or RideWithGPS.",
  },
  gravel_cycling: {
    draw: "Draw a gravel route and refine the line around roads, tracks and forest roads.",
    wizard: "Generate a gravel loop with compacted paths, gravel surfaces and quiet links.",
    upload: "Import a gravel GPX with known surfaces and sectors.",
  },
  mountain_biking: {
    draw: "Draw an MTB route manually and keep control over technical sections.",
    wizard: "Generate an MTB-focused route using trail logic and technical terrain signals.",
    upload: "Import an MTB GPX with singletracks, climbs and known trail sections.",
  },
  walking: {
    draw: "Draw a walking route through safe paths, nature and comfortable links.",
    wizard: "Generate a walking loop focused on comfort, nature and low-traffic paths.",
    upload: "Import a walking or hiking GPX from an existing route source.",
  },
  kayaking: {
    draw: "Sketch a water route manually and save it as a kayaking route.",
    wizard: "Later: generate water-specific routes from suitable launch points and waterways.",
    upload: "Import an existing kayaking GPX from a known route or activity.",
  },
};

function methodCopyFor(methodId, sportId) {
  return METHOD_COPY_BY_SPORT[sportId]?.[methodId] || METHOD_DETAILS[methodId]?.body || "Choose this route method.";
}

function recommendedMethodFor(sportId) {
  if (["running", "road_cycling", "walking"].includes(sportId)) return "draw";
  if (["trail_running", "gravel_cycling", "mountain_biking"].includes(sportId)) return "upload";
  return "draw";
}

const SPORT_ROUTE_PROFILES = {
  running: {
    title: "Road running profile",
    focus: "Paved, safe and fluent.",
    best: "Best with GPX upload or draw mode. Wizard will prefer quiet streets, parks and paved footpaths.",
    avoid: "Avoids traffic-heavy roads and awkward stop-start routes.",
  },
  trail_running: {
    title: "Trail running profile",
    focus: "Unpaved, forest paths and elevation.",
    best: "Best with GPX upload now. Wizard will later prioritize OSM path/track/surface/sac_scale tags.",
    avoid: "Avoids too much asphalt and overly technical hiking-only terrain.",
  },
  road_cycling: {
    title: "Road cycling profile",
    focus: "Fast asphalt and safe cycling roads.",
    best: "Best with GPX upload or draw mode. Wizard will later prefer cycling infrastructure and quiet roads.",
    avoid: "Avoids unpaved tracks and footpaths.",
  },
  gravel_cycling: {
    title: "Gravel profile",
    focus: "Gravel, compacted surfaces and forest roads.",
    best: "Best with GPX upload now. Wizard will later use surface=gravel/compacted/fine_gravel.",
    avoid: "Avoids technical MTB-only trails and busy roads.",
  },
  mountain_biking: {
    title: "MTB profile",
    focus: "Technical trails and MTB networks.",
    best: "Best with GPX upload now. Wizard will later use mtb:scale, singletrack and official networks.",
    avoid: "Avoids boring road-only routes.",
  },
  walking: {
    title: "Walking / hiking profile",
    focus: "Comfortable paths, nature and safety.",
    best: "Best with GPX upload or draw mode. Wizard will later prefer hiking paths and natural areas.",
    avoid: "Avoids fast roads and unpleasant walking environments.",
  },
  kayaking: {
    title: "Kayaking profile",
    focus: "Water-based routes.",
    best: "Use GPX upload for now. Wizard will later require waterway-specific routing data.",
    avoid: "Avoids standard road routing.",
  },
};

function initialForm() {
  return {
    sport_id: "",
    method: "",
    title: "",
    description: "",
    visibility: "team",
    distance_km: "",
    elevation_gain_m: "",
    gpx_file_url: "",
    route_points: null,
  };
}


function sportIconFor(sportId) {
  const map = {
    running: "/training-images/running.svg",
    trail_running: "/training-images/trail-running.svg",
    road_cycling: "/training-images/road-cycling.svg",
    gravel_cycling: "/training-images/gravel-cycling.svg",
    mountain_biking: "/training-images/mountain-biking.svg",
    walking: "/training-images/walking.svg",
    kayaking: "/training-images/kayaking.svg",
    swimming: "/training-images/swimming.svg",
  };

  return map[sportId] || "/training-images/training.svg";
}

function routeProfileFor(sportId) {
  return (
    SPORT_ROUTE_PROFILES[sportId] || {
      title: `${getSportLabel(sportId)} route profile`,
      focus: "Sport-specific route creation.",
      best: "Choose the best route method for this sport.",
      avoid: "Generic routing without sport logic.",
    }
  );
}

function normalizeRoutePoints(routePoints) {
  if (!routePoints) return [];
  if (Array.isArray(routePoints)) return routePoints;
  if (Array.isArray(routePoints.points)) return routePoints.points;
  return [];
}


function routeMetricsFromPoints(points) {
  return calculateRouteMetrics(points);
}

function makeRoutePointPayload(points, source = "draw") {
  const normalized = normalizeRoutePoints(points);
  const metrics = calculateRouteMetrics(normalized);
  return { points: normalized, point_count: normalized.length, distance_km: metrics.distance_km || null, elevation_gain_m: metrics.elevation_gain_m || 0, elevation_loss_m: metrics.elevation_loss_m || 0, max_elevation_m: metrics.max_elevation_m || null, drawn_at: new Date().toISOString(), source };
}

function buildEditableRouteDraft(form, profileId) {
  const routePoints = form?.route_points || null;
  const points = normalizeRoutePoints(routePoints);
  const waypoints = normalizeRoutePoints(routePoints?.waypoints).length >= 2
    ? normalizeRoutePoints(routePoints?.waypoints)
    : points.length >= 2
      ? [points[0], points[points.length - 1]]
      : points;
  const metrics = calculateRouteMetrics(points);

  return {
    sport_id: form?.sport_id || "",
    title: form?.title || "",
    description: form?.description || "",
    method: "draw",
    distance_km: form?.distance_km || metrics.distance_km || "",
    elevation_gain_m: form?.elevation_gain_m || metrics.elevation_gain_m || "",
    route_points: {
      ...(routePoints && typeof routePoints === "object" && !Array.isArray(routePoints) ? routePoints : {}),
      source: routePoints?.source || "draw-edit",
      points,
      waypoints,
      point_count: points.length,
      waypoint_count: waypoints.length,
      distance_km: form?.distance_km || routePoints?.distance_km || metrics.distance_km || null,
      elevation_gain_m: form?.elevation_gain_m || routePoints?.elevation_gain_m || metrics.elevation_gain_m || 0,
      edited_at: new Date().toISOString(),
    },
    created_by: profileId || null,
    saved_at: new Date().toISOString(),
  };
}

function pickPlaceNameFromLabel(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(netherlands|nederland)$/i.test(part));

  const postalCodeIndex = parts.findIndex((part) => /\b\d{4}\s?[A-Z]{2}\b/i.test(part));

  if (postalCodeIndex >= 0 && parts[postalCodeIndex + 1]) {
    return parts[postalCodeIndex + 1];
  }

  const likelyPlace = parts.find((part) => !/^(street|road|route|unnamed|current location|startlocatie)$/i.test(part) && !/\d/.test(part));

  return likelyPlace || parts[0] || "";
}

function cleanRouteLocationName(value) {
  const place = pickPlaceNameFromLabel(value);

  if (!place || /^(locatie bepalen|startlocatie|current location)$/i.test(place)) {
    return "";
  }

  return place;
}

function formatRouteDistanceLabel(value) {
  const distance = Number(value);

  if (!Number.isFinite(distance) || distance <= 0) return "0.0 km";

  return `${distance.toFixed(1)} km`;
}

function buildAutomaticRouteTitle({ startLocation, distanceKm, sportId }) {
  const location = cleanRouteLocationName(startLocation) || "Locatie bepalen";

  return `${location} - ${formatRouteDistanceLabel(distanceKm)} - ${getSportLabel(sportId || "running")}`;
}

export default function NewRoutePage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [availableSports, setAvailableSports] = useState([]);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [previewMapReady, setPreviewMapReady] = useState(false);
  const [form, setForm] = useState(initialForm());
  const [drawInsertMode, setDrawInsertMode] = useState(false);
  const [drawLayer, setDrawLayer] = useState("light");
  const [autoReroute, setAutoReroute] = useState(false);
  const [routingStatus, setRoutingStatus] = useState("idle");
  const [routingError, setRoutingError] = useState("");
  const [routedPayload, setRoutedPayload] = useState(null);

  const selectedSport = useMemo(
    () => availableSports.find((sport) => sport.id === form.sport_id) || null,
    [availableSports, form.sport_id]
  );

  const selectedProfile = routeProfileFor(form.sport_id);
  const routePoints = normalizeRoutePoints(form.route_points);
  const canSave =
    Boolean(profile?.id) &&
    Boolean(form.sport_id) &&
    Boolean(form.method) &&
    Boolean(form.title.trim()) &&
    routePoints.length >= 2;

  const isOpenRouteConfigMessage = /OPENROUTE|ORS_API|OpenRouteService/i.test(message || "");
  const visibleMessage = message && (!isOpenRouteConfigMessage || form.method === "wizard");

  useEffect(() => {
    loadAccess();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSport = params.get("sport");
    const requestedMethod = params.get("method");

    if (requestedSport && requestedMethod === "draw") {
      const drawParams = new URLSearchParams({
        sport_id: requestedSport,
      });

      const returnTo = params.get("returnTo");
      const step = params.get("step");
      if (returnTo) drawParams.set("returnTo", returnTo);
      if (step) drawParams.set("step", step);

      router.replace(`/routes/draw?${drawParams.toString()}`);
      return;
    }

    if (requestedSport) {
      setForm((current) => ({
        ...current,
        sport_id: requestedSport,
        title: current.title || `${getSportLabel(requestedSport)} Route`,
      }));
      setCurrentStep(requestedMethod ? 3 : 2);
    }

    if (requestedMethod) {
      setForm((current) => ({
        ...current,
        method: requestedMethod,
      }));
      setCurrentStep(requestedSport ? 3 : 2);
    }
  }, [router]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setPreviewMapReady(true), 450);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const shouldLoadDraft = params.get("routeDraft") === "1";

    if (!shouldLoadDraft) return;

    const rawDraft = window.sessionStorage.getItem("endurance_route_draft");

    if (!rawDraft) {
      window.history.replaceState({}, "", "/routes/new");
      return;
    }

    try {
      const draft = JSON.parse(rawDraft);

      const rawRoutePoints = draft?.route_points;
      const safePoints = Array.isArray(rawRoutePoints)
        ? rawRoutePoints
        : Array.isArray(rawRoutePoints?.points)
          ? rawRoutePoints.points
          : [];

      const safePayload = {
        source: rawRoutePoints?.source || "draw-fullscreen",
        profile: rawRoutePoints?.profile || null,
        provider_url: rawRoutePoints?.provider_url || null,
        waypoints: Array.isArray(rawRoutePoints?.waypoints) ? rawRoutePoints.waypoints : [],
        points: safePoints,
        point_count: safePoints.length,
        routed_at: rawRoutePoints?.routed_at || rawRoutePoints?.drawn_at || new Date().toISOString(),
      };

      if (!safePoints.length) {
        throw new Error("Route draft has no valid route points.");
      }

      setForm((current) => ({
        ...current,
        sport_id: draft.sport_id || current.sport_id,
        method: "draw",
        title: draft.title || current.title || `${getSportLabel(draft.sport_id)} Route`,
        description: draft.description || current.description,
        distance_km: draft.distance_km ? String(draft.distance_km) : current.distance_km,
        elevation_gain_m: draft.elevation_gain_m ? String(draft.elevation_gain_m) : current.elevation_gain_m,
        route_points: safePayload,
      }));

      setRoutedPayload(safePayload);
      setCurrentStep(3);
      setMessage("Drawn route loaded. Review the details and save your route.");
      window.sessionStorage.removeItem("endurance_route_draft");
      const keepParams = new URLSearchParams();
      const returnTo = params.get("returnTo");
      const step = params.get("step");
      if (returnTo) keepParams.set("returnTo", returnTo);
      if (step) keepParams.set("step", step);
      window.history.replaceState({}, "", `/routes/new${keepParams.toString() ? `?${keepParams.toString()}` : ""}`);
    } catch (error) {
      console.error("Could not safely load route draft", error);
      window.sessionStorage.removeItem("endurance_route_draft");
      window.history.replaceState({}, "", "/routes/new");
      setMessage("Could not load the drawn route. Please draw the route again.");
    }
  }, []);


  async function loadAccess() {
    setChecking(true);
    setMessage("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      if (profileRow?.blocked) {
        setMessage("Your account is blocked. Contact an administrator.");
        return;
      }

      setProfile(profileRow);

      const [{ data: preferredRows, error: preferredError }, { data: sportRows, error: sportError }] =
        await Promise.all([
          supabase.from("user_sports").select("sport_id").eq("user_id", user.id),
          supabase
            .from("sports")
            .select("id,name,category,supports_routes,supports_weather,supports_pace,supports_speed,sort_order")
            .eq("supports_routes", true)
            .order("sort_order", { ascending: true }),
        ]);

      if (preferredError) throw preferredError;
      if (sportError) throw sportError;

      const preferredIds = (preferredRows || []).map((row) => row.sport_id).filter(Boolean);
      const routeSports = (sportRows || []).filter(
        (sport) => preferredIds.includes(sport.id) || FALLBACK_ROUTE_SPORTS.includes(sport.id)
      );

      const allowed = routeSports.filter((sport) => preferredIds.includes(sport.id));

      setAvailableSports(allowed);

      if (allowed.length) {
        const params = new URLSearchParams(window.location.search);
        const requestedSport = params.get("sport");
        const requestedMethod = params.get("method");
        const requestedAllowedSport = allowed.find((sport) => sport.id === requestedSport);
        const first = requestedAllowedSport || allowed[0];

        setForm((current) => ({
          ...current,
          sport_id: current.sport_id || first.id,
          title: current.title || `${getSportLabel(current.sport_id || first.id)} Route`,
        }));

        if (requestedAllowedSport) {
          setCurrentStep(requestedMethod ? 3 : 2);
        }
      }
    } catch (error) {
      console.error("Create route access error", error);
      setMessage(error?.message || "Could not load route creator.");
    } finally {
      setChecking(false);
    }
  }

  function updateForm(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "sport_id") {
        next.title = `${getSportLabel(value)} Route`;
        next.method = "";
        next.description = "";
        next.distance_km = "";
        next.elevation_gain_m = "";
        next.gpx_file_url = "";
        next.route_points = null;
      }

      if (key === "method") {
        next.route_points = current.route_points;
      }

      return next;
    });
  }

  async function handleGpxUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage("");

    try {
      const text = await file.text();
      const parsed = parseGpxText(text);

      setForm((current) => ({
        ...current,
        method: "upload",
        title: current.title?.trim() ? current.title : file.name.replace(/\.gpx$/i, ""),
        distance_km: parsed.distance_km ? String(parsed.distance_km) : current.distance_km,
        elevation_gain_m: parsed.elevation_gain_m ? String(parsed.elevation_gain_m) : current.elevation_gain_m,
        route_points: parsed,
      }));

      setMessage(`GPX imported: ${formatRoutePointSummary(parsed)}.`);
    } catch (error) {
      console.error("GPX upload error", error);
      setMessage(error?.message || "Could not import GPX.");
    }
  }


  function handleDrawPointsChange(points) {
    const metrics = routeMetricsFromPoints(points);
    const payload = makeRoutePointPayload(points, "draw");
    setRoutedPayload(null);
    setRoutingError("");
    setForm((current) => ({ ...current, method: "draw", route_points: payload, distance_km: metrics.distance_km ? String(metrics.distance_km) : current.distance_km, elevation_gain_m: metrics.elevation_gain_m ? String(metrics.elevation_gain_m) : current.elevation_gain_m }));
  }

  function undoDrawPoint() {
    const currentPoints = normalizeRoutePoints(form.route_points);
    handleDrawPointsChange(currentPoints.slice(0, -1));
  }

  function clearDrawPoints() {
    setForm((current) => ({
      ...current,
      route_points: null,
      distance_km: "",
      elevation_gain_m: "",
    }));
  }

  function closeDrawLoop() {
    const currentPoints = normalizeRoutePoints(form.route_points);

    if (currentPoints.length < 3) {
      setMessage("Add at least three points before closing the loop.");
      return;
    }

    const first = currentPoints[0];
    const last = currentPoints[currentPoints.length - 1];

    if (first.lat === last.lat && first.lon === last.lon) {
      setMessage("This route is already closed.");
      return;
    }

    handleDrawPointsChange([...currentPoints, { ...first }]);
  }

  function useCurrentLocationAsDrawStart() {
    if (!navigator.geolocation) {
      setMessage("Geolocation is not available on this device.");
      return;
    }

    setMessage("Getting your current location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          lat: Number(position.coords.latitude.toFixed(6)),
          lon: Number(position.coords.longitude.toFixed(6)),
          ele: null,
        };

        const currentPoints = normalizeRoutePoints(form.route_points);
        handleDrawPointsChange(currentPoints.length ? [point, ...currentPoints] : [point]);
        setMessage("Current location added as start point.");
      },
      () => {
        setMessage("Could not access current location. Check browser permission.");
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  }

  function removeDrawPoint(indexToRemove) {
    const currentPoints = normalizeRoutePoints(form.route_points);
    handleDrawPointsChange(currentPoints.filter((_, index) => index !== indexToRemove));
  }


  async function rerouteDrawnRoute() {
    const waypoints = normalizeRoutePoints(form.route_points);
    if (waypoints.length < 2) { setMessage("Add at least two points before rerouting."); return null; }
    setRoutingStatus("routing"); setRoutingError("");
    try {
      const response = await fetch("/api/routes/reroute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sport_id: form.sport_id, points: waypoints }) });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Could not reroute.");
      setRoutedPayload(data.route_points);
      setForm((current) => ({ ...current, route_points: { ...data.route_points, waypoints }, distance_km: data.distance_km ? String(data.distance_km) : current.distance_km, elevation_gain_m: data.elevation_gain_m ? String(data.elevation_gain_m) : current.elevation_gain_m }));
      setRoutingStatus("done"); setMessage(`Route snapped to roads/paths using ${data.profile}.`); return data;
    } catch (error) {
      console.error("Reroute failed", error); setRoutingStatus("error"); setRoutingError(error?.message || "Reroute failed. Straight line route remains available."); setMessage(error?.message || "Reroute failed. Straight line route remains available."); return null;
    }
  }



  async function saveRoute() {
    if (!canSave) {
      setMessage("Complete the route details before saving.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const payload = {
        creator_id: profile.id,
        sport_id: form.sport_id,
        title: form.title.trim(),
        description: form.description || "",
        visibility: form.visibility || "team",
        distance_km: form.distance_km ? Number(form.distance_km) : null,
        elevation_gain_m: form.elevation_gain_m ? Math.round(Number(form.elevation_gain_m)) : null,
        gpx_file_url: form.gpx_file_url || null,
        route_points: form.route_points || null,
      };

      const { data, error } = await supabase
        .from("routes")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      try {
        window.sessionStorage.removeItem("endurance_route_draft");
        window.sessionStorage.removeItem("endurance_route_edit_draft");
        window.localStorage.removeItem("endurance_route_draft");
      } catch (_) {
        // Ignore browser storage cleanup failures.
      }

      const queryParams = new URLSearchParams(window.location.search);
      const returnTo = queryParams.get("returnTo");

      if (returnTo && data?.id) {
        const params = new URLSearchParams({
          route_id: data.id,
          step: queryParams.get("step") || "route",
        });

        router.push(`${returnTo}?${params.toString()}`);
      } else {
        router.push(data?.id ? `/routes/${data.id}` : "/routes");
      }
    } catch (error) {
      console.error("Save route error", error);
      setMessage(error?.message || "Could not save route.");
    } finally {
      setSaving(false);
    }
  }


  useEffect(() => {
    if (!autoReroute || form.method !== "draw") return;

    const points = normalizeRoutePoints(form.route_points);
    if (points.length < 2) return;

    const timeout = window.setTimeout(() => {
      rerouteDrawnRoute();
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [autoReroute, form.method, form.route_points?.point_count]);

  return (
    <main className="endurance-page create-route-v2-page route-step-page">
      <AppHeader active="routes" />

      <section className="endurance-shell training-hero endurance-card create-route-v2-hero route-step-hero">
        <div>
          <p className="eyebrow">Create route</p>
          <h1>
            Build a route
            <br />
            for your sport<span>.</span>
          </h1>
          <p>
            Choose a preferred sport first, then choose how you want to create the route.
          </p>
        </div>
      </section>

      <section className="endurance-shell route-stepper">
        {[1, 2, 3].map((step) => (
          <button
            key={step}
            type="button"
            className={currentStep === step ? "active" : ""}
            onClick={() => {
              if (step === 1) setCurrentStep(1);
              if (step === 2 && form.sport_id) setCurrentStep(2);
              if (step === 3 && form.method) setCurrentStep(3);
            }}
          >
            <span>{step}</span>
            {step === 1 ? "Sport" : step === 2 ? "Method" : "Details"}
          </button>
        ))}
      </section>

      {visibleMessage ? <section className="endurance-shell create-route-v2-message">{visibleMessage}</section> : null}

      {checking ? (
        <section className="endurance-shell endurance-card notification-empty">Loading route creator...</section>
      ) : null}

      {!checking && !availableSports.length ? (
        <section className="endurance-shell endurance-card notification-empty">
          <h2>No route sports available</h2>
          <p>Add a route-relevant sport to your preferred sports first.</p>
          <Link href="/onboarding" className="primary-action">Update preferred sports</Link>
        </section>
      ) : null}

      {!checking && availableSports.length ? (
        <>
          {currentStep === 1 ? (
            <section className="endurance-shell create-route-v2-section route-step-section">
              <div className="route-builder-step compact">
                <span>1</span>
                <div>
                  <p className="eyebrow">Sport first</p>
                  <h2>Choose route sport</h2>
                </div>
              </div>

              <div className="create-route-sport-grid compact sport-button-list">
                {availableSports.map((sport) => (
                  <button
                    key={sport.id}
                    type="button"
                    className={form.sport_id === sport.id ? "route-sport-button active" : "route-sport-button"}
                    onClick={() => {
                      updateForm("sport_id", sport.id);
                      setCurrentStep(2);
                    }}
                  >
                    <span className="route-sport-icon" aria-hidden="true">
                      <img src={sportIconFor(sport.id)} alt="" />
                    </span>
                    <span className="route-sport-copy">
                      <strong>{getSportLabel(sport.id)}</strong>
                      <small>{routeProfileFor(sport.id).focus}</small>
                    </span>
                    <span className="route-sport-arrow" aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {currentStep === 2 && selectedSport ? (
            <section className="endurance-shell create-route-v2-section route-step-section">
              <div className="route-builder-step compact">
                <span>2</span>
                <div>
                  <p className="eyebrow">{selectedProfile.title}</p>
                  <h2>Choose route method</h2>
                </div>
              </div>

              <div className="route-method-premium-head">
                <div className="route-method-selected-sport">
                  <span className="route-sport-icon" aria-hidden="true">
                    <img src={sportIconFor(selectedSport.id)} alt="" />
                  </span>
                  <div>
                    <strong>{getSportLabel(selectedSport.id)}</strong>
                    <small>{selectedProfile.focus}</small>
                  </div>
                </div>
                <button type="button" onClick={() => setCurrentStep(1)}>Change sport</button>
              </div>

              <div className="route-method-cards">
                {METHOD_ORDER.map((methodId) => {
                  const method = METHOD_DETAILS[methodId];
                  const recommended = recommendedMethodFor(form.sport_id) === methodId;

                  return (
                    <button
                      key={methodId}
                      type="button"
                      className={recommended ? "route-method-option recommended" : "route-method-option"}
                      onClick={() => {
                        if (methodId === "draw") {
                          router.push(`/routes/draw?sport_id=${encodeURIComponent(form.sport_id || selectedSport.id)}`);
                          return;
                        }

                        updateForm("method", methodId);
                        setCurrentStep(3);
                      }}
                    >
                      <span className="route-method-option-icon" aria-hidden="true">{method.icon}</span>
                      <span className="route-method-option-main">
                        <span className="route-method-option-topline">
                          <em>{method.eyebrow}</em>
                          {recommended ? <i>Recommended</i> : null}
                        </span>
                        <strong>{method.title}</strong>
                        <small>{methodCopyFor(methodId, form.sport_id)}</small>
                        <span className="route-method-option-action">{method.action}</span>
                      </span>
                      <span className="route-method-option-arrow" aria-hidden="true">›</span>
                    </button>
                  );
                })}
              </div>

              <button type="button" className="route-step-secondary route-method-back" onClick={() => setCurrentStep(1)}>
                Back to sport
              </button>
            </section>
          ) : null}

          {currentStep === 3 && form.method ? (
            <section className="endurance-shell create-route-v2-section route-step-section">
              <div className="route-builder-step compact">
                <span>3</span>
                <div>
                  <p className="eyebrow">{METHOD_DETAILS[form.method]?.title}</p>
                  <h2>{form.method === "draw" ? "Route details" : form.method === "upload" ? "Upload route" : "Wizard setup"}</h2>
                </div>
              </div>

              <div className="create-route-editor-grid step-details-grid">
                <section className="create-route-form-card endurance-card">
                  <label>
                    Route title
                    <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="Morning Trail Loop" />
                  </label>

                  <label>
                    Description
                    <textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="Describe terrain, surface, scenery or warnings..." />
                  </label>

                  <div className="create-route-two">
                    <label>
                      Distance km
                      <input type="number" step="0.01" value={form.distance_km} onChange={(event) => updateForm("distance_km", event.target.value)} />
                    </label>

                    <label>
                      Elevation m
                      <input type="number" step="1" value={form.elevation_gain_m} onChange={(event) => updateForm("elevation_gain_m", event.target.value)} />
                    </label>
                  </div>

                  <label>
                    Visibility
                    <select value={form.visibility} onChange={(event) => updateForm("visibility", event.target.value)}>
                      <option value="private">Private</option>
                      <option value="team">Team</option>
                      <option value="public">Public</option>
                    </select>
                  </label>

                  {form.method === "upload" ? (
                    <label className="create-route-upload">
                      <span>Upload GPX file</span>
                      <input type="file" accept=".gpx,application/gpx+xml,text/xml" onChange={handleGpxUpload} />
                    </label>
                  ) : null}

                  {form.method === "draw" ? (
                    <div className="create-route-coming-soon">
                      <strong>Drawn route attached</strong>
                      <span>{routePoints.length ? `${routePoints.length} route points loaded from the fullscreen editor.` : "Open the fullscreen editor to draw your route."}</span>
                      <button
                        type="button"
                        className="route-inline-action"
                        onClick={() => {
                          try {
                            const draft = buildEditableRouteDraft(form, profile?.id);
                            window.sessionStorage.setItem("endurance_route_edit_draft", JSON.stringify(draft));
                          } catch (error) {
                            console.error("Could not prepare route edit draft", error);
                          }

                          router.push(`/routes/draw?sport_id=${encodeURIComponent(form.sport_id)}&editDraft=1`);
                        }}
                      >
                        Reopen map editor
                      </button>
                    </div>
                  ) : null}

                  {form.method === "wizard" ? (
                    <div className="create-route-coming-soon">
                      <strong>Wizard foundation</strong>
                      <span>Next step: distance, start point, loop preference and sport-specific routing profiles.</span>
                    </div>
                  ) : null}

                  <div className="route-step-actions">
                    <button type="button" className="route-step-secondary" onClick={() => setCurrentStep(2)}>
                      Back
                    </button>
                    <button type="button" className="route-save-button" onClick={saveRoute} disabled={saving || !canSave}>
                      {saving ? "Saving..." : "Save route"}
                    </button>
                  </div>
                </section>

                <section className="create-route-preview-card endurance-card">
                  <div className="route-section-title">
                    <div>
                      <p className="eyebrow">Route preview</p>
                      <h2>{form.title || "New route"}</h2>
                    </div>
                    <span>{routePoints.length ? `${routePoints.length} points` : "No points"}</span>
                  </div>

                  {previewMapReady && routePoints.length ? (
                    <OSMRouteMap
                      routePoints={form.route_points}
                      title={form.title || "New route"}
                      height={360}
                      interactive
                      showLegend
                      showLayerControl
                      defaultLayer="dark"
                    />
                  ) : (
                    <div className="route-preview-placeholder">
                      <strong>Route loaded</strong>
                      <span>{routePoints.length ? `${routePoints.length} route points ready` : "No route points loaded yet"}</span>
                    </div>
                  )}

                  <div className="create-route-preview-stats">
                    <span><b>{form.distance_km || "—"}</b>km</span>
                    <span><b>{form.elevation_gain_m || "—"}</b>m gain</span>
                    <span><b>{estimateTimeText(form.distance_km, form.sport_id)}</b>est. time</span>
                  </div>
                </section>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <BottomNav />
    </main>
  );
}
