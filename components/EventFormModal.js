
import { useRef } from "react";

export default function EventFormModal({
  form,
  setForm,
  hasLocation,
  setRouteMode,
  setRouteError,
}) {
  const fileInputRef = useRef(null);

  const selectUploadRoute = () => {
    if (!hasLocation) {
      setRouteError("Fill in Location before uploading a route.");
      return;
    }

    setRouteMode("upload");

    setForm({
      ...form,
      route_points: null,
      route_distance_km: null,
      elevation_gain_m: null,
    });

    // open file picker immediately
    setTimeout(() => {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }, 50);
  };

  return (
    <>
      <button type="button" onClick={selectUploadRoute}>
        Upload Route
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".gpx"
        style={{ display: "none" }}
        onChange={(e) =>
          setForm({
            ...form,
            gpxFile: e.target.files?.[0] || null,
          })
        }
      />
    </>
  );
}
