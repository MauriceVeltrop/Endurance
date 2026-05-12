// Replace the existing invalidateSize / fitBounds section with this:

const bounds = L.latLngBounds(latLngs);

setTimeout(() => {
  mapRef.current?.invalidateSize(true);

  if (bounds) {
    mapRef.current.fitBounds(bounds, {
      padding: [24, 24],
      maxZoom: 15,
      animate: false,
    });
  }
}, 300);
