"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import { getSportLabel } from "../lib/trainingHelpers";

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isCreateTrainingPath(pathname) {
  return String(pathname || "").replace(/\/+$/, "") === "/trainings/new";
}

function findTrainingNameField() {
  const labels = Array.from(document.querySelectorAll("label"));
  const trainingNameLabel = labels.find((label) => {
    const text = normalizeText(label.textContent);
    const input = label.querySelector("input, textarea");
    return text.startsWith("training name") && Boolean(input);
  });

  if (!trainingNameLabel) return null;

  return {
    label: trainingNameLabel,
    field: trainingNameLabel.querySelector("input, textarea"),
  };
}

function findMountTarget() {
  const trainingName = findTrainingNameField();
  if (!trainingName?.label) return null;

  const section = trainingName.label.closest("section") || trainingName.label.parentElement;
  if (!section) return null;

  let mount = section.querySelector("[data-training-route-selector-mount='true']");
  if (!mount) {
    mount = document.createElement("div");
    mount.setAttribute("data-training-route-selector-mount", "true");
    trainingName.label.insertAdjacentElement("afterend", mount);
  }

  return mount;
}

function sportIdsFromTrainingName(value) {
  const title = normalizeText(value)
    .replaceAll("_", " ")
    .replace(/[()]/g, "")
    .replace(/\btraining\b/g, "")
    .trim();

  // Running and Trail Running have been merged in the UI. Both legacy route IDs
  // belong to the single (Trail)Running choice.
  if (title.includes("trailrunning") || title.includes("trail running") || title === "running") {
    return ["running", "trail_running"];
  }

  if (title.includes("road cycling")) return ["road_cycling"];
  if (title.includes("gravel cycling") || title === "gravel") return ["gravel_cycling"];
  if (title.includes("mountain biking") || title === "mtb") return ["mountain_biking"];
  if (title.includes("walking")) return ["walking"];
  if (title.includes("kayaking")) return ["kayaking"];

  return [];
}

function getRouteIdFromLocation() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("route_id") || params.get("from_route") || params.get("route") || "";
}

export default function TrainingRouteSelector() {
  const pathname = usePathname();
  const activePath = isCreateTrainingPath(pathname);
  const [mountTarget, setMountTarget] = useState(null);
  const [selectedSportIds, setSelectedSportIds] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");

  useEffect(() => {
    if (!activePath) {
      setMountTarget(null);
      setSelectedSportIds([]);
      return undefined;
    }

    setSelectedRouteId(getRouteIdFromLocation());

    let frame = 0;
    let observedField = null;

    const resolvePageState = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = findMountTarget();
        if (target) setMountTarget(target);

        const trainingName = findTrainingNameField();
        const detectedIds = sportIdsFromTrainingName(trainingName?.field?.value);
        if (detectedIds.length) {
          setSelectedSportIds((current) => {
            const same = current.length === detectedIds.length && current.every((id, index) => id === detectedIds[index]);
            return same ? current : detectedIds;
          });
        }

        if (trainingName?.field && trainingName.field !== observedField) {
          observedField?.removeEventListener("input", resolvePageState);
          observedField?.removeEventListener("change", resolvePageState);
          observedField = trainingName.field;
          observedField.addEventListener("input", resolvePageState);
          observedField.addEventListener("change", resolvePageState);
        }
      });
    };

    resolvePageState();
    const observer = new MutationObserver(resolvePageState);
    observer.observe(document.body, { childList: true, subtree: true });

    const retryTimers = [100, 300, 700, 1400].map((delay) => setTimeout(resolvePageState, delay));

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      observedField?.removeEventListener("input", resolvePageState);
      observedField?.removeEventListener("change", resolvePageState);
      retryTimers.forEach(clearTimeout);
    };
  }, [activePath]);

  useEffect(() => {
    if (!activePath || selectedSportIds.length === 0) {
      setRoutes([]);
      return undefined;
    }

    let cancelled = false;

    async function loadRoutes() {
      setLoading(true);
      setMessage("");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (!userId) {
        if (!cancelled) {
          setRoutes([]);
          setMessage("Log in to select one of your routes.");
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("routes")
        .select("id,title,sport_id,distance_km,elevation_gain_m,created_at")
        .eq("creator_id", userId)
        .in("sport_id", selectedSportIds)
        .order("created_at", { ascending: false })
        .limit(30);

      if (cancelled) return;

      if (error) {
        console.warn("Could not load matching routes for training selector", error);
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
  }, [activePath, selectedSportIds]);

  const selectedRoute = useMemo(
    () => routes.find((route) => String(route.id) === String(selectedRouteId)) || null,
    [routes, selectedRouteId]
  );

  const selectedSportLabel = selectedSportIds.length > 1
    ? "(Trail)Running"
    : selectedSportIds[0]
      ? getSportLabel(selectedSportIds[0])
      : "selected sport";

  function selectRoute(routeId) {
    setSelectedRouteId(routeId);
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

  if (!activePath || !mountTarget || selectedSportIds.length === 0) return null;

  return createPortal(
    <div className="training-route-selector">
      <label className="training-route-selector-label" htmlFor="training-existing-route">
        Existing {selectedSportLabel} route
      </label>
      <select
        id="training-existing-route"
        className="training-route-selector-select"
        value={selectedRouteId}
        onChange={(event) => selectRoute(event.target.value)}
        disabled={loading}
      >
        <option value="">
          {loading
            ? "Loading routes..."
            : routes.length
              ? "No route selected"
              : `No ${selectedSportLabel} routes found`}
        </option>
        {routes.map((route) => (
          <option key={route.id} value={route.id}>
            {route.title || "Untitled route"}
            {route.distance_km ? ` · ${Number(route.distance_km).toFixed(1)} km` : ""}
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
