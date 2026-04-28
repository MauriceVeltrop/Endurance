import { useRef, useState } from "react";
import { SPORTS } from "../lib/sports";
import RouteBuilder from "./RouteBuilder";
import {
  closeBtn,
  field,
  grid,
  helperText,
  label,
  modal,
  modalTop,
  overlay,
  primaryBtn,
  rangeRow,
  secondaryBtn,
  sportChip,
  sportChipSelected,
  sportsPicker,
} from "../lib/enduranceStyles";

export default function EventFormModal({
  editId,
  form,
  setForm,
  saveEvent,
  closeModal,
  savingEvent,
  showDistance,
  activeDistanceRange,
  showGpxUpload,
  toggleSportInForm,
  distanceLocked = false,
  distanceLockText = "",
  userRole = "user",
}) {
  const fileInputRef = useRef(null);

  const initialRouteMode =
    form.gpxFile || form.gpx_file_url
      ? "upload"
      : form.route_points
      ? "generate"
      : null;

  const [routeMode, setRouteMode] = useState(initialRouteMode);
  const [locating, setLocating] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [createRouteTrigger, setCreateRouteTrigger] = useState(0);

  const canUseRouteBuilder =
    userRole === "moderator" || userRole === "organizer";

  const hasLocation = !!String(form.location || "").trim();

  const routeButtonBase = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  };

  const activeRouteButton = {
    ...routeButtonBase,
    background: "#e4ef16",
    color: "black",
  };

  const inactiveRouteButton = {
    ...routeButtonBase,
    background: "#242424",
    color: "white",
  };

  const disabledRouteButton = {
    ...inactiveRouteButton,
    opacity: 0.45,
    cursor: "not-allowed",
  };

  const isCrossFitEvent = form.sports?.includes("crossfit");

  const wodTemplates = [
    {
      title: "Endurance WOD - Engine Builder",
      type: "AMRAP 20",
      workout: [
        "10 calorie row / bike",
        "12 kettlebell swings",
        "10 burpees",
        "12 wall balls",
      ],
      notes: "Steady pacing. Keep moving, avoid redlining in the first 10 minutes.",
    },
    {
      title: "Endurance WOD - Power & Pace",
      type: "For Time - 5 Rounds",
      workout: [
        "400 m run",
        "15 box jumps",
        "12 dumbbell snatches",
        "10 push-ups",
      ],
      notes: "Target: controlled intensity. Scale running to 250 m if needed.",
    },
    {
      title: "Endurance WOD - Strength Circuit",
      type: "EMOM 24",
      workout: [
        "Min 1: 12/10 calorie bike",
        "Min 2: 10 deadlifts",
        "Min 3: 12 sit-ups",
        "Min 4: Rest",
      ],
      notes: "Choose a deadlift weight that stays technically clean for all rounds.",
    },
    {
      title: "Endurance WOD - Team Up",
      type: "Partner WOD - 30 min cap",
      workout: [
        "1000 m row",
        "80 wall balls",
        "60 kettlebell swings",
        "40 burpees",
        "1000 m row",
      ],
      notes: "Split reps as needed. One athlete works at a time.",
    },
  ];

  const createWod = () => {
    const template =
      wodTemplates[Math.floor(Math.random() * wodTemplates.length)];

    const description = [
      template.type,
      "",
      "Workout:",
      ...template.workout.map((item) => `• ${item}`),
      "",
      "Coaching notes:",
      template.notes,
      "",
      "Scaling:",
      "Adjust load, reps or movement difficulty to match your current level.",
    ].join("\n");

    setForm({
      ...form,
      title: form.title?.trim() ? form.title : template.title,
      description,
      distance: null,
      gpxFile: null,
      gpx_file_path: null,
      gpx_file_url: null,
      route_points: null,
      route_distance_km: null,
      elevation_gain_m: null,
      gpx_uploaded_by: null,
    });
  };

  const useCurrentLocation = () => {
    setRouteError("");

    if (!navigator.geolocation) {
      setRouteError("Current location is not supported by this browser.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lon = position.coords.longitude;
        const lat = position.coords.latitude;

        setForm({
          ...form,
          location: "Current location",
          startCoordinates: [lon, lat],
        });

        setLocating(false);
      },
      () => {
        setLocating(false);
        setRouteError("Could not access your current location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  };

  const createRouteNow = () => {
    setRouteError("");

    if (!hasLocation) {
      setRouteError("Fill in Location before creating a route.");
      return;
    }

    setRouteMode("generate");

    setForm({
      ...form,
      gpxFile: null,
      gpx_file_path: null,
      gpx_file_url: null,
      gpx_uploaded_by: null,
    });

    setCreateRouteTrigger((value) => value + 1);
  };

  const uploadRouteNow = () => {
    setRouteError("");

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

    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  const clearRouteSelection = () => {
    setRouteError("");
    setRouteMode(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setForm({
      ...form,
      gpxFile: null,
      gpx_file_path: null,
      gpx_file_url: null,
      route_points: null,
      route_distance_km: null,
      elevation_gain_m: null,
      gpx_uploaded_by: null,
    });
  };

  return (
    <div style={overlay}>
      <form onSubmit={saveEvent} style={modal}>
        <div style={modalTop}>
          <h2 style={{ margin: 0, fontSize: 24 }}>
            {editId ? "Edit Event" : "Add Event"}
          </h2>

          <button type="button" onClick={closeModal} style={closeBtn}>
            ✕
          </button>
        </div>

        <div style={grid}>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Title"
            style={field}
          />

          <div>
            <div style={label}>Choose sports</div>

            <div style={sportsPicker}>
              {SPORTS.map((sport) => {
                const selected = form.sports.includes(sport.id);

                return (
                  <button
                    key={sport.id}
                    type="button"
                    onClick={() => toggleSportInForm(sport.id)}
                    style={selected ? sportChipSelected : sportChip}
                  >
                    <span style={{ marginRight: 6 }}>{sport.icon}</span>
                    {sport.label}
                  </button>
                );
              })}
            </div>

            {isCrossFitEvent && (
              <div
                style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 18,
                  border: "1px solid rgba(228,239,22,0.22)",
                  background:
                    "linear-gradient(135deg, rgba(228,239,22,0.12), rgba(255,255,255,0.04))",
                }}
              >
                <div
                  style={{
                    color: "#e4ef16",
                    fontSize: 14,
                    fontWeight: 900,
                    marginBottom: 6,
                  }}
                >
                  CrossFit WOD
                </div>

                <div style={{ ...helperText, marginBottom: 10 }}>
                  Generate a ready-to-use Workout of the Day for this CrossFit event.
                </div>

                <button
                  type="button"
                  onClick={createWod}
                  style={{
                    ...primaryBtn,
                    width: "100%",
                    borderRadius: 16,
                    minHeight: 48,
                  }}
                >
                  Create WOD
                </button>
              </div>
            )}
          </div>

          {showDistance && (
            <div>
              <div style={label}>
                Distance: {Number(form.distance || 0).toFixed(2)} km
              </div>

              <input
                type="range"
                min={activeDistanceRange.min}
                max={activeDistanceRange.max}
                step="0.01"
                value={form.distance || activeDistanceRange.min}
                disabled={distanceLocked}
                onChange={(e) =>
                  setForm({
                    ...form,
                    distance: Number(e.target.value),
                  })
                }
                style={{
                  width: "100%",
                  opacity: distanceLocked ? 0.45 : 1,
                }}
              />

              <div style={rangeRow}>
                <span>{activeDistanceRange.min} km</span>
                <span>{activeDistanceRange.max} km</span>
              </div>

              {distanceLocked && distanceLockText && (
                <div style={helperText}>{distanceLockText}</div>
              )}
            </div>
          )}

          <div>
            <div style={label}>Date</div>
            <input
              type="date"
              value={form.date}
              onChange={(e) =>
                setForm({
                  ...form,
                  date: e.target.value,
                })
              }
              style={field}
            />
          </div>

          <div>
            <div style={label}>Time</div>
            <input
              type="time"
              value={form.time}
              onChange={(e) =>
                setForm({
                  ...form,
                  time: e.target.value,
                })
              }
              style={field}
            />
          </div>

          <div>
            <div style={label}>Location</div>

            <input
              value={form.location || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  location: e.target.value,
                  startCoordinates: null,
                })
              }
              placeholder="Example: Schanserweg Landgraaf"
              style={field}
            />

            {showGpxUpload && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".gpx"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0] || null;

                    setRouteMode("upload");

                    setForm({
                      ...form,
                      gpxFile: selectedFile,
                      route_points: null,
                      route_distance_km: null,
                      elevation_gain_m: null,
                    });
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    marginTop: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={useCurrentLocation}
                    style={secondaryBtn}
                    disabled={locating}
                  >
                    {locating ? "Locating..." : "Use Current Location"}
                  </button>

                  {canUseRouteBuilder && (
                    <button
                      type="button"
                      onClick={createRouteNow}
                      style={
                        !hasLocation
                          ? disabledRouteButton
                          : routeMode === "generate"
                          ? activeRouteButton
                          : inactiveRouteButton
                      }
                    >
                      Create Route
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={uploadRouteNow}
                    style={
                      !hasLocation
                        ? disabledRouteButton
                        : routeMode === "upload"
                        ? activeRouteButton
                        : inactiveRouteButton
                    }
                  >
                    Upload Route
                  </button>

                  {(routeMode ||
                    form.gpxFile ||
                    form.route_points ||
                    form.gpx_file_url) && (
                    <button
                      type="button"
                      onClick={clearRouteSelection}
                      style={secondaryBtn}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </>
            )}

            {routeError && (
              <div style={{ ...helperText, color: "#ffb4b4" }}>
                {routeError}
              </div>
            )}

            {showGpxUpload && (
              <div style={helperText}>
                Location is used as the event location and as the start point
                for generated routes.
              </div>
            )}

            {routeMode === "upload" && form.gpxFile && (
              <div style={helperText}>Selected GPX: {form.gpxFile.name}</div>
            )}

            {routeMode === "upload" && form.gpx_file_url && !form.gpxFile && (
              <div style={helperText}>Current GPX file is already attached.</div>
            )}
          </div>

          {showGpxUpload && routeMode === "generate" && canUseRouteBuilder && (
            <RouteBuilder
              form={form}
              setForm={setForm}
              canUseRouteBuilder={canUseRouteBuilder}
              createRouteTrigger={createRouteTrigger}
            />
          )}

          <div>
            <div style={label}>Description</div>

            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
              placeholder="Extra information about the training"
              style={{
                ...field,
                minHeight: 110,
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={primaryBtn} disabled={savingEvent}>
              {savingEvent ? "Saving..." : "Save"}
            </button>

            <button type="button" onClick={closeModal} style={secondaryBtn}>
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
