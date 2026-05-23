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


function serializePoint(point) {
  const lat = Number(point?.lat ?? point?.latitude);
  const lon = Number(point?.lon ?? point?.lng ?? point?.longitude);
  const ele = point?.ele ?? point?.elevation ?? point?.elevation_m ?? null;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const compact = [Number(lat.toFixed(6)), Number(lon.toFixed(6))];

  if (Number.isFinite(Number(ele))) {
    compact.push(Math.round(Number(ele)));
  }

  return compact;
}

function compactRoutePoints(points, maxPoints = 240) {
  const normalized = normalizeRoutePoints(points);

  if (!normalized.length) return [];

  const step = Math.max(1, Math.ceil(normalized.length / maxPoints));
  const compacted = normalized
    .filter((_, index) => index % step === 0)
    .map(serializePoint)
    .filter(Boolean);
  const last = serializePoint(normalized[normalized.length - 1]);

  if (last) {
    const tail = compacted[compacted.length - 1];
    if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) {
      compacted.push(last);
    }
  }

  return compacted;
}

function buildSafeDraftRoutePayload(payload, fallbackPoints) {
  const payloadPoints = normalizeRoutePoints(payload);
  const fallback = normalizeRoutePoints(fallbackPoints);
  const points = compactRoutePoints(payloadPoints.length ? payloadPoints : fallback);
  const waypoints = Array.isArray(payload?.waypoints) ? compactRoutePoints(payload.waypoints, 30) : compactRoutePoints(fallback, 30);

  return {
    source: "draw-fullscreen",
    profile: payload?.profile || null,
    waypoints,
    points,
    point_count: points.length,
    distance_km: payload?.distance_km || null,
    elevation_gain_m: payload?.elevation_gain_m || 0,
    routed_at: payload?.routed_at || payload?.drawn_at || new Date().toISOString(),
  };
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
  const [isContinuing, setIsContinuing] = useState(false);

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
        const initialSport = params.get("sport_id");

        if (!initialSport) {
          router.replace("/routes/new");
          return;
        }

        setSportId(initialSport);
        setTitle(defaultTitle(initialSport));

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

  function requestCurrentLocation() {
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
        setTargetLocation(location);
        setMessage("");
      },
      () => {
        setMessage("Could not access current location. You can still search or draw manually.");
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  }

  function handlePointsChange(nextPoints) {
    setPointsPayload(makeRoutePointPayload(nextPoints));
    setRoutedPayload(null);
    setRoutingStatus("idle");
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

      const draftText = JSON.stringify(draft);

      if (draftText.length > 180000) {
        throw new Error("Route draft is too large for this device.");
      }

      window.sessionStorage.setItem("endurance_route_draft", draftText);

      // Mobile Chrome can crash when a heavy Leaflet fullscreen view navigates immediately.
      // First unmount the map UI, then navigate on the next tick with a light client transition.
      setIsContinuing(true);
      setPointsPayload(null);
      setRoutedPayload(null);
      setSearchResults([]);
      window.setTimeout(() => {
        router.replace("/routes/new?routeDraft=1");
      }, 120);
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

    const timeout = window.setTimeout(() => {
      rerouteRoute({ silent: true });
    }, 850);

    return () => window.clearTimeout(timeout);
  }, [routeSignature, sportId]);


  if (isContinuing) {
    return (
      <main className="route-draw-fullscreen route-draw-polished">
        <div className="route-draw-loading">Preparing route details...</div>
      </main>
    );
  }

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
        focusCurrentLocation
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
