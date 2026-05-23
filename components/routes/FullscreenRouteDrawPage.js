// components/routes/FullscreenRouteDrawPage.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RouteDrawMap from "./RouteDrawMap";
import { supabase } from "../../lib/supabase";
import { getSportLabel } from "../../lib/trainingHelpers";
import { calculateRouteMetrics, estimateTimeText, normalizeRoutePoints } from "../../lib/routeMetrics";

function makeRoutePointPayload(points, source = "draw-fullscreen") {
  const normalized = normalizeRoutePoints(points);
  const metrics = calculateRouteMetrics(normalized);

  return {
    source,
    points: normalized,
    point_count: normalized.length,
    distance_km: metrics.distance_km || null,
    elevation_gain_m: metrics.elevation_gain_m || 0,
    elevation_loss_m: metrics.elevation_loss_m || 0,
    max_elevation_m: metrics.max_elevation_m || null,
    drawn_at: new Date().toISOString(),
  };
}

function defaultTitle(sportId) {
  return `${getSportLabel(sportId || "running")} Route`;
}


function compactRoutePoints(points, maxPoints = 900) {
  const normalized = normalizeRoutePoints(points);

  if (normalized.length <= maxPoints) return normalized;

  const step = Math.ceil(normalized.length / maxPoints);
  const compacted = normalized.filter((_, index) => index % step === 0);
  const last = normalized[normalized.length - 1];

  if (last && compacted[compacted.length - 1] !== last) {
    compacted.push(last);
  }

  return compacted;
}

function buildSafeDraftRoutePayload(payload, fallbackPoints) {
  const payloadPoints = normalizeRoutePoints(payload);
  const fallback = normalizeRoutePoints(fallbackPoints);
  const points = compactRoutePoints(payloadPoints.length ? payloadPoints : fallback);

  return {
    source: payload?.source || "draw-fullscreen",
    profile: payload?.profile || null,
    provider_url: payload?.provider_url || null,
    waypoints: Array.isArray(payload?.waypoints) ? compactRoutePoints(payload.waypoints, 80) : [],
    points,
    point_count: points.length,
    distance_km: payload?.distance_km || null,
    elevation_gain_m: payload?.elevation_gain_m || 0,
    routed_at: payload?.routed_at || payload?.drawn_at || payload?.edited_at || new Date().toISOString(),
  };
}

function safeReadEditDraft() {
  try {
    if (typeof window === "undefined") return null;

    const params = new URLSearchParams(window.location.search);
    if (params.get("editDraft") !== "1") return null;

    const raw = window.sessionStorage.getItem("endurance_route_edit_draft");
    if (!raw) return null;

    const draft = JSON.parse(raw);
    const points = normalizeRoutePoints(draft?.route_points);

    if (!points.length) return null;

    return {
      ...draft,
      route_points: {
        ...(draft.route_points && typeof draft.route_points === "object" && !Array.isArray(draft.route_points) ? draft.route_points : {}),
        points,
        point_count: points.length,
      },
    };
  } catch (error) {
    console.error("Could not load route edit draft", error);
    return null;
  }
}

