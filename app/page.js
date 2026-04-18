"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const leegEvent = {
    titel: "",
    sport: "Hardlopen",
    afstand: 10,
    datum: "",
    tijd: "",
    locatie: "",
    toelichting: "",
  };

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

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profiel, setProfiel] = useState(null);

  const [events, setEvents] = useState([]);
  const [likes, setLikes] = useState([]);
  const [comments, setComments] = useState([]);
  const [participants, setParticipants] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [f, setF] = useState(leegEvent);

  const [reactieTekst, setReactieTekst] = useState({});

  const [authMode, setAuthMode] = useState("signin");
  const [authNaam, setAuthNaam] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const range = afstandRanges[f.sport] || { min: 1, max: 50 };

  const isModerator = profiel?.role === "moderator";
  const isOrganisator = profiel?.role === "organisator";
  const magEventsBeheren = isModerator || isOrganisator;

  const fmtDatum = (d) => {
    if (!d) return "";
    const x = new Date(d);
    return x.toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const fmtDateTime = (datum, tijd) => new Date(`${datum}T${tijd}`);

  const openNieuw = () => {
    setEditId(null);
    setF(leegEvent);
    setOpen(true);
  };

  const openBewerk = (event) => {
    setEditId(event.id);
    setF({
      titel: event.titel,
      sport: event.sport,
      afstand: event.afstand,
      datum: event.datum,
      tijd: event.tijd,
      locatie: event.locatie,
      toelichting: event.toelichting || "",
    });
    setOpen(true);
  };

  const sluitModal = () => {
    setOpen(false);
    setEditId(null);
    setF(leegEvent);
  };

  const eventKaartData = useMemo(() => {
    const now = new Date();

    return [...events]
      .filter((e) => fmtDateTime(e.datum, e.tijd) >= now)
      .sort((a, b) => fmtDateTime(a.datum, a.tijd) - fmtDateTime(b.datum, b.tijd))
      .map((e) => {
        const eventLikes = likes.filter((l) => l.event_id === e.id);
        const eventComments = comments.filter((c) => c.event_id === e.id);
        const eventParticipants = participants.filter((p) => p.event_id === e.id);

        return {
          ...e,
          likes: eventLikes,
          reacties: eventComments,
          deelnemers: eventParticipants,
          isOwner: user?.id === e.creator_id,
          likedByMe: !!eventLikes.find((l) => l.user_id === user?.id),
          joinedByMe: !!eventParticipants.find((p) => p.user_id === user?.id),
        };
      });
  }, [events, likes, comments, participants, user]);






  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setProfiel(null);
      setEvents([]);
      setLikes([]);
      setComments([]);
      setParticipants([]);
      return;
    }

    laadProfiel();
    laadAlles();
  }, [user?.id]);

  const laadProfiel = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("profiel laden fout", error);
      return;
    }

    setProfiel(data);
  };

  const laadAlles = async () => {
    await Promise.all([
      laadEvents(),
      laadLikes(),
      laadComments(),
      laadParticipants(),
    ]);
  };

  const laadEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select(`
        *,
        creator_profile:profiles!events_creator_id_fkey (
          id,
          naam,
          email,
          role
        )
      `)
      .order("datum", { ascending: true })
      .order("tijd", { ascending: true });

    if (error) {
      console.error("events laden fout", error);
      return;
    }

    setEvents(data || []);
  };

  const laadLikes = async () => {
    const { data, error } = await supabase
      .from("event_likes")
      .select(`
        id,
        event_id,
        user_id,
        created_at,
        user_profile:profiles!event_likes_user_id_fkey (
          id,
          naam,
          role
        )
      `);

    if (error) {
      console.error("likes laden fout", error);
      return;
    }

    setLikes(data || []);
  };

  const laadComments = async () => {
    const { data, error } = await supabase
      .from("event_comments")
      .select(`
        id,
        event_id,
        user_id,
        tekst,
        created_at,
        user_profile:profiles!event_comments_user_id_fkey (
          id,
          naam,
          role
        )
      `)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("comments laden fout", error);
      return;
    }

    setComments(data || []);
  };

  const laadParticipants = async () => {
    const { data, error } = await supabase
      .from("event_participants")
      .select(`
        id,
        event_id,
        user_id,
        created_at,
        user_profile:profiles!event_participants_user_id_fkey (
          id,
          naam,
          role
        )
      `)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("participants laden fout", error);
      return;
    }

    setParticipants(data || []);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: {
        data: {
          naam: authNaam || authEmail.split("@")[0],
        },
      },
    });

    if (error) {
      alert(`Signup fout: ${error.message}`);
      return;
    }

    alert("Account aangemaakt. Je kunt nu inloggen.");
    setAuthMode("signin");
  };

  const handleSignIn = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });

    if (error) {
      alert(`Signin fout: ${error.message}`);
      return;
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };


