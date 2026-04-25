
import { SPORTS } from "../lib/sports";
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
}) {
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
              <div style={label}>Distance: {form.distance} km</div>
              <input
                type="range"
                min={activeDistanceRange.min}
                max={activeDistanceRange.max}
                step="1"
                value={form.distance}
                onChange={(e) =>
                  setForm({ ...form, distance: Number(e.target.value) })
                }
                style={{ width: "100%" }}
              />
              <div style={rangeRow}>
                <span>{activeDistanceRange.min} km</span>
                <span>{activeDistanceRange.max} km</span>
              </div>
            </div>
          )}

          <div>
            <div style={label}>Date</div>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              style={field}
            />
          </div>

          <div>
            <div style={label}>Time</div>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              style={field}
            />
          </div>

          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Location"
            style={field}
          />

          {showGpxUpload && (
            <div>
              <div style={label}>GPX route</div>

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
                <div style={helperText}>Selected GPX: {form.gpxFile.name}</div>
              )}

              {form.gpx_file_url && !form.gpxFile && (
                <div style={helperText}>Current GPX file is already attached.</div>
              )}
            </div>
          )}

          <div>
            <div style={label}>Description</div>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Extra information about the training"
              style={{ ...field, minHeight: 110, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={primaryBtn}>
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
