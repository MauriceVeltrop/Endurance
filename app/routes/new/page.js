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

const METHOD_DETAILS = {
  upload: {
    title: "Upload GPX",
    eyebrow: "Fastest",
    icon: "↥",
    body: "Import a GPX route from Garmin, Komoot, Strava, RouteYou or another route planner.",
  },
  draw: {
    title: "Draw route",
    eyebrow: "Manual",
    icon: "✎",
    body: "Create a route by drawing on the map. Snapping and rerouting will be expanded next.",
  },
  wizard: {
    title: "Route wizard",
    eyebrow: "Smart",
    icon: "✦",
    body: "Let Endurance generate sport-specific route ideas using routing profiles and surface rules.",
  },
};

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

export default function NewRoutePage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [availableSports, setAvailableSports] = useState([]);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
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

  useEffect(() => {
    loadAccess();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const shouldLoadDraft = params.get("routeDraft") === "1";
    const rawDraft = window.sessionStorage.getItem("endurance_route_draft");

    if (!shouldLoadDraft || !rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft);

      if (!draft?.route_points) return;

      setForm((current) => ({
        ...current,
        sport_id: draft.sport_id || current.sport_id,
        method: "draw",
        title: draft.title || current.title || `${getSportLabel(draft.sport_id)} Route`,
        description: draft.description || current.description,
        distance_km: draft.distance_km ? String(draft.distance_km) : current.distance_km,
        elevation_gain_m: draft.elevation_gain_m ? String(draft.elevation_gain_m) : current.elevation_gain_m,
        route_points: draft.route_points,
      }));

      setRoutedPayload(draft.route_points);
      setMessage("Drawn route loaded. Review the details and save your route.");
      window.sessionStorage.removeItem("endurance_route_draft");
      window.history.replaceState({}, "", "/routes/new");
    } catch (error) {
      console.error("Could not load route draft", error);
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
        const first = allowed[0];
        setForm((current) => ({
          ...current,
          sport_id: current.sport_id || first.id,
          title: current.title || `${getSportLabel(first.id)} Route`,
        }));
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

  useEffect(() => {
    if (!autoReroute || form.method !== "draw") return;

    const points = normalizeRoutePoints(form.route_points);
    if (points.length < 2) return;

    const timeout = window.setTimeout(() => {
      rerouteDrawnRoute();
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [autoReroute, form.method, form.route_points?.point_count]);

  async function saveRoute() {
    if (!canSave || saving) {
      setMessage("Choose a sport, choose a method, add a title and import route points first.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const payload = {
        creator_id: profile.id,
        sport_id: form.sport_id,
        title: form.title.trim(),
        description: form.description.trim() || "",
        visibility: form.visibility,
        distance_km: form.distance_km ? Number(form.distance_km) : null,
        elevation_gain_m: form.elevation_gain_m ? Number(form.elevation_gain_m) : null,
        gpx_file_url: form.gpx_file_url.trim() || null,
        route_points: form.route_points || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("routes")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      router.push(`/routes/${data.id}`);
    } catch (error) {
      console.error("Save route error", error);
      setMessage(error?.message || "Could not save route.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="endurance-page create-route-v2-page">
      <AppHeader active="routes" />

      <section className="endurance-shell training-hero endurance-card create-route-v2-hero">
        <div>
          <p className="eyebrow">Create route</p>
          <h1>
            Build a route
            <br />
            for your sport<span>.</span>
          </h1>
          <p>
            Choose a preferred sport first. Endurance then shows the route methods and logic that fit that sport.
          </p>
        </div>
        <Link href="/routes" className="hero-create-button">
          Routes
        </Link>
      </section>

      {message ? <section className="endurance-shell create-route-v2-message">{message}</section> : null}

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
          <section className="endurance-shell create-route-v2-section">
            <div className="route-builder-step">
              <span>1</span>
              <div>
                <p className="eyebrow">Sport first</p>
                <h2>Choose route sport</h2>
              </div>
            </div>

            <div className="create-route-sport-grid">
              {availableSports.map((sport) => (
                <button
                  key={sport.id}
                  type="button"
                  className={form.sport_id === sport.id ? "route-sport-card active" : "route-sport-card"}
                  onClick={() => updateForm("sport_id", sport.id)}
                >
                  <span>{getSportLabel(sport.id).slice(0, 2).toUpperCase()}</span>
                  <strong>{getSportLabel(sport.id)}</strong>
                  <small>{routeProfileFor(sport.id).focus}</small>
                </button>
              ))}
            </div>
          </section>

          {selectedSport ? (
            <section className="endurance-shell create-route-v2-section">
              <div className="route-builder-step">
                <span>2</span>
                <div>
                  <p className="eyebrow">{selectedProfile.title}</p>
                  <h2>Choose route method</h2>
                </div>
              </div>

              <div className="route-method-grid">
                {Object.entries(METHOD_DETAILS).map(([methodId, method]) => (
                  <button
                    key={methodId}
                    type="button"
                    className={form.method === methodId ? "route-method-card active" : "route-method-card"}
                    onClick={() => {
                      if (methodId === "draw") {
                        const routeSportId = form.sport_id || selectedSport?.id;

                        if (!routeSportId) {
                          setMessage("Choose a route sport first.");
                          return;
                        }

                        router.push(`/routes/draw?sport_id=${encodeURIComponent(routeSportId)}`);
                        return;
                      }

                      updateForm("method", methodId);
                    }}
                  >
                    <span>{method.eyebrow}</span>
                    <b>{method.icon}</b>
                    <strong>{method.title}</strong>
                    <small>{method.body}</small>
                    {methodId === "draw" ? <em className="route-method-fullscreen-label">Opens after sport selection</em> : null}
                  </button>
                ))}
              </div>

              <article className="route-sport-intelligence endurance-card">
                <p className="eyebrow">Sport-specific route intelligence</p>
                <h3>{selectedProfile.title}</h3>
                <div>
                  <span><b>Focus</b>{selectedProfile.focus}</span>
                  <span><b>Best method</b>{selectedProfile.best}</span>
                  <span><b>Avoid</b>{selectedProfile.avoid}</span>
                </div>
              </article>
            </section>
          ) : null}

          {form.method ? (
            <section className="endurance-shell create-route-v2-section">
              <div className="route-builder-step">
                <span>3</span>
                <div>
                  <p className="eyebrow">{METHOD_DETAILS[form.method]?.title}</p>
                  <h2>Route details</h2>
                </div>
              </div>

              <div className="create-route-editor-grid">
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
                    <div className="create-route-draw-tools route-draw-tools-expanded">
                      <div>
                        <strong>Draw route on map</strong>
                        <span>{normalizeRoutePoints(form.route_points).length} point(s) added</span>
                      </div>

                      <div>
                        <button type="button" onClick={useCurrentLocationAsDrawStart}>
                          Use location
                        </button>
                        <button type="button" onClick={() => setDrawInsertMode((value) => !value)} className={drawInsertMode ? "active" : ""}>
                          Insert
                        </button>
                        <button type="button" onClick={closeDrawLoop} disabled={normalizeRoutePoints(form.route_points).length < 3}>
                          Close loop
                        </button>
                        <button type="button" onClick={undoDrawPoint} disabled={!normalizeRoutePoints(form.route_points).length}>
                          Undo
                        </button>
                        <button type="button" onClick={rerouteDrawnRoute} disabled={normalizeRoutePoints(form.route_points).length < 2 || routingStatus === "routing"}>
                          {routingStatus === "routing" ? "Routing..." : "Reroute"}
                        </button>
                        <button type="button" onClick={clearDrawPoints} disabled={!normalizeRoutePoints(form.route_points).length}>
                          Clear
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {form.method === "draw" ? (
                    <div className="route-routing-panel">
                      <div><span>Routing mode</span><strong>{autoReroute ? "Auto reroute on" : "Manual reroute"}</strong><small>{routingError || "Uses OpenRouteService when configured. Falls back to drawn lines if routing fails."}</small></div>
                      <label><input type="checkbox" checked={autoReroute} onChange={(event) => setAutoReroute(event.target.checked)} /> Auto reroute</label>
                    </div>
                  ) : null}

                  {form.method === "wizard" ? (
                    <div className="create-route-coming-soon">
                      <strong>Wizard foundation</strong>
                      <span>Next step: distance, start point, loop preference and sport-specific routing profiles.</span>
                    </div>
                  ) : null}

                  <button type="button" className="route-save-button" onClick={saveRoute} disabled={saving || !canSave}>
                    {saving ? "Saving..." : "Save route"}
                  </button>
                </section>

                <section className="create-route-preview-card endurance-card">
                  <div className="route-section-title">
                    <div>
                      <p className="eyebrow">Route preview</p>
                      <h2>{form.title || "New route"}</h2>
                    </div>
                    <span>{routePoints.length ? `${routePoints.length} points` : "No points"}</span>
                  </div>

                  {form.method === "draw" ? (
                    <RouteDrawMap
                      points={normalizeRoutePoints(form.route_points?.waypoints || form.route_points)}
                      routedPoints={normalizeRoutePoints(routedPayload || form.route_points)}
                      onChange={handleDrawPointsChange}
                      height={430}
                      title={form.title || "Draw route"}
                      insertMode={drawInsertMode}
                      layer={drawLayer}
                      onLayerChange={setDrawLayer}
                      routeMode={routedPayload || form.route_points?.source === "openrouteservice" ? "routed" : "drawn"}
                    />
                  ) : (
                    <OSMRouteMap
                      routePoints={form.route_points}
                      title={form.title || "New route"}
                      height={360}
                      interactive
                      showLegend
                      showLayerControl
                      defaultLayer="dark"
                    />
                  )}

                  <div className="create-route-preview-stats">
                    <span><b>{form.distance_km || "—"}</b>km</span>
                    <span><b>{form.elevation_gain_m || "—"}</b>m gain</span>
                    <span><b>{estimateTimeText(form.distance_km, form.sport_id)}</b>est. time</span>
                  </div>

                  {form.method === "draw" && normalizeRoutePoints(form.route_points).length ? (
                    <div className="route-point-list">
                      <div className="route-point-list-head">
                        <strong>Route points</strong>
                        <small>Tap marker or remove from list</small>
                      </div>
                      {normalizeRoutePoints(form.route_points).map((point, index) => (
                        <div key={`${point.lat}-${point.lon}-${index}`} className="route-point-row">
                          <span>{index + 1}</span>
                          <small>{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</small>
                          <button type="button" onClick={() => removeDrawPoint(index)}>Remove</button>
                        </div>
                      ))}
                    </div>
                  ) : null}
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