const saveEvent = async (e) => {
    e.preventDefault();

    if (!f.titel || !f.datum || !f.tijd || !f.locatie) {
      alert("Vul alle verplichte velden in.");
      return;
    }

    if (!user?.id) {
      alert("Je moet ingelogd zijn.");
      return;
    }

    setSavingEvent(true);

    if (editId) {
      const { error } = await supabase
        .from("events")
        .update({
          titel: f.titel,
          sport: f.sport,
          afstand: f.afstand,
          datum: f.datum,
          tijd: f.tijd,
          locatie: f.locatie,
          toelichting: f.toelichting,
        })
        .eq("id", editId);

      if (error) {
        setSavingEvent(false);
        alert(`Opslaan mislukt: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("events").insert({
        creator_id: user.id,
        titel: f.titel,
        sport: f.sport,
        afstand: f.afstand,
        datum: f.datum,
        tijd: f.tijd,
        locatie: f.locatie,
        toelichting: f.toelichting,
      });

      if (error) {
        setSavingEvent(false);
        alert(`Aanmaken mislukt: ${error.message}`);
        return;
      }
    }

    await laadEvents();
    setSavingEvent(false);
    sluitModal();
  };

  const deleteEvent = async (id) => {
    if (!confirm("Training verwijderen?")) return;

    const { error } = await supabase.from("events").delete().eq("id", id);

    if (error) {
      alert(`Verwijderen mislukt: ${error.message}`);
      return;
    }

    await laadAlles();
  };

  const toggleDeelname = async (event) => {
    if (!user?.id) {
      alert("Je moet ingelogd zijn.");
      return;
    }

    if (event.joinedByMe) {
      const { error } = await supabase
        .from("event_participants")
        .delete()
        .eq("event_id", event.id)
        .eq("user_id", user.id);

      if (error) {
        alert(`Afmelden mislukt: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("event_participants").insert({
        event_id: event.id,
        user_id: user.id,
      });

      if (error) {
        alert(`Aanmelden mislukt: ${error.message}`);
        return;
      }
    }

    await laadParticipants();
  };

  const toggleLike = async (event) => {
    if (!user?.id) {
      alert("Je moet ingelogd zijn.");
      return;
    }

    if (event.likedByMe) {
      const { error } = await supabase
        .from("event_likes")
        .delete()
        .eq("event_id", event.id)
        .eq("user_id", user.id);

      if (error) {
        alert(`Unlike mislukt: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("event_likes").insert({
        event_id: event.id,
        user_id: user.id,
      });

      if (error) {
        alert(`Like mislukt: ${error.message}`);
        return;
      }
    }

    await laadLikes();
  };

  const plaatsReactie = async (eventId) => {
    if (!user?.id) {
      alert("Je moet ingelogd zijn.");
      return;
    }

    const tekst = (reactieTekst[eventId] || "").trim();
    if (!tekst) return;

    const { error } = await supabase.from("event_comments").insert({
      event_id: eventId,
      user_id: user.id,
      tekst,
    });

    if (error) {
      alert(`Reactie plaatsen mislukt: ${error.message}`);
      return;
    }

    setReactieTekst((prev) => ({ ...prev, [eventId]: "" }));
    await laadComments();
  };

  const deleteReactie = async (reactieId) => {
    const { error } = await supabase
      .from("event_comments")
      .delete()
      .eq("id", reactieId);

    if (error) {
      alert(`Reactie verwijderen mislukt: ${error.message}`);
      return;
    }

    await laadComments();
  };

  const agenda = (event) => {
    const start = `${event.datum.replaceAll("-", "")}T${event.tijd.replace(":", "")}00`;
    const eindDate = new Date(`${event.datum}T${event.tijd}:00`);
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
      `SUMMARY:${event.titel}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `LOCATION:${event.locatie}`,
      `DESCRIPTION:${event.sport} training via Endurance`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.titel.replace(/\s+/g, "-").toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maps = (locatie) => {
    const q = encodeURIComponent(locatie);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
  };

  if (loading) {
    return (
      <main style={app}>
        <div style={emptyCard}>Laden...</div>
      </main>
    );
  }





if (!session) {
    return (
      <main style={app}>
        <header style={header}>
          <img
            src="/logo-endurance.png"
            alt="Endurance"
            style={{ height: 64, width: "auto", maxWidth: "82vw" }}
          />
        </header>

        <div style={authCard}>
          <div style={authTabs}>
            <button
              style={authMode === "signin" ? primaryBtn : secondaryBtn}
              onClick={() => setAuthMode("signin")}
              type="button"
            >
              Inloggen
            </button>

            <button
              style={authMode === "signup" ? primaryBtn : secondaryBtn}
              onClick={() => setAuthMode("signup")}
              type="button"
            >
              Account maken
            </button>
          </div>

          <form onSubmit={authMode === "signup" ? handleSignUp : handleSignIn} style={grid}>
            {authMode === "signup" && (
              <input
                value={authNaam}
                onChange={(e) => setAuthNaam(e.target.value)}
                placeholder="Naam"
                style={veld}
              />
            )}

            <input
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="E-mailadres"
              type="email"
              style={veld}
            />

            <input
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Wachtwoord"
              type="password"
              style={veld}
            />

            <button type="submit" style={primaryBtn}>
              {authMode === "signup" ? "Registreren" : "Inloggen"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main style={app}>
      <header style={header}>
        <img
          src="/logo-endurance.png"
          alt="Endurance"
          style={{ height: 64, width: "auto", maxWidth: "82vw" }}
        />
      </header>

      <section style={loginBar}>
        <div style={loginInfo}>
          Ingelogd als <strong>{profiel?.naam || user?.email}</strong>
          <div style={roleBadge}>{profiel?.role || "gebruiker"}</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {isModerator && (
            <a href="/admin" style={adminLinkBtn}>
              Admin
            </a>
          )}

          <button onClick={handleSignOut} style={secondaryBtn}>
            Uitloggen
          </button>
        </div>
      </section>

      {open && (
        <div style={overlay}>
          <form onSubmit={saveEvent} style={modal}>
            <div style={modalTop}>
              <h2 style={{ margin: 0, fontSize: 24 }}>
                {editId ? "Training bewerken" : "Training toevoegen"}
              </h2>
              <button type="button" onClick={sluitModal} style={closeBtn}>
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
                  onChange={(e) => setF({ ...f, afstand: Number(e.target.value) })}
                  style={{ width: "100%" }}
                />
                <div style={rangeRow}>
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

              <div>
                <div style={label}>Toelichting</div>
                <textarea
                  value={f.toelichting}
                  onChange={(e) => setF({ ...f, toelichting: e.target.value })}
                  placeholder="Extra info over de training"
                  style={{ ...veld, minHeight: 110, resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="submit" style={primaryBtn}>
                  {savingEvent ? "Opslaan..." : "Opslaan"}
                </button>

                <button type="button" onClick={sluitModal} style={secondaryBtn}>
                  Annuleren
                </button>
              </div>
            </div>
          </form>
        </div>
      )}


<section style={eventsSection}>
        {eventKaartData.length === 0 ? (
          <div style={emptyCard}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Nog geen trainingen gepland
            </div>
            <div style={{ opacity: 0.7 }}>
              Zodra er trainingen zijn toegevoegd, verschijnen ze hier.
            </div>
          </div>
        ) : (
          <div style={hScroll}>
            {eventKaartData.map((event) => (
              <div key={event.id} style={card}>
                <div style={sportTag}>{event.sport}</div>
                <h2 style={cardTitle}>{event.titel}</h2>

                <div style={afstandText}>{event.afstand} km</div>

                <div style={meta}>
                  <div>📅 {fmtDatum(event.datum)}</div>
                  <div>⏰ {event.tijd}</div>
                  <div style={creatorText}>
                    👤 Aangemaakt door:{" "}
                    {event.creator_profile?.naam ||
                      event.creator_profile?.email ||
                      "Onbekend"}
                  </div>

                  <button onClick={() => maps(event.locatie)} style={mapBtn}>
                    📍 {event.locatie}
                  </button>

                  <div style={{ opacity: 0.75 }}>
                    Deelnemers: {event.deelnemers.length}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {event.deelnemers.map((d) => (
                      <span key={d.id} style={chip}>
                        {d.user_profile?.naam || "Onbekend"}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={communityBox}>
                  <div style={communityTitle}>Toelichting</div>

                  <div style={communityText}>
                    {event.toelichting?.trim()
                      ? event.toelichting
                      : "Nog geen toelichting toegevoegd."}
                  </div>

                  <div style={likeRow}>
                    <button onClick={() => toggleLike(event)} style={likeBtn}>
                      {event.likedByMe ? "❤️ Geliket" : "🤍 Like"}
                    </button>

                    <div style={likeCount}>
                      {event.likes.length} like{event.likes.length === 1 ? "" : "s"}
                    </div>

                    {!!event.likes.length && (
                      <div style={likeUsers}>
                        {event.likes
                          .map((l) => l.user_profile?.naam || "Onbekend")
                          .join(", ")}
                      </div>
                    )}
                  </div>

                  <div style={reactiesWrap}>
                    <div style={communityTitle}>Reacties</div>

                    {event.reacties.length ? (
                      <div style={reactieLijst}>
                        {event.reacties.map((r) => (
                          <div key={r.id} style={reactieItem}>
                            <div style={reactieKop}>
                              <div style={reactieNaam}>
                                {r.user_profile?.naam || "Onbekend"}
                              </div>

                              {(r.user_id === user?.id || isModerator) && (
                                <button
                                  type="button"
                                  onClick={() => deleteReactie(r.id)}
                                  style={miniDeleteBtn}
                                >
                                  Verwijder
                                </button>
                              )}
                            </div>

                            <div style={reactieTekstStyle}>{r.tekst}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={communityMuted}>Nog geen reacties.</div>
                    )}

                    <div style={reactieForm}>
                      <div style={reactionUserLabel}>
                        Reageren als <strong>{profiel?.naam || user?.email}</strong>
                      </div>

                      <textarea
                        value={reactieTekst[event.id] || ""}
                        onChange={(e) =>
                          setReactieTekst((prev) => ({
                            ...prev,
                            [event.id]: e.target.value,
                          }))
                        }
                        placeholder="Plaats een reactie..."
                        style={reactieVeld}
                      />

                      <button
                        type="button"
                        onClick={() => plaatsReactie(event.id)}
                        style={primaryBtnSmall}
                      >
                        Reageer
                      </button>
                    </div>
                  </div>
                </div>

                <div style={btnRow}>
                  <button onClick={() => toggleDeelname(event)} style={primaryBtnSmall}>
                    {event.joinedByMe ? "Afmelden" : "Ik doe mee"}
                  </button>

                  <button onClick={() => agenda(event)} style={secondaryBtnSmall}>
                    Zet in agenda
                  </button>

                  {(event.isOwner || isModerator) && (
                    <button onClick={() => openBewerk(event)} style={secondaryBtnSmall}>
                      Bewerk
                    </button>
                  )}

                  {(event.isOwner || isModerator) && (
                    <button onClick={() => deleteEvent(event.id)} style={dangerBtnSmall}>
                      Verwijder
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {magEventsBeheren && (
        <button onClick={openNieuw} style={fab}>
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

const authCard = {
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 24,
  padding: 20,
};

const authTabs = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 16,
};

const loginBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 18,
  padding: "14px 16px",
  marginBottom: 18,
};

const loginInfo = {
  fontSize: 14,
  color: "#ddd",
};

const roleBadge = {
  marginTop: 6,
  display: "inline-block",
  background: "rgba(228,239,22,0.12)",
  color: "#e4ef16",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: "bold",
};

const adminLinkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const eventsSection = {
  paddingBottom: 110,
};

const hScroll = {
  display: "flex",
  gap: 16,
  overflowX: "auto",
  paddingBottom: 8,
  scrollSnapType: "x mandatory",
  WebkitOverflowScrolling: "touch",
};

const emptyCard = {
  background: "#111",
  padding: 24,
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.05)",
};

const label = {
  marginBottom: 6,
  opacity: 0.82,
  fontSize: 14,
};

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
  maxHeight: "90vh",
  overflowY: "auto",
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

const grid = {
  display: "grid",
  gap: 12,
};

const veld = {
  width: "100%",
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: "14px 12px",
  borderRadius: 12,
  boxSizing: "border-box",
};

const rangeRow = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
  opacity: 0.6,
  marginTop: 4,
};

const card = {
  background: "#111",
  padding: 20,
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.05)",
  minWidth: "85vw",
  maxWidth: "85vw",
  scrollSnapAlign: "start",
  flexShrink: 0,
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

const cardTitle = {
  fontSize: 26,
  marginTop: 0,
  marginBottom: 6,
};

const afstandText = {
  fontSize: 16,
  fontWeight: "600",
  color: "#cfd3d6",
  marginBottom: 14,
};

const creatorText = {
  fontSize: 14,
  opacity: 0.85,
};

const meta = {
  display: "grid",
  gap: 8,
  marginBottom: 16,
  opacity: 0.95,
};

const mapBtn = {
  background: "transparent",
  color: "white",
  border: "none",
  padding: 0,
  textAlign: "left",
  fontSize: 16,
  cursor: "pointer",
};

const chip = {
  background: "#1f1f1f",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 13,
};

const communityBox = {
  marginTop: 18,
  padding: 16,
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 18,
};

const communityTitle = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 8,
  color: "#f3f3f3",
};

const communityText = {
  fontSize: 14,
  lineHeight: 1.5,
  color: "#d6d6d6",
  marginBottom: 14,
  whiteSpace: "pre-wrap",
};

const likeRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 16,
};

const likeBtn = {
  background: "#1d1d1d",
  color: "white",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: "10px 14px",
  borderRadius: 12,
};

const likeCount = {
  fontSize: 14,
  opacity: 0.75,
};

const likeUsers = {
  fontSize: 13,
  opacity: 0.6,
};

const reactiesWrap = {
  display: "grid",
  gap: 10,
};

const reactieLijst = {
  display: "grid",
  gap: 10,
};

const reactieItem = {
  background: "#151515",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 14,
  padding: 12,
};

const reactieKop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 4,
};

const reactieNaam = {
  fontSize: 13,
  fontWeight: 700,
  color: "#e4ef16",
};

const reactieTekstStyle = {
  fontSize: 14,
  lineHeight: 1.45,
  color: "#e3e3e3",
  whiteSpace: "pre-wrap",
};

const communityMuted = {
  fontSize: 14,
  opacity: 0.6,
};

const reactionUserLabel = {
  fontSize: 13,
  opacity: 0.75,
};

const reactieForm = {
  display: "grid",
  gap: 10,
  marginTop: 6,
};

const reactieVeld = {
  width: "100%",
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: "12px 12px",
  borderRadius: 12,
  boxSizing: "border-box",
  minHeight: 90,
  resize: "vertical",
};

const btnRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
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

const miniDeleteBtn = {
  background: "transparent",
  color: "#ff8d8d",
  border: "none",
  padding: 0,
  fontSize: 12,
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





  





