export default function RouteGeometryLayer({
  L,
  map,
  geometry = [],
}) {
  if (!L || !map || geometry.length < 2) {
    return null;
  }

  const latLngs = geometry.map((point) => [
    point.lat,
    point.lon,
  ]);

  const shadow = L.polyline(latLngs, {
    color: "#000",
    weight: 7,
    opacity: 0.35,
  });

  const route = L.polyline(latLngs, {
    color: "#e6ff00",
    weight: 3,
    opacity: 1,
  });

  shadow.addTo(map);
  route.addTo(map);

  return {
    remove() {
      shadow.remove();
      route.remove();
    },
  };
}
