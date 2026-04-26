import { useState } from "react";
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
  const [routeMode, setRouteMode] = useState(null);

  const canUseRouteBuilder =
    userRole === "moderator" || userRole === "organizer";

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

  const selectGenerateRoute = () => {
    setRouteMode("generate");

    setForm({
      ...form,
      gpxFile: null,
      gpx_file_path: null,
      gpx_file_url: null,
      gpx_uploaded_by: null,
    });
  };

  const selectUploadRoute = () => {
    setRouteMode("upload");

    setForm({
      ...form,
      route_points: null,
      route_distance_km: null,
      elevation_gain_m: null,
    });
  };

  const clearRouteSelection = () => {
    setRouteMode(null);

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

          <input
            value={form.location}
            onChange={(e) =>
              setForm({
                ...form,
                location: e.target.value,
              })
            }
            placeholder="Location"
            style={field}
          />

          {showGpxUpload && (
            <div
              style={{
                background: "#0b0b0b",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 18,
                padding: 14,
                display: "grid",
                gap: 12,
              }}
            >
              <div>
                <div style={{ ...label, color: "#e4ef16", fontWeight: 700 }}>
                  Route
                </div>
                <div style={helperText}>
                  Generate a route automatically or upload your own GPX file.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {canUseRouteBuilder && (
                  <button
                    type="button"
                    onClick={selectGenerateRoute}
                    style={
                      routeMode === "generate"
                        ? activeRouteButton
                        : inactiveRouteButton
                    }
                  >
                    Generate Route
                  </button>
                )}

                <button
                  type="button"
                  onClick={selectUploadRoute}
                  style={
                    routeMode === "upload"
                      ? activeRouteButton
                      : inactiveRouteButton
                  }
                >
                  Upload Route
                </button>

                {(routeMode || form.gpxFile || form.route_points) && (
                  <button
                    type="button"
                    onClick={clearRouteSelection}
                    style={secondaryBtn}
                  >
                    Clear Route
                  </button>
                )}
              </div>

              {!canUseRouteBuilder && (
                <div style={helperText}>
                  Route generation is available for moderators and organizers.
                </div>
              )}

              {routeMode === "upload" && (
                <div>
                  <div style={label}>Upload GPX route</div>

                  <input
                    type="file"
                    accept=".gpx"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        gpxFile: e.target.files?.[0] || null,
                      })
                    }
                    style={field}
                  />

                  {form.gpxFile && (
                    <div style={helperText}>
                      Selected GPX: {form.gpxFile.name}
                    </div>
                  )}

                  {form.gpx_file_url && !form.gpxFile && (
                    <div style={helperText}>
                      Current GPX file is already attached.
                    </div>
                  )}

                  <div style={helperText}>
                    When a GPX route is attached, distance is calculated from
                    the route automatically.
                  </div>
                </div>
              )}

              {routeMode === "generate" && canUseRouteBuilder && (
                <RouteBuilder
                  form={form}
                  setForm={setForm}
                  canUseRouteBuilder={canUseRouteBuilder}
                />
              )}

              {!routeMode && (form.gpx_file_url || form.route_points) && (
                <div style={helperText}>
                  This event already has a route attached.
                </div>
              )}
            </div>
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
