"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import TeamRequestsPanel from "../components/TeamRequestsPanel";
import EventRouteMap from "../components/EventRouteMap";
import { SPORTS, getSportLabels } from "../lib/sports";

export default function Page() {
  const emptyEvent = {
    title: "",
    sports: [],
    distance: 10,
    date: "",
    time: "",
    location: "",
    description: "",
    gpxFile: null,
    gpx_file_url: null,
    gpx_file_path: null,
    route_points: null,
  };

  const DISTANCE_RANGES = {
    running: { min: 1, max: 50 },
    "trail-running": { min: 1, max: 50 },
    "road-cycling": { min: 10, max: 250 },
    "mountain-biking": { min: 5, max: 120 },
    "gravel-cycling": { min: 10, max: 250 },
    walking: { min: 1, max: 40 },
    swimming: { min: 1, max: 10 },
    kayaking: { min: 1, max: 50 },
  };

  const ROUTE_SPORTS = [
    "running",
    "trail-running",
    "road-cycling",
    "mountain-biking",
    "gravel-cycling",
    "walking",
    "kayaking",
  ];

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [events, setEvents] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [likes, setLikes] = useState([]);
  const [comments, setComments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [savingEvent, setSavingEvent] = useState(false);

  const [commentText, setCommentText] = useState({});

  const [authMode, setAuthMode] = useState("signin");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const [form, setForm] = useState(emptyEvent);

  const isModerator = profile?.role === "moderator";
  const isOrganizer = profile?.role === "organizer";
  const canManageEvents = isModerator || isOrganizer;

  const selectedRouteSport = form.sports.some((sportId) =>
    ROUTE_SPORTS.includes(sportId)
  );

  const selectedDistanceSport = form.sports.find(
    (sportId) => DISTANCE_RANGES[sportId]
  );

  const distanceRange =
    DISTANCE_RANGES[selectedDistanceSport] || { min: 1, max: 50 };

  useEffect(() => {
    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadProfile();
      loadData();
    } else {
      setProfile(null);
      setEvents([]);
      setParticipants([]);
      setLikes([]);
      setComments([]);
    }
  }, [user?.id]);

  const loadSession = async () => {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    setSession(currentSession);
    setUser(currentSession?.user || null);
    setLoading(false);
  };



const loadProfile = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("profile load error", error);
      return;
    }

    setProfile(data || null);
  };

  const loadData = async () => {
    setLoading(true);

    const [
      eventsResult,
      participantsResult,
      likesResult,
      commentsResult,
    ] = await Promise.all([
      supabase
        .from("events")
        .select(`
          *,
          creator_profile:profiles!events_creator_id_fkey (
            id,
            name,
            email,
            role,
            avatar_url
          )
        `)
        .order("date", { ascending: true })
        .order("time", { ascending: true }),

      supabase
        .from("event_participants")
        .select(`
          *,
          user_profile:profiles!event_participants_user_id_fkey (
            id,
            name,
            avatar_url
          )
        `),

      supabase
        .from("event_likes")
        .select(`
          *,
          user_profile:profiles!event_likes_user_id_fkey (
            id,
            name,
            avatar_url
          )
        `),

      supabase
        .from("event_comments")
        .select(`
          *,
          user_profile:profiles!event_comments_user_id_fkey (
            id,
            name,
            avatar_url
          )
        `)
        .order("created_at", { ascending: true }),
    ]);

    if (eventsResult.error) {
      alert(eventsResult.error.message);
    } else {
      setEvents(eventsResult.data || []);
    }

    if (!participantsResult.error) {
      setParticipants(participantsResult.data || []);
    }

    if (!likesResult.error) {
      setLikes(likesResult.data || []);
    }

    if (!commentsResult.error) {
      setComments(commentsResult.data || []);
    }

    setLoading(false);
  };

  const parseGpxFile = async (file) => {
    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, "application/xml");

    const trkpts = Array.from(xml.getElementsByTagName("trkpt"));
    const rtepts = Array.from(xml.getElementsByTagName("rtept"));

    const points = trkpts.length > 0 ? trkpts : rtepts;

    return points
      .map((pt) => ({
        lat: Number(pt.getAttribute("lat")),
        lon: Number(pt.getAttribute("lon")),
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  };

  const makeEventDateTime = (event) => {
    if (!event.date) return new Date(0);

    const time = event.time || "00:00";
    return new Date(`${event.date}T${time}`);
  };

  const formatDate = (value) => {
    if (!value) return "";

    const date = new Date(`${value}T00:00:00`);

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatTime = (value) => {
    if (!value) return "";
    return value.slice(0, 5);
  };

  const upcomingEvents = useMemo(() => {
    const now = new Date();

    return [...events]
      .filter((event) => makeEventDateTime(event) >= now)
      .sort((a, b) => makeEventDateTime(a) - makeEventDateTime(b));
  }, [events]);



  const resetForm = () => {
    setForm(emptyEvent);
    setEditId(null);
  };

  const openNewEvent = () => {
    resetForm();
    setOpen(true);
  };

  const openEditEvent = (event) => {
    setEditId(event.id);

    setForm({
      title: event.title || "",
      sports: Array.isArray(event.sports) ? event.sports : [],
      distance: event.distance || 10,
      date: event.date || "",
      time: event.time || "",
      location: event.location || "",
      description: event.description || "",
      gpxFile: null,
      gpx_file_url: event.gpx_file_url || null,
      gpx_file_path: event.gpx_file_path || null,
      route_points: event.route_points || null,
    });

    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    resetForm();
  };

  const toggleSport = (sportId) => {
    setForm((prev) => {
      const selected = prev.sports.includes(sportId);

      const nextSports = selected
        ? prev.sports.filter((id) => id !== sportId)
        : [...prev.sports, sportId];

      const nextDistanceSport = nextSports.find(
        (id) => DISTANCE_RANGES[id]
      );

      const nextRange = DISTANCE_RANGES[nextDistanceSport] || {
        min: 1,
        max: 50,
      };

      return {
        ...prev,
        sports: nextSports,
        distance:
          prev.distance < nextRange.min
            ? nextRange.min
            : Math.min(prev.distance, nextRange.max),
      };
    });
  };

  const saveEvent = async (e) => {
    e.preventDefault();

    if (!user?.id) {
      alert("You must be signed in.");
      return;
    }

    if (!form.title || !form.date || !form.time || !form.location) {
      alert("Please fill in title, date, time and location.");
      return;
    }

    if (!form.sports.length) {
      alert("Please choose at least one sport.");
      return;
    }

    try {
      setSavingEvent(true);

      let routePoints = form.route_points || null;
      let gpxFileUrl = form.gpx_file_url || null;
      let gpxFilePath = form.gpx_file_path || null;

      if (form.gpxFile) {
        routePoints = await parseGpxFile(form.gpxFile);

        if (!routePoints.length) {
          alert("No route points found in this GPX file.");
          setSavingEvent(false);
          return;
        }

        const safeFileName = form.gpxFile.name.replace(
          /[^a-zA-Z0-9.-]/g,
          "_"
        );

        const filePath = `${user.id}/${Date.now()}-${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("event-gpx")
          .upload(filePath, form.gpxFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: "application/gpx+xml",
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
          .from("event-gpx")
          .getPublicUrl(filePath);

        gpxFileUrl = publicData.publicUrl;
        gpxFilePath = filePath;
      }

      const payload = {
        title: form.title,
        sports: form.sports,
        distance: selectedDistanceSport ? Number(form.distance) : null,
        date: form.date,
        time: form.time,
        location: form.location,
        description: form.description,
        gpx_file_url: gpxFileUrl,
        gpx_file_path: gpxFilePath,
        route_points: routePoints,
      };

      const result = editId
        ? await supabase.from("events").update(payload).eq("id", editId)
        : await supabase.from("events").insert({
            ...payload,
            creator_id: user.id,
          });

      if (result.error) throw result.error;

      closeModal();
      await loadData();
    } catch (err) {
      console.error("save event error", err);
      alert(err?.message || "Could not save event.");
    } finally {
      setSavingEvent(false);
    }
  };


const deleteEvent = async (eventId) => {
    if (!confirm("Delete this event?")) return;

    const { error } = await supabase.from("events").delete().eq("id", eventId);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  };

  const toggleLike = async (eventId) => {
    if (!user?.id) return;

    const existing = likes.find(
      (like) => like.event_id === eventId && like.user_id === user.id
    );

    if (existing) {
      await supabase.from("event_likes").delete().eq("id", existing.id);
    } else {
      await supabase.from("event_likes").insert({
        event_id: eventId,
        user_id: user.id,
      });
    }

    await loadData();
  };

  const toggleJoin = async (eventId) => {
    if (!user?.id) return;

    const existing = participants.find(
      (participant) =>
        participant.event_id === eventId && participant.user_id === user.id
    );

    if (existing) {
      await supabase
        .from("event_participants")
        .delete()
        .eq("id", existing.id);
    } else {
      await supabase.from("event_participants").insert({
        event_id: eventId,
        user_id: user.id,
      });
    }

    await loadData();
  };

  const addComment = async (eventId) => {
    if (!user?.id) return;

    const text = commentText[eventId]?.trim();

    if (!text) return;

    await supabase.from("event_comments").insert({
      event_id: eventId,
      user_id: user.id,
      text,
    });

    setCommentText((prev) => ({ ...prev, [eventId]: "" }));

    await loadData();
  };

  const deleteComment = async (commentId) => {
    await supabase.from("event_comments").delete().eq("id", commentId);

    await loadData();
  };

  const openMaps = (location) => {
    if (!location) return;

    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      location
    )}`;

    window.open(url, "_blank");
  };

  const downloadIcs = (event) => {
    const startTime = event.time || "09:00";
    const start = `${event.date}T${startTime}:00`;
    const endDate = new Date(start);

    endDate.setHours(endDate.getHours() + 1);

    const formatIcsDate = (date) =>
      date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const sportText = getSportLabels(event.sports || []).join(" • ");

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `SUMMARY:${event.title}`,
      `DTSTART:${formatIcsDate(new Date(start))}`,
      `DTEND:${formatIcsDate(endDate)}`,
      `LOCATION:${event.location || ""}`,
      `DESCRIPTION:${sportText} training via Endurance`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title.replace(/\s+/g, "-").toLowerCase()}.ics`;
    a.click();

    URL.revokeObjectURL(url);
  };

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });

    if (error) alert(error.message);
  };

  const signUp = async () => {
    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: {
        data: {
          name: authName || authEmail.split("@")[0],
        },
      },
    });

    if (error) alert(error.message);
    else alert("Account created. Check your email.");
  };



if (!session) {
    return (
      <main style={app}>
        <div style={authWrap}>
          <div style={logoWrap}>
            <img
              src="/logo-endurance.png"
              alt="Endurance"
              style={logoImage}
            />
          </div>

          <div style={authCard}>
            <div style={authTabs}>
              <button
                type="button"
                style={authMode === "signin" ? tabActive : tab}
                onClick={() => setAuthMode("signin")}
              >
                Sign in
              </button>

              <button
                type="button"
                style={authMode === "signup" ? tabActive : tab}
                onClick={() => setAuthMode("signup")}
              >
                Create Account
              </button>
            </div>

            {authMode === "signup" && (
              <input
                style={field}
                placeholder="Name"
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
              />
            )}

            <input
              style={field}
              placeholder="Email"
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
            />

            <input
              style={field}
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
            />

            <button
              type="button"
              style={primaryBtn}
              onClick={authMode === "signin" ? signIn : signUp}
            >
              {authMode === "signin" ? "Sign in" : "Create account"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main style={app}>
        <div style={loadingText}>Loading...</div>
      </main>
    );
  }

  return (
    <main style={app}>
      <header style={header}>
        <img
          src="/logo-endurance.png"
          alt="Endurance"
          style={headerLogo}
        />

        <div style={headerRight}>
          <Link href={`/profile/${user.id}`} style={linkBtn}>
            My Profile
          </Link>

          {isModerator && (
            <Link href="/admin" style={linkBtn}>
              Admin
            </Link>
          )}

          <button
            type="button"
            style={secondaryBtn}
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <TeamRequestsPanel userId={user?.id} />

      <div style={sectionHeader}>
        <div style={sectionTitle}>Upcoming Trainings</div>
        <div style={scrollHint}>Swipe →</div>
      </div>

      <div style={eventScroll}>
        {upcomingEvents.map((event) => {
          const eventLikes = likes.filter((like) => like.event_id === event.id);

          const eventComments = comments.filter(
            (comment) => comment.event_id === event.id
          );

          const eventParticipants = participants.filter(
            (participant) => participant.event_id === event.id
          );

          const liked = eventLikes.some((like) => like.user_id === user.id);

          const joined = eventParticipants.some(
            (participant) => participant.user_id === user.id
          );

          const sports = getSportLabels(event.sports || []);




    return (
            <div key={event.id} style={eventCard}>
              <div style={sportTag}>{sports.join(" • ")}</div>

              <h2 style={eventTitle}>{event.title}</h2>

              {event.distance ? (
                <div style={distanceText}>{event.distance} km</div>
              ) : null}

              <div style={meta}>
                <div>📅 {formatDate(event.date)}</div>
                <div>⏰ {formatTime(event.time)}</div>

                <button
                  type="button"
                  onClick={() => openMaps(event.location)}
                  style={mapBtn}
                >
                  📍 {event.location}
                </button>

                <div>
                  👤 Created by {event.creator_profile?.name || "Unknown"}
                </div>

                <div>Participants: {eventParticipants.length}</div>
              </div>

              {event.route_points && (
                <EventRouteMap points={event.route_points} />
              )}

              {event.gpx_file_url && (
                <a
                  href={event.gpx_file_url}
                  target="_blank"
                  rel="noreferrer"
                  style={gpxLink}
                >
                  Download GPX
                </a>
              )}

              <div style={descriptionBox}>
                <div style={descriptionTitle}>Description</div>
                <div style={descriptionText}>
                  {event.description?.trim()
                    ? event.description
                    : "No description added yet."}
                </div>
              </div>

              <div style={buttonRow}>
                <button
                  type="button"
                  onClick={() => toggleLike(event.id)}
                  style={liked ? primaryBtnSmall : secondaryBtnSmall}
                >
                  {liked ? "❤️ Liked" : "🤍 Like"} ({eventLikes.length})
                </button>

                <button
                  type="button"
                  onClick={() => toggleJoin(event.id)}
                  style={joined ? secondaryBtnSmall : primaryBtnSmall}
                >
                  {joined ? "Leave" : "Join"} ({eventParticipants.length})
                </button>

                <button
                  type="button"
                  onClick={() => downloadIcs(event)}
                  style={secondaryBtnSmall}
                >
                  Calendar
                </button>

                {(event.creator_id === user.id || isModerator) && (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditEvent(event)}
                      style={secondaryBtnSmall}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteEvent(event.id)}
                      style={dangerBtnSmall}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>

              <div style={commentsBox}>
                <div style={descriptionTitle}>Comments</div>

                {eventComments.map((comment) => (
                  <div key={comment.id} style={commentItem}>
                    <div>
                      <strong>{comment.user_profile?.name || "User"}</strong>:{" "}
                      {comment.text}
                    </div>

                    {(comment.user_id === user.id || isModerator) && (
                      <button
                        type="button"
                        onClick={() => deleteComment(comment.id)}
                        style={miniDeleteBtn}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}

                <div style={commentForm}>
                  <textarea
                    value={commentText[event.id] || ""}
                    onChange={(e) =>
                      setCommentText((prev) => ({
                        ...prev,
                        [event.id]: e.target.value,
                      }))
                    }
                    placeholder="Write a comment..."
                    style={commentField}
                  />

                  <button
                    type="button"
                    onClick={() => addComment(event.id)}
                    style={primaryBtnSmall}
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canManageEvents && (
        <button type="button" onClick={openNewEvent} style={fab}>
          +
        </button>
      )}

      {open && (
        <div style={overlay}>
          <form onSubmit={saveEvent} style={modal}>
            <div style={modalTop}>
              <h2>{editId ? "Edit Training" : "Add Training"}</h2>

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

              <div style={sportsPicker}>
                {SPORTS.map((sport) => {
                  const selected = form.sports.includes(sport.id);

                  return (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => toggleSport(sport.id)}
                      style={selected ? sportChipSelected : sportChip}
                    >
                      {sport.icon} {sport.label}
                    </button>
                  );
                })}
              </div>

              {selectedDistanceSport && (
                <div>
                  <div style={label}>Distance: {form.distance} km</div>
                  <input
                    type="range"
                    min={distanceRange.min}
                    max={distanceRange.max}
                    value={form.distance}
                    onChange={(e) =>
                      setForm({ ...form, distance: Number(e.target.value) })
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              )}

              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                style={field}
              />

              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                style={field}
              />

              <input
                value={form.location}
                onChange={(e) =>
                  setForm({ ...form, location: e.target.value })
                }
                placeholder="Location"
                style={field}
              />

              {selectedRouteSport && (
                <>
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
                    <div style={mutedText}>
                      Selected GPX: {form.gpxFile.name}
                    </div>
                  )}

                  {form.gpx_file_url && !form.gpxFile && (
                    <div style={mutedText}>
                      Current GPX file is already attached.
                    </div>
                  )}
                </>
              )}

              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Description"
                style={{ ...field, minHeight: 120 }}
              />

              <button type="submit" style={primaryBtn} disabled={savingEvent}>
                {savingEvent ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

const app = { minHeight: "100vh", background: "#050505", color: "white", padding: 16, fontFamily: "sans-serif" };
const authWrap = { maxWidth: 420, margin: "0 auto", paddingTop: 60 };
const authCard = { background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 24, padding: 20 };
const authTabs = { display: "flex", gap: 10, marginBottom: 14 };
const tab = { flex: 1, background: "#222", color: "white", border: "none", padding: 12, borderRadius: 12 };
const tabActive = { ...tab, background: "#e4ef16", color: "black", fontWeight: "bold" };
const logoWrap = { display: "flex", justifyContent: "center", marginBottom: 22 };
const logoImage = { width: 220, maxWidth: "80vw", height: "auto" };
const header = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 };
const headerLogo = { height: 54, width: "auto", maxWidth: "48vw" };
const headerRight = { display: "flex", gap: 10, flexWrap: "wrap" };
const linkBtn = { display: "inline-block", background: "#2a2a2a", color: "white", textDecoration: "none", padding: "12px 16px", borderRadius: 12 };
const loadingText = { padding: 24 };
const sectionHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 };
const sectionTitle = { fontSize: 22, fontWeight: 800 };
const scrollHint = { fontSize: 13, opacity: 0.65 };
const eventScroll = { display: "flex", gap: 16, overflowX: "auto", paddingBottom: 12, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" };
const eventCard = { background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 24, padding: 20, minWidth: "85vw", maxWidth: "85vw", flexShrink: 0, scrollSnapAlign: "start" };
const sportTag = { display: "inline-block", background: "rgba(228,239,22,0.12)", color: "#e4ef16", padding: "7px 10px", borderRadius: 999, fontSize: 12, fontWeight: "bold", marginBottom: 10 };
const eventTitle = { fontSize: 26, marginTop: 0, marginBottom: 8 };
const distanceText = { fontSize: 16, fontWeight: 600, color: "#cfd3d6", marginBottom: 14 };
const meta = { display: "grid", gap: 8, marginBottom: 16 };
const mapBtn = { background: "transparent", color: "white", border: "none", padding: 0, textAlign: "left", fontSize: 16 };
const gpxLink = { display: "inline-block", marginTop: 8, marginBottom: 12, color: "#e4ef16", textDecoration: "none", fontWeight: "bold" };
const descriptionBox = { marginTop: 14, padding: 14, background: "#0b0b0b", borderRadius: 18 };
const descriptionTitle = { fontSize: 15, fontWeight: 700, marginBottom: 8 };
const descriptionText = { fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "#d6d6d6" };
const buttonRow = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 };
const commentsBox = { marginTop: 16, display: "grid", gap: 10 };
const commentItem = { background: "#151515", borderRadius: 14, padding: 12, display: "flex", justifyContent: "space-between", gap: 10 };
const commentForm = { display: "grid", gap: 10 };
const commentField = { width: "100%", minHeight: 80, background: "#1b1b1b", color: "white", border: "1px solid #333", padding: 12, borderRadius: 12, boxSizing: "border-box" };
const mutedText = { fontSize: 13, opacity: 0.7 };
const primaryBtn = { background: "#e4ef16", color: "black", border: "none", padding: "12px 16px", borderRadius: 12, fontWeight: "bold" };
const secondaryBtn = { background: "#2a2a2a", color: "white", border: "none", padding: "12px 16px", borderRadius: 12 };
const primaryBtnSmall = { background: "#e4ef16", color: "black", border: "none", padding: "10px 14px", borderRadius: 10, fontWeight: "bold" };
const secondaryBtnSmall = { background: "#2a2a2a", color: "white", border: "none", padding: "10px 14px", borderRadius: 10 };
const dangerBtnSmall = { background: "#5a1f1f", color: "white", border: "none", padding: "10px 14px", borderRadius: 10 };
const miniDeleteBtn = { background: "transparent", color: "#ff8d8d", border: "none" };
const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 20, padding: 16, display: "flex", alignItems: "center" };
const modal = { width: "100%", background: "#111", borderRadius: 24, padding: 18, maxHeight: "90vh", overflowY: "auto" };
const modalTop = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 };
const closeBtn = { background: "#2a2a2a", border: "none", color: "white", width: 36, height: 36, borderRadius: 999 };
const grid = { display: "grid", gap: 12 };
const label = { fontSize: 14, opacity: 0.8, marginBottom: 6 };
const field = { width: "100%", background: "#1b1b1b", color: "white", border: "1px solid #333", padding: 12, borderRadius: 12, boxSizing: "border-box" };
const sportsPicker = { display: "flex", flexWrap: "wrap", gap: 10 };
const sportChip = { background: "#222", color: "white", border: "1px solid #333", padding: "8px 14px", borderRadius: 999 };
const sportChipSelected = { background: "#e4ef16", color: "black", border: "1px solid #e4ef16", padding: "8px 14px", borderRadius: 999, fontWeight: "bold" };
const fab = { position: "fixed", right: 18, bottom: 22, width: 62, height: 62, borderRadius: 999, border: "none", background: "#e4ef16", color: "black", fontSize: 34, fontWeight: "bold" };      
  

  
