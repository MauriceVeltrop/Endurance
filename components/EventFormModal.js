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
  const [selectedWodEquipment, setSelectedWodEquipment] = useState([
    "bodyweight",
    "dumbbells",
    "kettlebell",
  ]);

  const wodEquipmentOptions = [
    { id: "bodyweight", label: "Bodyweight" },
    { id: "dumbbells", label: "Dumbbells" },
    { id: "kettlebell", label: "Kettlebell" },
    { id: "barbell", label: "Barbell" },
    { id: "box", label: "Box" },
    { id: "rower", label: "Rower" },
    { id: "bike", label: "Bike" },
    { id: "wallball", label: "Wall Ball" },
    { id: "jumprope", label: "Jump Rope" },
    { id: "pullupbar", label: "Pull-up Bar" },
  ];


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

  const movementPool = {
    bodyweight: [
      "10 burpees",
      "15 air squats",
      "12 push-ups",
      "20 sit-ups",
      "16 alternating lunges",
      "30 second plank",
    ],
    dumbbells: [
      "12 dumbbell snatches",
      "14 dumbbell box step-overs",
      "12 dumbbell push press",
      "16 dumbbell walking lunges",
      "10 dumbbell thrusters",
    ],
    kettlebell: [
      "15 kettlebell swings",
      "12 goblet squats",
      "10 kettlebell clean and press",
      "16 kettlebell reverse lunges",
    ],
    barbell: [
      "10 deadlifts",
      "8 hang power cleans",
      "8 front squats",
      "8 push jerks",
      "10 barbell cycling reps",
    ],
    box: [
      "15 box jumps",
      "16 box step-ups",
      "12 burpee box jump-overs",
    ],
    rower: [
      "250 m row",
      "12/10 calorie row",
      "500 m row",
    ],
    bike: [
      "15/12 calorie bike",
      "30 second hard bike sprint",
      "1000 m bike",
    ],
    wallball: [
      "18 wall balls",
      "15 wall balls",
      "12 wall ball shots",
    ],
    jumprope: [
      "50 single unders",
      "30 double unders",
      "60 rope skips",
    ],
    pullupbar: [
      "8 pull-ups",
      "10 ring rows",
      "12 hanging knee raises",
      "8 toes-to-bar",
    ],
  };

  const wodFormats = [
    { type: "AMRAP 18", rounds: 4, note: "Steady pacing. Keep moving without redlining early." },
    { type: "AMRAP 22", rounds: 5, note: "Find a sustainable rhythm and keep transitions short." },
    { type: "For Time - 5 Rounds", rounds: 4, note: "Move clean and fast. Scale reps before form breaks." },
    { type: "EMOM 24", rounds: 4, note: "Use the remaining time in each minute to recover." },
    { type: "Partner WOD - 30 min cap", rounds: 5, note: "Split reps as needed. One athlete works at a time." },
  ];

  const toggleWodEquipment = (equipmentId) => {
    setSelectedWodEquipment((current) => {
      if (current.includes(equipmentId)) {
        const next = current.filter((id) => id !== equipmentId);
        return next.length ? next : current;
      }

      return [...current, equipmentId];
    });
  };

  const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

  const createWod = () => {
    const availableMovements = selectedWodEquipment.flatMap(
      (equipmentId) => movementPool[equipmentId] || []
    );

    const movementSource = availableMovements.length
      ? availableMovements
      : movementPool.bodyweight;

    const format = pickRandom(wodFormats);
    const movements = [];

    while (movements.length < format.rounds) {
      const movement = pickRandom(movementSource);

      if (!movements.includes(movement)) {
        movements.push(movement);
      }

      if (movementSource.length <= movements.length) break;
    }

    const equipmentLabels = wodEquipmentOptions
      .filter((item) => selectedWodEquipment.includes(item.id))
      .map((item) => item.label)
      .join(", ");

    const description = [
      format.type,
      "",
      `Equipment: ${equipmentLabels || "Bodyweight"}`,
      "",
      "Workout:",
      ...movements.map((item) => `• ${item}`),
      "",
      "Coaching notes:",
      format.note,
      "",
      "Scaling:",
      "Adjust load, reps, range of motion or movement difficulty to match your current level.",
    ].join("\n");

    setForm({
      ...form,
      title: form.title?.trim() ? form.title : `CrossFit WOD - ${format.type}`,
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
                  Select available equipment and generate a ready-to-use Workout of the Day.
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  {wodEquipmentOptions.map((equipment) => {
                    const selected = selectedWodEquipment.includes(equipment.id);

                    return (
                      <button
                        key={equipment.id}
                        type="button"
                        onClick={() => toggleWodEquipment(equipment.id)}
                        style={{
                          border: selected
                            ? "1px solid rgba(228,239,22,0.75)"
                            : "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 999,
                          padding: "8px 11px",
                          background: selected
                            ? "rgba(228,239,22,0.18)"
                            : "rgba(255,255,255,0.06)",
                          color: selected ? "#e4ef16" : "rgba(255,255,255,0.82)",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {equipment.label}
                      </button>
                    );
                  })}
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
