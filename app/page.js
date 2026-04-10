"use client";

import { useMemo, useState } from "react";

export default function Home() {
  const [pagina, setPagina] = useState("home");
  const [geselecteerdeTraining, setGeselecteerdeTraining] = useState(null);

  const [trainingen, setTrainingen] = useState([
    {
      id: 1,
      titel: "Duurloop Brunssummerheide",
      sport: "Hardlopen",
      datum: "17 mei 2026",
      tijd: "09:00",
      locatie: "Brunssummerheide",
      afstand: "10 km",
      tempo: "5:30/km",
      niveau: "Gemiddeld",
      organisator: "Maurice",
      deelnemers: ["Maurice", "Ronald", "Deliana"],
      beschrijving:
        "Rustige duurloop door de Brunssummerheide. Aansluiten kan vanaf gemiddeld niveau.",
    },
    {
      id: 2,
      titel: "Racefietsrit Parkstad",
      sport: "Fietsen",
      datum: "18 mei 2026",
      tijd: "10:00",
      locatie: "Landgraaf",
      afstand: "55 km",
      tempo: "30 km/u",
      niveau: "Gevorderd",
      organisator: "Ronald",
      deelnemers: ["Ronald", "Mark"],
      beschrijving:
        "Mooie rit door Parkstad met enkele klimmetjes. Racefiets aanbevolen.",
    },
    {
      id: 3,
      titel: "Trailrun Schinveld",
      sport: "Trailrun",
      datum: "19 mei 2026",
      tijd: "08:30",
      locatie: "Schinveldse Bossen",
      afstand: "12 km",
      tempo: "6:00/km",
      niveau: "Gemiddeld",
      organisator: "Deliana",
      deelnemers: ["Deliana", "Sven", "Kim", "Patrick"],
      beschrijving:
        "Afwisselend trailparcours met bospaden en lichte hoogteverschillen.",
    },
  ]);

  const [zoekterm, setZoekterm] = useState("");

  const [nieuweTraining, setNieuweTraining] = useState({
    titel: "",
    sport: "Hardlopen",
    datum: "",
    tijd: "",
    locatie: "",
    afstand: "",
    tempo: "",
    niveau: "Beginner",
    organisator: "Maurice",
    beschrijving: "",
  });

  const gefilterdeTrainingen = useMemo(() => {
    const term = zoekterm.toLowerCase().trim();

    if (!term) return trainingen;

    return trainingen.filter((training) => {
      return (
        training.titel.toLowerCase().includes(term) ||
        training.sport.toLowerCase().includes(term) ||
        training.locatie.toLowerCase().includes(term) ||
        training.niveau.toLowerCase().includes(term)
      );
    });
  }, [zoekterm, trainingen]);

  function openTraining(training) {
    setGeselecteerdeTraining(training);
    setPagina("detail");
  }

  function doeMee() {
    if (!geselecteerdeTraining) return;

    const naam = "Jij";
    const bestaatAl = geselecteerdeTraining.deelnemers.includes(naam);

    if (bestaatAl) return;

    const bijgewerkt = trainingen.map((training) =>
      training.id === geselecteerdeTraining.id
        ? {
            ...training,
            deelnemers: [...training.deelnemers, naam],
          }
        : training
    );

    setTrainingen(bijgewerkt);

    const nieuweDetail = bijgewerkt.find(
      (training) => training.id === geselecteerdeTraining.id
    );
    setGeselecteerdeTraining(nieuweDetail);
  }

  function plaatsTraining(e) {
    e.preventDefault();

    if (
      !nieuweTraining.titel ||
      !nieuweTraining.datum ||
      !nieuweTraining.tijd ||
      !nieuweTraining.locatie
    ) {
      alert("Vul minimaal titel, datum, tijd en locatie in.");
      return;
    }

    const training = {
      id: Date.now(),
      ...nieuweTraining,
      deelnemers: [nieuweTraining.organisator || "Maurice"],
    };

    setTrainingen([training, ...trainingen]);
    setNieuweTraining({
      titel: "",
      sport: "Hardlopen",
      datum: "",
      tijd: "",
      locatie: "",
      afstand: "",
      tempo: "",
      niveau: "Beginner",
      organisator: "Maurice",
      beschrijving: "",
    });

    setPagina("home");
  }

  function renderHome() {
    return (
      <div className="space-y-5">
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-xl">
          <p className="mb-2 text-xs uppercase tracking-[0.22em] text-white/50">
            Endurance
          </p>
          <h1 className="text-3xl font-bold leading-tight">
            Deel trainingen. <br />
            Sluit aan.
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Vind geplande trainingen in jouw regio en train samen met andere
            duursporters.
          </p>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setPagina("plaatsen")}
              className="rounded-2xl bg-[#e4ef16] px-4 py-3 font-semibold text-black"
            >
              Training plaatsen
            </button>
            <button
              onClick={() => setPagina("profiel")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white"
            >
              Mijn profiel
            </button>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-4">
          <input
            type="text"
            value={zoekterm}
            onChange={(e) => setZoekterm(e.target.value)}
            placeholder="Zoek op locatie, sport of niveau"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
          />
        </section>

        <section className="space-y-4">
          {gefilterdeTrainingen.length === 0 ? (
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 text-white/70">
              Geen trainingen gevonden.
            </div>
          ) : (
            gefilterdeTrainingen.map((training) => (
              <button
                key={training.id}
                onClick={() => openTraining(training)}
                className="w-full rounded-[28px] border border-white/10 bg-white/5 p-5 text-left shadow-lg transition hover:bg-white/10"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#e4ef16]">
                      {training.sport}
                    </p>
                    <h2 className="mt-1 text-xl font-bold">{training.titel}</h2>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/75">
                    {training.niveau}
                  </span>
                </div>

                <div className="space-y-1 text-sm text-white/75">
                  <p>
                    <span className="text-white">Datum:</span> {training.datum}
                  </p>
                  <p>
                    <span className="text-white">Tijd:</span> {training.tijd}
                  </p>
                  <p>
                    <span className="text-white">Locatie:</span>{" "}
                    {training.locatie}
                  </p>
                  <p>
                    <span className="text-white">Afstand:</span>{" "}
                    {training.afstand || "-"}
                  </p>
                  <p>
                    <span className="text-white">Tempo:</span>{" "}
                    {training.tempo || "-"}
                  </p>
                  <p>
                    <span className="text-white">Deelnemers:</span>{" "}
                    {training.deelnemers.length}
                  </p>
                </div>

                <div className="mt-4">
                  <span className="inline-flex rounded-2xl bg-[#e4ef16] px-4 py-2 font-semibold text-black">
                    Bekijk training
                  </span>
                </div>
              </button>
            ))
          )}
        </section>
      </div>
    );
  }

  function renderPlaatsen() {
    return (
      <form
        onSubmit={plaatsTraining}
        className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-xl"
      >
        <h1 className="text-2xl font-bold">Training plaatsen</h1>

        <div>
          <label className="mb-2 block text-sm text-white/75">Titel</label>
          <input
            type="text"
            value={nieuweTraining.titel}
            onChange={(e) =>
              setNieuweTraining({ ...nieuweTraining, titel: e.target.value })
            }
            placeholder="Bijv. Duurloop Brunssummerheide"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-white/75">Sport</label>
          <select
            value={nieuweTraining.sport}
            onChange={(e) =>
              setNieuweTraining({ ...nieuweTraining, sport: e.target.value })
            }
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
          >
            <option>Hardlopen</option>
            <option>Fietsen</option>
            <option>Wandelen</option>
            <option>Trailrun</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm text-white/75">Datum</label>
            <input
              type="text"
              value={nieuweTraining.datum}
              onChange={(e) =>
                setNieuweTraining({
                  ...nieuweTraining,
                  datum: e.target.value,
                })
              }
              placeholder="17 mei 2026"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Tijd</label>
            <input
              type="text"
              value={nieuweTraining.tijd}
              onChange={(e) =>
                setNieuweTraining({
                  ...nieuweTraining,
                  tijd: e.target.value,
                })
              }
              placeholder="09:00"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm text-white/75">Locatie</label>
          <input
            type="text"
            value={nieuweTraining.locatie}
            onChange={(e) =>
              setNieuweTraining({
                ...nieuweTraining,
                locatie: e.target.value,
              })
            }
            placeholder="Brunssummerheide"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm text-white/75">Afstand</label>
            <input
              type="text"
              value={nieuweTraining.afstand}
              onChange={(e) =>
                setNieuweTraining({
                  ...nieuweTraining,
                  afstand: e.target.value,
                })
              }
              placeholder="10 km"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/75">Tempo</label>
            <input
              type="text"
              value={nieuweTraining.tempo}
              onChange={(e) =>
                setNieuweTraining({
                  ...nieuweTraining,
                  tempo: e.target.value,
                })
              }
              placeholder="5:30/km"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm text-white/75">Niveau</label>
          <select
            value={nieuweTraining.niveau}
            onChange={(e) =>
              setNieuweTraining({ ...nieuweTraining, niveau: e.target.value })
            }
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
          >
            <option>Beginner</option>
            <option>Gemiddeld</option>
            <option>Gevorderd</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm text-white/75">
            Beschrijving
          </label>
          <textarea
            rows={4}
            value={nieuweTraining.beschrijving}
            onChange={(e) =>
              setNieuweTraining({
                ...nieuweTraining,
                beschrijving: e.target.value,
              })
            }
            placeholder="Korte uitleg over de training"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-2xl bg-[#e4ef16] px-4 py-4 text-lg font-bold text-black"
        >
          Training plaatsen
        </button>
      </form>
    );
  }

  function renderDetail() {
    if (!geselecteerdeTraining) {
      return (
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          Geen training geselecteerd.
        </div>
      );
    }

    return (
      <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-xl">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#e4ef16]">
            {geselecteerdeTraining.sport}
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            {geselecteerdeTraining.titel}
          </h1>
        </div>

        <div className="space-y-2 text-white/80">
          <p>
            <span className="text-white font-semibold">Datum:</span>{" "}
            {geselecteerdeTraining.datum}
          </p>
          <p>
            <span className="text-white font-semibold">Tijd:</span>{" "}
            {geselecteerdeTraining.tijd}
          </p>
          <p>
            <span className="text-white font-semibold">Locatie:</span>{" "}
            {geselecteerdeTraining.locatie}
          </p>
          <p>
            <span className="text-white font-semibold">Afstand:</span>{" "}
            {geselecteerdeTraining.afstand || "-"}
          </p>
          <p>
            <span className="text-white font-semibold">Tempo:</span>{" "}
            {geselecteerdeTraining.tempo || "-"}
          </p>
          <p>
            <span className="text-white font-semibold">Niveau:</span>{" "}
            {geselecteerdeTraining.niveau}
          </p>
          <p>
            <span className="text-white font-semibold">Organisator:</span>{" "}
            {geselecteerdeTraining.organisator}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/75">
          {geselecteerdeTraining.beschrijving || "Geen beschrijving toegevoegd."}
        </div>

        <div>
          <h2 className="mb-3 text-lg font-bold">
            Deelnemers ({geselecteerdeTraining.deelnemers.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {geselecteerdeTraining.deelnemers.map((naam, index) => (
              <span
                key={`${naam}-${index}`}
                className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm"
              >
                {naam}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={doeMee}
          className="w-full rounded-2xl bg-[#e4ef16] px-4 py-4 text-lg font-bold text-black"
        >
          Ik doe mee
        </button>
      </div>
    );
  }

  function renderProfiel() {
    const mijnTrainingen = trainingen.filter(
      (training) => training.organisator === "Maurice"
    );

    return (
      <div className="space-y-4">
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-xl">
          <h1 className="text-2xl font-bold">Mijn profiel</h1>
          <p className="mt-2 text-white/75">Maurice · Parkstad · Duursport</p>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Organiseer trainingen, sluit aan bij anderen en bouw een lokale
            endurance-community op.
          </p>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-xl font-bold">Mijn geplande trainingen</h2>

          <div className="space-y-3">
            {mijnTrainingen.map((training) => (
              <button
                key={training.id}
                onClick={() => openTraining(training)}
                className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{training.titel}</p>
                    <p className="text-sm text-white/60">
                      {training.datum} · {training.tijd}
                    </p>
                  </div>
                  <span className="text-sm text-[#e4ef16]">
                    {training.deelnemers.length} deelnemers
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-4">
        <header className="mb-5 rounded-[28px] border border-white/10 bg-[#0d0d0d] p-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              <img
                src="/logo-endurance.png"
                alt="Endurance logo"
                className="h-full w-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <span className="text-2xl font-bold text-[#e4ef16]">E</span>
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-wide">ENDURANCE</h1>
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                Alles over duursport
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1">
          {pagina === "home" && renderHome()}
          {pagina === "plaatsen" && renderPlaatsen()}
          {pagina === "detail" && renderDetail()}
          {pagina === "profiel" && renderProfiel()}
        </div>

        <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[#0b0b0b]/95 backdrop-blur">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-2 px-4 py-3">
            <button
              onClick={() => setPagina("home")}
              className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
                pagina === "home"
                  ? "bg-[#e4ef16] text-black"
                  : "bg-white/5 text-white"
              }`}
            >
              Home
            </button>

            <button
              onClick={() => setPagina("plaatsen")}
              className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
                pagina === "plaatsen"
                  ? "bg-[#e4ef16] tex
