"use client";

import { useEffect } from "react";

export function safelyLoadRouteDraft({
  router,
  setForm,
  setRoutedPayload,
  setCurrentStep,
  setMessage,
  getSportLabel,
}) {
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;

      const params = new URLSearchParams(window.location.search);

      if (params.get("routeDraft") !== "1") {
        return;
      }

      const rawDraft =
        window.sessionStorage.getItem("endurance_route_draft");

      if (!rawDraft) {
        return;
      }

      const draft = JSON.parse(rawDraft);

      if (
        !draft ||
        typeof draft !== "object" ||
        !draft.route_points
      ) {
        throw new Error("Invalid route draft");
      }

      const safeRoutePoints =
        draft.route_points?.points ||
        draft.route_points ||
        [];

      setForm((current) => ({
        ...current,
        sport_id: draft.sport_id || current.sport_id,
        method: "draw",
        title:
          draft.title ||
          current.title ||
          `${getSportLabel(draft.sport_id)} Route`,
        description:
          draft.description || current.description,
        distance_km: draft.distance_km
          ? String(draft.distance_km)
          : current.distance_km,
        elevation_gain_m: draft.elevation_gain_m
          ? String(draft.elevation_gain_m)
          : current.elevation_gain_m,
        route_points: safeRoutePoints,
      }));

      setRoutedPayload({
        points: safeRoutePoints,
      });

      setCurrentStep(3);

      setMessage(
        "Drawn route loaded. Review the details and save your route."
      );

      window.sessionStorage.removeItem(
        "endurance_route_draft"
      );

      window.history.replaceState(
        {},
        "",
        "/routes/new"
      );
    } catch (error) {
      console.error(
        "Could not safely load route draft",
        error
      );

      try {
        window.sessionStorage.removeItem(
          "endurance_route_draft"
        );
      } catch {}

      router.replace("/routes/new");
    }
  }, []);
}
