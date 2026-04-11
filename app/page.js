"use client";
import { useState } from "react";

export default function Home() {
  const m = true;

  const sporten = [
    "Hardlopen",
    "Wielrennen",
    "Trailrun",
    "Mountainbike",
    "Wandelen",
  ];

  const afstandRanges = {
    Hardlopen: { min: 1, max: 50 },
    Wielrennen: { min: 10, max: 250 },
    Trailrun: { min: 1, max: 50 },
    Mountainbike: { min: 5, max: 120 },
    Wandelen: { min: 1, max: 40 },
  };

  const leeg = {
    titel: "",
    sport: "Hardlopen",
    afstand: 10,
    datum: "",
    tijd: "",
    locatie: "",
  };

  const [t, s] = useState([
    {
      id: 1,
      titel: "Duurloop Brunssummerheide",
      sport: "Hardlopen",
      afstand: 10,
      datum: "2026-05-17",
      tijd: "09:00",
      locatie: "Brunssummerheide",
      deelnemers: ["Maurice", "Ronald"],
    },
    {
      id: 2,
      titel: "Racefiets Parkstad",
      sport: "Wielrennen",
      afstand: 55,
      datum: "2026-05-18",
      tijd: "10:00",
      locatie: "Landgraaf",
      deelnemers: ["Ronald"],
    },
  ]);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [f, setF] = useState(leeg);

  const range = afstandRanges[f.sport] || { min: 1, max: 50 };

  const fmtDatum = (d) => {
    if (!d) return "";
    const x = new Date(d);
    return x.toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const mee = (id) =>
    s(
      t.map((x) =>
        x.id === id && !x.deelnemers.includes("Jij")
          ? { ...x, deelnemers: [...x.deelnemers, "Jij"] }
          : x
      )
    );

  const del = (id) =>
    confirm("Training verwijderen?") && s(t.filter((x) => x.id !== id));

  const nieuw = () => {
    setEditId(null);
    setF(leeg);
    setOpen(true);
  };

  const bewerk = (id) => {
    const x = t.find((a) => a.id === id);
    if (!x) return;
    setEditId(id);
    setF({
      titel: x.titel,
      sport: x.sport,
      afstand: x.afstand || afstandRanges[x.sport]?.min || 1,
      datum: x.datum,
      tijd: x.tijd,
      locatie: x.locatie,
    });
    setOpen(true);
  };

const save = (e) => {
    e.preventDefault();

    if (!f.titel || !f.datum || !f.tijd || !f.locatie) {
      alert("Vul alle verplichte velden in.");
      return;
    }

    if (editId) {
      s(t.map((x) => (x.id === editId ? { ...x, ...f } : x)));
    } else {
      s([{ id: Date.now(), ...f, deelnemers: [] }, ...t]);
    }

    setOpen(false);
    setEditId(null);
    setF(leeg);
  };

  const agenda = (x) => {
    const start = `${x.datum.replaceAll("-", "")}T${x.tijd.replace(":", "")}00`;
    const eindDate = new Date(`${x.datum}T${x.tijd}:00`);
    eindDate.setHours(eindDate.getHours() + 1);

    const yyyy = eindDate.getFullYear();
    const mm = String(eindDate.getMonth() + 1).padStart(2, "0");
    const dd = String(eindDate.getDate()).padStart(2, "0");
    const hh = String(eindDate.getHours()).padStart(2, "0");
    const mi = String(eindDate.getMinutes()).padStart(2, "0");
    const end = `${yyyy}${mm}${dd}T${hh}${mi}00`;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `SUMMARY:${x.titel}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `LOCATION:${x.locatie}`,
      `DESCRIPTION:${x.sport} training via Endurance`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${x.titel.replace(/\s+/g, "-").toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maps = (locatie) => {
    const q = encodeURIComponent(locatie);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
  };

  return (
    <main style={app}>
      <header style={header}>
        <img
          src="/logo-endurance.png"
          alt="Endurance"
          style={{ height: 64, width: "auto", maxWidth: "82vw" }}
        />
      </header>

      <section style={hero}>
        <div style={heroBadge}>Train samen</div>
        <h1 style={heroTitle}>Vind trainingen en sluit direct aan</h1>
        <p style={heroText}>
          Endurance brengt sporters samen rond geplande trainingen.
        </p>
      </section>

      {open && (
        <div style={overlay}>
          <form onSubmit={save} style={modal}>
            <div style={modalTop}>
              <h2 style={{ margin: 0, fontSize: 24 }}>
                {editId ? "Training bewerken" : "Training toevoegen"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEditId(null);
                  setF(leeg);
                }}
                style={closeBtn}
              >
                ✕
              </button>
            </div>
<div style={grid}>
              <input
                value={f.titel}
                onChange={(e) => setF({ ...f, titel: e.target.value })}
                placeholder="Titel"
                style={veld}
              />

              <div>
                <div style={label}>Kies sport</div>
                <select
                  value={f.sport}
                  onChange={(e) =>
                    setF({
                      ...f,
                      sport: e.target.value,
                      afstand: afstandRanges[e.target.value].min,
                    })
                  }
                  style={veld}
                >
                  {sporten.map((sport) => (
                    <option key={sport} value={sport}>
                      {sport}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={label}>Afstand: {f.afstand} km</div>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step="1"
                  value={f.afstand}
                  onChange={(e) =>
                    setF({ ...f, afstand: Number(e.target.value) })
                  }
                  style={{ width: "100%" }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    opacity: 0.6,
                    marginTop: 4,
                  }}
                >
                  <span>{range.min} km</span>
                  <span>{range.max} km</span>
                </div>
              </div>

              <div>
                <div style={label}>Datum</div>
                <input
                  type="date"
                  value={f.datum}
                  onChange={(e) => setF({ ...f, datum: e.target.value })}
                  style={veld}
                />
              </div>

              <div>
                <div style={label}>Tijd</div>
                <input
                  type="time"
                  value={f.tijd}
                  onChange={(e) => setF({ ...f, tijd: e.target.value })}
                  style={veld}
                />
              </div>

              <input
                value={f.locatie}
                onChange={(e) => setF({ ...f, locatie: e.target.value })}
                placeholder="Locatie"
                style={veld}
              />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="submit" style={primaryBtn}>
                  Opslaan
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setEditId(null);
                    setF(leeg);
                  }}
                  style={secondaryBtn}
                >
                  Annuleren
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <section style={{ paddingBottom: 110 }}>
        {t.map((x) => (
          <div key={x.id} style={card}>
            <div style={sportTag}>{x.sport}</div>
            <h2 style={cardTitle}>{x.titel}</h2>

            <div style={afstandText}>{x.afstand} km</div>

            <div style={meta}>
              <div>📅 {fmtDatum(x.datum)}</div>
              <div>⏰ {x.tijd}</div>

              <button
                onClick={() => maps(x.locatie)}
                style={{
                  background: "transparent",
                  color: "white",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                📍 {x.locatie}
              </button>

              <div style={{ opacity: 0.75 }}>
                Deelnemers: {x.deelnemers.length}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {x.deelnemers.map((naam, i) => (
                  <span
                    key={i}
                    style={{
                      background: "#1f1f1f",
                      border: "1px solid rgba(255,255,255,0.08)",
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontSize: 13,
                    }}
                  >
                    {naam}
                  </span>
                ))}
              </div>
            </div>

            <div style={btnRow}>
              <button onClick={() => mee(x.id)} style={primaryBtnSmall}>
                Ik doe mee
              </button>

              <button onClick={() => agenda(x)} style={secondaryBtnSmall}>
                Zet in agenda
              </button>

              {m && (
                <button onClick={() => bewerk(x.id)} style={secondaryBtnSmall}>
                  Bewerk
                </button>
              )}

              {m && (
                <button onClick={() => del(x.id)} style={dangerBtnSmall}>
                  Verwijder
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

{m && (
        <button onClick={nieuw} style={fab}>
          +
        </button>
      )}
    </main>
  );
}

const app = {
  background: "#050505",
  color: "white",
  minHeight: "100vh",
  padding: 16,
  fontFamily: "sans-serif",
};

const header = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  display: "flex",
  justifyContent: "center",
  padding: "12px 0 18px",
  background: "linear-gradient(to bottom, #050505 85%, rgba(5,5,5,0))",
};

const hero = {
  background: "linear-gradient(180deg, #111 0%, #0b0b0b 100%)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 24,
  padding: 20,
  marginBottom: 18,
};

const heroBadge = {
  display: "inline-block",
  background: "rgba(228,239,22,0.14)",
  color: "#e4ef16",
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: "bold",
  marginBottom: 12,
};

const heroTitle = { margin: 0, fontSize: 28, lineHeight: 1.1 };
const heroText = { opacity: 0.72, marginBottom: 0, marginTop: 10 };
const label = { marginBottom: 6, opacity: 0.82, fontSize: 14 };

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.72)",
  zIndex: 20,
  padding: 16,
  display: "flex",
  alignItems: "center",
};

const modal = {
  width: "100%",
  background: "#111",
  borderRadius: 24,
  padding: 18,
  border: "1px solid rgba(255,255,255,0.08)",
};

const modalTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 14,
};

const closeBtn = {
  background: "#1d1d1d",
  color: "white",
  border: "none",
  width: 36,
  height: 36,
  borderRadius: 999,
};

const grid = { display: "grid", gap: 12 };

const veld = {
  width: "100%",
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: "14px 12px",
  borderRadius: 12,
  boxSizing: "border-box",
};

const card = {
  background: "#111",
  padding: 20,
  borderRadius: 24,
  marginBottom: 16,
  border: "1px solid rgba(255,255,255,0.05)",
};

const sportTag = {
  display: "inline-block",
  background: "rgba(228,239,22,0.12)",
  color: "#e4ef16",
  padding: "7px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: "bold",
  marginBottom: 10,
};

const cardTitle = { fontSize: 26, marginTop: 0, marginBottom: 6 };

const afstandText = {
  fontSize: 16,
  fontWeight: "600",
  color: "#cfd3d6",
  marginBottom: 14,
};

const meta = { display: "grid", gap: 8, marginBottom: 16, opacity: 0.95 };

const btnRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const primaryBtn = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: "bold",
};

const secondaryBtn = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const primaryBtnSmall = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: "bold",
};

const secondaryBtnSmall = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
};

const dangerBtnSmall = {
  background: "#5a1f1f",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
};

const fab = {
  position: "fixed",
  right: 18,
  bottom: 22,
  width: 62,
  height: 62,
  borderRadius: 999,
  border: "none",
  background: "#e4ef16",
  color: "black",
  fontSize: 34,
  fontWeight: "bold",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
};













