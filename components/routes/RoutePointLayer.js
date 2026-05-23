export default function RoutePointLayer({
  L,
  map,
  points = [],
  onChange,
}) {
  if (!L || !map) return null;

  const markers = [];

  points.forEach((point, index) => {
    const marker = L.marker([point.lat, point.lon], {
      draggable: true,
    });

    marker.on("dragend", (event) => {
      const latlng = event.target.getLatLng();

      const next = points.map((existing, pointIndex) => {
        if (pointIndex !== index) {
          return existing;
        }

        return {
          ...existing,
          lat: Number(latlng.lat.toFixed(6)),
          lon: Number(latlng.lng.toFixed(6)),
        };
      });

      onChange(next);
    });

    marker.addTo(map);

    markers.push(marker);
  });

  return {
    remove() {
      markers.forEach((marker) => marker.remove());
    },
  };
}
