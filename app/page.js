"use client";
import { useState } from "react";

export default function Home() {
  const m = true;
  const [t, s] = useState([
    { id: 1, titel: "Duurloop Brunssummerheide", sport: "Hardlopen", datum: "17 mei", tijd: "09:00", locatie: "Brunssummerheide", deelnemers: ["Maurice", "Ronald"] },
    { id: 2, titel: "Racefiets Parkstad", sport: "Fietsen", datum: "18 mei", tijd: "10:00", locatie: "Landgraaf", deelnemers: ["Ronald"] }
  ]);
  const mee = (id) => s(t.map(x => x.id === id && !x.deelnemers.includes("Jij") ? { ...x, deelnemers: [...x.deelnemers, "Jij"] } : x));
  const del = (id) => confirm("Training verwijderen?") && s(t.filter(x => x.id !== id));

  return <main style={{ background:"#050505", color:"white", minHeight:"100vh", padding:20, fontFamily:"sans-serif" }}>
    {m && <button onClick={() => alert("Training toevoegen")} style={{ background:"#e4ef16", color:"black", border:"none", padding:"12px 16px", borderRadius:12, fontWeight:"bold", marginBottom:20 }}>+ Training toevoegen</button>}
    <header style={{ display:"flex", justifyContent:"center", marginBottom:25 }}>
      <img src="/logo-endurance.png" alt="Endurance" style={{ height:70, width:"auto" }} />
    </header>
    {t.map(x => <div key={x.id} style={{ background:"#111", padding:20, borderRadius:24, marginBottom:20 }}>
      <h2 style={{ fontSize:28 }}>{x.titel}</h2>
      <p>{x.sport}</p><p>{x.datum} · {x.tijd}</p><p>{x.locatie}</p><p style={{ opacity:.7 }}>Deelnemers: {x.deelnemers.length}</p>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
        <button onClick={() => mee(x.id)} style={{ background:"#e4ef16", color:"black", border:"none", padding:"10px 14px", borderRadius:10, fontWeight:"bold" }}>Ik doe mee</button>
        {m && <button onClick={() => alert("Training bewerken")} style={{ background:"#2a2a2a", color:"white", border:"none", padding:"10px 14px", borderRadius:10 }}>Bewerk</button>}
        {m && <button onClick={() => del(x.id)} style={{ background:"#5a1f1f", color:"white", border:"none", padding:"10px 14px", borderRadius:10 }}>Verwijder</button>}
      </div>
    </div>)}
  </main>;
}