export default function FullscreenRouteDrawPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [sportId, setSportId] = useState("");
  const [title, setTitle] = useState("Draw Route");
  const [pointsPayload, setPointsPayload] = useState(null);
  const [drawInsertMode, setDrawInsertMode] = useState(false);
  const [drawLayer, setDrawLayer] = useState("light");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(true);
  const [showPointPanel, setShowPointPanel] = useState(false);
  const [routedPayload, setRoutedPayload] = useState(null);
  const [routingStatus, setRoutingStatus] = useState("idle");
  const [routingError, setRoutingError] = useState("");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [targetLocation, setTargetLocation] = useState(null);
  const [focusCurrentLocationOnLoad, setFocusCurrentLocationOnLoad] = useState(true);
  const [lastEditReason, setLastEditReason] = useState("idle");

  const points = useMemo(() => normalizeRoutePoints(pointsPayload), [pointsPayload]);
  const routedPoints = useMemo(() => normalizeRoutePoints(routedPayload), [routedPayload]);
  const activeRoutePayload = routedPayload || pointsPayload;
  const metrics = useMemo(() => calculateRouteMetrics(activeRoutePayload), [activeRoutePayload]);
  const canContinue = points.length >= 2;
  const routeSignature = useMemo(
    () => points.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`).join("|"),
    [points]
  );

  useEffect(() => {
    async function bootstrap() {
      setChecking(true);

      try {
        const params = new URLSearchParams(window.location.search);
        const editDraft = safeReadEditDraft();
        const initialSport = params.get("sport_id") || editDraft?.sport_id;

        if (!initialSport) {
          router.replace("/routes/new");
          return;
        }

        setSportId(initialSport);
        setTitle(editDraft?.title || defaultTitle(initialSport));

        if (editDraft?.route_points?.points?.length) {
          setFocusCurrentLocationOnLoad(false);
          setPointsPayload(makeRoutePointPayload(editDraft.route_points.points, "draw-edit"));
          setRoutedPayload(editDraft.route_points);
          setTargetLocation(null);
          setMessage("Existing route loaded. Edit the route and save again.");
          window.sessionStorage.removeItem("endurance_route_edit_draft");
        }

        const { data } = await supabase.auth.getUser();
        const user = data?.user;

        if (!user?.id) {
          router.replace("/login");
          return;
        }

        const { data: profileRow, error } = await supabase
          .from("profiles")
          .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (!profileRow?.onboarding_completed) {
          router.replace("/onboarding");
          return;
        }

        if (profileRow?.blocked) {
          setMessage("Your account is blocked. Contact an administrator.");
          return;
        }

        setProfile(profileRow);
      } catch (error) {
        console.error("Draw route bootstrap error", error);
        setMessage(error?.message || "Could not open draw editor.");
      } finally {
        setChecking(false);
      }
    }

    bootstrap();
  }, [router]);


  useEffect(() => {
    requestCurrentLocation(false);
  }, []);

  function requestCurrentLocation(shouldFocus = true) {
    if (!navigator.geolocation) {
      setMessage("Geolocation is not available on this device.");
      return;
    }

    setMessage("Finding your current location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: Number(position.coords.latitude.toFixed(6)),
          lon: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy || 35),
          label: "Current location",
        };

        setCurrentLocation(location);
        if (shouldFocus) {
          setTargetLocation({ ...location, selectedAt: Date.now() });
        }
        setMessage("");
      },
      () => {
        setMessage("Could not access current location. You can still search or draw manually.");
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  }

  function handlePointsChange(nextPoints, meta = {}) {
    setPointsPayload(makeRoutePointPayload(nextPoints));
    setRoutedPayload(null);
    setLastEditReason(meta?.reason || "edit");
    setRoutingStatus(meta?.reason === "drag" ? "routing" : "idle");
    setRoutingError("");
  }

  function undoPoint() {
    handlePointsChange(points.slice(0, -1));
  }

  function clearRoute() {
    setPointsPayload(null);
    setShowPointPanel(false);
  }

  function removePoint(indexToRemove) {
    handlePointsChange(points.filter((_, index) => index !== indexToRemove));
  }

  function closeLoop() {
    if (points.length < 3) {
      setMessage("Add at least three points before closing the loop.");
      return;
    }

    const first = points[0];
    const last = points[points.length - 1];

    if (first.lat === last.lat && first.lon === last.lon) {
      setMessage("This route is already closed.");
      return;
    }

    handlePointsChange([...points, { ...first }]);
  }

  function useCurrentLocation() {
    if (currentLocation?.lat && currentLocation?.lon) {
      setTargetLocation({
        ...currentLocation,
        label: "Current location",
        selectedAt: Date.now(),
      });
      setMessage("Centered on current location.");
      return;
    }

    requestCurrentLocation();
  }


  async function rerouteRoute({ silent = false } = {}) {
    if (points.length < 2) return;

    try {
      setRoutingStatus("routing");

      const response = await fetch("/api/routes/reroute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sport_id: sportId,
          points,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Routing failed.");
      }

      const routed = data.route_points || data;

      if (!routed?.points?.length && !Array.isArray(routed)) {
        throw new Error("No routed geometry returned.");
      }

      setRoutedPayload(routed);
      setRoutingStatus("done");

      if (!silent) {
        setMessage("");
      }
    } catch (error) {
      console.error("Routing failed", error);
      setRoutingStatus("error");
      setRoutingError(error?.message || "Routing failed.");
    }
  }

  function continueToDetails() {
    if (!canContinue) {
      setMessage("Add at least two routepoints before continuing.");
      return;
    }

    try {
      const safePayload = buildSafeDraftRoutePayload(
        routedPayload?.points?.length ? routedPayload : makeRoutePointPayload(points),
        points
      );

      const draft = {
        sport_id: sportId,
        title: title?.trim() || defaultTitle(sportId),
        description: "",
        method: "draw",
        distance_km: metrics.distance_km || safePayload.distance_km || "",
        elevation_gain_m: metrics.elevation_gain_m || safePayload.elevation_gain_m || "",
        estimated_time: estimateTimeText(metrics.distance_km || safePayload.distance_km, sportId),
        route_points: safePayload,
        created_by: profile?.id || null,
        saved_at: new Date().toISOString(),
      };

      const serializedDraft = JSON.stringify(draft);
      window.sessionStorage.setItem("endurance_route_draft", serializedDraft);
      window.localStorage.setItem("endurance_route_draft_backup", serializedDraft);
      window.location.assign(`/routes/new?routeDraft=1&step=details&t=${Date.now()}`);
    } catch (error) {
      console.error("Could not save route draft", error);
      setMessage("Could not prepare the route details. Try again with fewer routepoints.");
    }
  }



  useEffect(() => {
    const query = searchText.trim();

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        setSearching(true);

        const response = await fetch(`/api/geocode/search?text=${encodeURIComponent(query)}`);
        const data = await response.json();

        setSearchResults(Array.isArray(data?.features) ? data.features : []);
      } catch (error) {
        console.error("Location search failed", error);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchText]);

  function flyToLocation(result) {
    const location = {
      lat: Number(result.lat),
      lon: Number(result.lon),
      label: result.label || "Selected location",
      forceFocusAt: Date.now(),
    };

    setTargetLocation(location);
    setSearchResults([]);
    setSearchText(result.label || "");
  }


  useEffect(() => {
    if (points.length < 2 || !routeSignature) return;

    const delay = lastEditReason === "drag" ? 180 : 650;

    const timeout = window.setTimeout(() => {
      rerouteRoute({ silent: true });
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [routeSignature, sportId, lastEditReason]);


  if (checking) {
    return (
      <main className="route-draw-fullscreen">
        <div className="route-draw-loading">Opening fullscreen editor...</div>
      </main>
    );
  }

  return (
    <main className="route-draw-fullscreen route-draw-polished">
      <section className="route-draw-topbar">
        <button type="button" className="route-draw-round-btn" onClick={() => router.push("/routes/new")} aria-label="Close draw editor">
          ←
        </button>

        <div className="route-draw-title-block">
          <span>{getSportLabel(sportId)}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>

        <button
          type="button"
          className="route-draw-save-btn"
          onClick={continueToDetails}
          disabled={!canContinue}
        >
          Save & continue
        </button>
      </section>

      <div className="route-search-bar">
        <div className="route-search-input-wrap">
          <span className="route-search-icon">⌕</span>
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search location, address or place"
          />
        </div>

        {searchResults.length ? (
          <div className="route-search-results">
            {searchResults.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => flyToLocation(result)}
              >
                <b>{result.label}</b>
                <small>
                  {Number(result.lat).toFixed(5)}, {Number(result.lon).toFixed(5)}
                </small>
              </button>
            ))}
          </div>
        ) : null}

        {searching ? (
          <div className="route-search-loading">Searching locations...</div>
        ) : null}
      </div>

      <RouteDrawMap
        points={points}
        routedPoints={routedPoints.length ? routedPoints : points}
        onChange={handlePointsChange}
        height="100vh"
        title={title || "Draw route"}
        insertMode={drawInsertMode}
        layer={drawLayer}
        onLayerChange={setDrawLayer}
        routeMode={routedPoints.length ? "routed" : "drawn"}
        currentLocation={currentLocation}
        focusCurrentLocation={focusCurrentLocationOnLoad}
        targetLocation={targetLocation}
      />

      <section className="route-draw-side-tools" aria-label="Route drawing tools">
        <button type="button" onClick={useCurrentLocation}>
          <b>⌖</b>
          <span>Location</span>
        </button>
        <button type="button" onClick={() => setDrawInsertMode((value) => !value)} className={drawInsertMode ? "active" : ""}>
          <b>＋</b>
          <span>Insert</span>
        </button>
        <button type="button" onClick={closeLoop} disabled={points.length < 3}>
          <b>↺</b>
          <span>Loop</span>
        </button>
        <button type="button" onClick={undoPoint} disabled={!points.length}>
          <b>↶</b>
          <span>Undo</span>
        </button>
        <button type="button" onClick={clearRoute} disabled={!points.length}>
          <b>⌫</b>
          <span>Clear</span>
        </button>
      </section>

      {routingError ? <section className="route-draw-routing-error">{routingError}</section> : null}

      {routedPoints.length ? (
        <section className="route-draw-routing-status">
          Route automatically follows roads/paths
        </section>
      ) : null}

      <section className="route-draw-metrics-card">
        <button type="button" onClick={() => setShowPointPanel((value) => !value)}>
          <span>Points</span>
          <b>{points.length}</b>
        </button>
        <div>
          <span>Distance</span>
          <b>{metrics.distance_km || "—"} km</b>
        </div>
        <div>
          <span>Elevation</span>
          <b>{metrics.elevation_gain_m || "—"} m</b>
        </div>
        <div>
          <span>Est. time</span>
          <b>{estimateTimeText(metrics.distance_km, sportId)}</b>
        </div>
      </section>

      {showPointPanel ? (
        <section className="route-draw-point-panel">
          <div>
            <strong>Route points</strong>
            <button type="button" onClick={() => setShowPointPanel(false)}>×</button>
          </div>

          {points.length ? (
            points.map((point, index) => (
              <button key={`${point.lat}-${point.lon}-${index}`} type="button" onClick={() => removePoint(index)}>
                <span>{index + 1}</span>
                <small>{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</small>
                <b>Remove</b>
              </button>
            ))
          ) : (
            <p>Tap on the map to add your first point.</p>
          )}
        </section>
      ) : null}

      <section className="route-draw-tip">
        Tap to add routepoints · drag routepoints to reshape · route follows roads/paths automatically
      </section>

      {message ? <section className="route-draw-toast">{message}</section> : null}
    </main>
  );
}
