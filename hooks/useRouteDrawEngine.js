import { useCallback, useEffect, useMemo, useState } from "react";

export default function useRouteDrawEngine({
  sportId,
  initialPoints = [],
}) {
  const [routePoints, setRoutePoints] = useState(initialPoints);
  const [routedGeometry, setRoutedGeometry] = useState([]);
  const [routingStatus, setRoutingStatus] = useState("idle");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [mapFocusTarget, setMapFocusTarget] = useState(null);

  const routeSignature = useMemo(() => {
    return routePoints
      .map((point) => `${point.lat},${point.lon}`)
      .join("|");
  }, [routePoints]);

  const requestCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition((position) => {
      const location = {
        lat: Number(position.coords.latitude.toFixed(6)),
        lon: Number(position.coords.longitude.toFixed(6)),
        focusedAt: Date.now(),
      };

      setCurrentLocation(location);
      setMapFocusTarget(location);
    });
  }, []);

  const focusLocation = useCallback((location) => {
    setMapFocusTarget({
      ...location,
      focusedAt: Date.now(),
    });
  }, []);

  const reroute = useCallback(async () => {
    if (routePoints.length < 2) return;

    setRoutingStatus("routing");

    try {
      const response = await fetch("/api/routes/reroute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sport_id: sportId,
          points: routePoints,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Routing failed");
      }

      setRoutedGeometry(data?.route_points?.points || []);
      setRoutingStatus("done");
    } catch (error) {
      console.error(error);
      setRoutingStatus("error");
    }
  }, [routePoints, sportId]);

  useEffect(() => {
    if (routePoints.length < 2) return;

    const timeout = setTimeout(() => {
      reroute();
    }, 650);

    return () => clearTimeout(timeout);
  }, [routeSignature, reroute]);

  return {
    routePoints,
    setRoutePoints,
    routedGeometry,
    routingStatus,
    currentLocation,
    requestCurrentLocation,
    mapFocusTarget,
    focusLocation,
    reroute,
  };
}
