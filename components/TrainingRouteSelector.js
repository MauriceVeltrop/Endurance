"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";
import { getSportLabel } from "../lib/trainingHelpers";

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function findMountTarget() {
  const basicsHeading = Array.from(document.querySelectorAll("h1, h2, h3")).find(
    (heading) => normalizeText(heading.textContent) === "basics"
  );

  const section = basicsHeading?.closest("section");
  if (!section) return null;

  const trainingNameLabel = Array.from(section.querySelectorAll("label")).find((label) =>
    normalizeText(label.textContent).startsWith("training name")
  );

  if (!trainingNameLabel) return null;

  let mount = section.querySelector("[data-training-route-selector-mount='true']");
  if (!mount) {
    mount = document.createElement("div");
    mount.setAttribute("data-training-route-selector-mount", "true");
    trainingNameLabel.insertAdjacentElement("afterend", mount);
  }

  return mount;
}

export default function TrainingRouteSelector() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mountTarget, setMountTarget] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedRouteId = searchParams.get("route_id") || searchParams.get("from_route") || searchParams.get("route") || "";

  useEffect(() => {
    if (pathname !== "/trainings/new") {
      setMountTarget(null);
      return undefined;
    }

    const resolveTarget = () => {
      const target = findMountTarget();
      if (target) setMountTarget(target);
    };

    resolveTarget();
    const observer = new MutationObserver(resolveTarget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/trainings/new") return;

    let cancelled = false;

    async function loadRoutes() {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("routes")
        .select("id,title,sport_id,distance_km,elevation_gain_m,created_at")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.warn("Could not load routes for training selector", error);
        setRoutes([]);
        setMessage("Routes could not be loaded.");
      } else {
        setRoutes(Array.isArray(data) ? data : []);
      }

      setLoading(false);
    }

    loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const selectedRoute = useMemo(
    () => routes.find((route) => String(route.id) === String(selectedRouteId)) || null,
    [routes, selectedRouteId]
  );

  function selectRoute(routeId) {
    const url = new URL(window.location.href);

    if (routeId) {
      url.searchParams.set("route_id", routeId);
      url.searchParams.delete("from_route");
      url.searchParams.delete("route");
      url.searchParams.delete("workout_id");
      url.searchParams.delete("from_workout");
    } else {
      url.searchParams.delete("route_id");
      url.searchParams.delete("from_route");
      url.searchParams.delete("route");
    }

    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  }

  if (pathname !== "/trainings/new" || !mountTarget) return null;

  return createPortal(
    <div className="training-route-selector">
      <label className="training-route-selector-label" htmlFor="training-existing-route">
        Existing route
      </label>
      <select
        id="training-existing-route"
        className="training-route-selector-select"
        value={selectedRouteId}
        onChange={(event) => selectRoute(event.target.value)}
        disabled={loading}
      >
        <option value="">{loading ? "Loading routes..." : "No route selected"}</option>
        {routes.map((route) => (
          <option key={route.id} value={route.id}>
            {route.title || "Untitled route"}
            {route.distance_km ? ` · ${Number(route.distance_km).toFixed(1)} km` : ""}
            {route.sport_id ? ` · ${getSportLabel(route.sport_id)}` : ""}
          </option>
        ))}
      </select>

      {selectedRoute ? (
        <div className="training-route-selector-summary">
          <strong>{selectedRoute.title || "Selected route"}</strong>
          <span>
            {selectedRoute.distance_km ? `${Number(selectedRoute.distance_km).toFixed(1)} km` : "Distance unknown"}
            {selectedRoute.elevation_gain_m ? ` · ${Math.round(Number(selectedRoute.elevation_gain_m))} m elevation` : ""}
          </span>
        </div>
      ) : null}

      {message ? <span className="training-route-selector-message">{message}</span> : null}
    </div>,
    mountTarget
  );
}
