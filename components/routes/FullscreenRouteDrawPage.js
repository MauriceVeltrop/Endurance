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

  const points = useMemo(() => normalizeRoutePoints(pointsPayload), [pointsPayload]);
  const metrics = useMemo(() => calculateRouteMetrics(pointsPayload), [pointsPayload]);
  const canContinue = points.length >= 2;

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

  function handlePointsChange(nextPoints) {
    setPointsPayload(makeRoutePointPayload(nextPoints));
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

        handlePointsChange(points.length ? [point, ...points] : [point]);
        setMessage("Current location added.");
      },
      () => setMessage("Could not access current location. Check browser permission."),
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  }

  function continueToDetails() {
    if (!canContinue) {
      setMessage("Add at least two points before continuing.");
      return;
    }

    const draft = {
      sport_id: sportId,
      title: title?.trim() || defaultTitle(sportId),
      description: "",
      method: "draw",
      distance_km: metrics.distance_km || "",
      elevation_gain_m: metrics.elevation_gain_m || "",
      estimated_time: estimateTimeText(metrics.distance_km, sportId),
      route_points: makeRoutePointPayload(points),
      created_by: profile?.id || null,
    };

    window.sessionStorage.setItem("endurance_route_draft", JSON.stringify(draft));
    router.push("/routes/new?routeDraft=1");
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

      <RouteDrawMap
        points={points}
        routedPoints={points}
        onChange={handlePointsChange}
        height="100vh"
        title={title || "Draw route"}
        insertMode={drawInsertMode}
        layer={drawLayer}
        onLayerChange={setDrawLayer}
        routeMode="drawn"
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
        Tap map to add points · drag markers to adjust · tap marker or point row to remove
      </section>

      {message ? <section className="route-draw-toast">{message}</section> : null}
    </main>
  );
}
