"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import TeamRequestsPanel from "../components/TeamRequestsPanel";
import EventRouteMap from "../components/EventRouteMap";

const SPORTS = [
  { id: "running", label: "Running", icon: "🏃" },
  { id: "trail", label: "Trail Running", icon: "⛰️" },
  { id: "roadbike", label: "Road Cycling", icon: "🚴" },
  { id: "mtb", label: "Mountain Biking", icon: "🚵" },
  { id: "gravel", label: "Gravel Cycling", icon: "🚴‍♂️" },
  { id: "swim", label: "Swimming", icon: "🏊" },
  { id: "walk", label: "Walking", icon: "🚶" },
  { id: "kayak", label: "Kayaking", icon: "🛶" },
  { id: "padel", label: "Padel", icon: "🎾" },
  { id: "crossfit", label: "CrossFit", icon: "🏋️" },
  { id: "hyrox", label: "HYROX", icon: "🔥" },
  { id: "strength", label: "Strength Training", icon: "💪" },
];

const DISTANCE_RANGES = {
  running: { min: 1, max: 50 },
  trail: { min: 1, max: 50 },
  roadbike: { min: 10, max: 250 },
  mtb: { min: 5, max: 120 },
  gravel: { min: 10, max: 250 },
  walk: { min: 1, max: 40 },
};

export default function Page() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [events, setEvents] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [likes, setLikes] = useState([]);
  const [comments, setComments] = useState([]);

  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);

  const [savingEvent, setSavingEvent] = useState(false);

  const [commentText, setCommentText] = useState({});

  const [form, setForm] = useState({
    title: "",
    sports: [],
    distance: 10,
    date: "",
    time: "",
    location: "",
    description: "",
    gpxFile: null,
    gpx_file_url: null,
  });



const routeSports = ["running", "trail", "roadbike", "mtb", "gravel", "walk", "kayak"];

  const selectedRouteSport = form.sports.some((sportId) =>
    routeSports.includes(sportId)
  );

  const selectedDistanceSport = form.sports.find((sportId) =>
    DISTANCE_RANGES[sportId]
  );

  const distanceRange =
    DISTANCE_RANGES[selectedDistanceSport] || { min: 1, max: 50 };

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    setSession(session);
    setUser(session?.user || null);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user || null);
    });

    setLoading(false);

    return () => subscription.unsubscribe();
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

    return trkpts
      .map((pt) => ({
        lat: Number(pt.getAttribute("lat")),
        lon: Number(pt.getAttribute("lon")),
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  };

  const getSportLabels = (ids = []) => {
    return ids
      .map((id) => SPORTS.find((sport) => sport.id === id)?.label)
      .filter(Boolean);
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



const makeEventDateTime = (event) => {
    if (!event.date) return new Date(0);

    const time = event.time || "00:00";
    return new Date(`${event.date}T${time}`);
  };

  const openMaps = (location) => {
    if (!location) return;

    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      location
    )}`;

    window.open(url, "_blank");
  };

  const toggleLike = async (eventId) => {
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

    loadData();
  };

  const toggleJoin = async (eventId) => {
    const existing = participants.find(
      (p) => p.event_id === eventId && p.user_id === user.id
    );

    if (existing) {
      await supabase.from("event_participants").delete().eq("id", existing.id);
    } else {
      await supabase.from("event_participants").insert({
        event_id: eventId,
        user_id: user.id,
      });
    }

    loadData();
  };

  const addComment = async (eventId) => {
    const text = commentText[eventId]?.trim();

    if (!text) return;

    await supabase.from("event_comments").insert({
      event_id: eventId,
      user_id: user.id,
      text,
    });

    setCommentText((prev) => ({ ...prev, [eventId]: "" }));

    loadData();
  };

  const deleteComment = async (commentId) => {
    await supabase.from("event_comments").delete().eq("id", commentId);

    loadData();
  };

  const downloadIcs = (event) => {
    const start = `${event.date}T${event.time || "09:00"}:00`;

    const ics = `
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:${event.title}
DTSTART:${start.replace(/[-:]/g, "")}
DESCRIPTION:${event.description || ""}
LOCATION:${event.location || ""}
END:VEVENT
END:VCALENDAR
`;

    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "event.ics";
    a.click();
  };



  const resetForm = () => {
    setForm({
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
    });

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

      const nextDistanceSport = nextSports.find((id) => DISTANCE_RANGES[id]);
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

        const safeFileName = form.gpxFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
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

      let result;

      if (editId) {
        result = await supabase.from("events").update(payload).eq("id", editId);
      } else {
        result = await supabase.from("events").insert({
          ...payload,
          creator_id: user.id,
        });
      }

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



if (!session) {
    return (
      <main style={app}>
        <div style={authWrap}>
          <h1 style={logo}>Endurance</h1>

          <div style={authCard}>
            <input
              style={field}
              placeholder="Email"
              onChange={(e) => setAuthEmail(e.target.value)}
            />

            <input
              style={field}
              type="password"
              placeholder="Password"
              onChange={(e) => setAuthPassword(e.target.value)}
            />

            <button
              style={primaryBtn}
              onClick={async () => {
                const { error } = await supabase.auth.signInWithPassword({
                  email: authEmail,
                  password: authPassword,
                });

                if (error) alert(error.message);
              }}
            >
              Sign in
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

  const now = new Date();

  const upcomingEvents = events
    .filter((e) => makeEventDateTime(e) >= now)
    .sort((a, b) => makeEventDateTime(a) - makeEventDateTime(b));

  return (
    <main style={app}>
      <header style={header}>
        <div style={logo}>Endurance</div>

        <div style={headerRight}>
          <Link href={`/profile/${user.id}`} style={linkBtn}>
            My Profile
          </Link>

          <button
            style={secondaryBtn}
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <TeamRequestsPanel userId={user?.id} />

      <div style={sectionTitle}>Upcoming Trainings</div>

      <div style={eventScroll}>
        {upcomingEvents.map((event) => {
          const eventLikes = likes.filter((l) => l.event_id === event.id);
          const eventComments = comments.filter(
            (c) => c.event_id === event.id
          );

          const eventParticipants = participants.filter(
            (p) => p.event_id === event.id
          );

          const liked = eventLikes.some((l) => l.user_id === user.id);

          const joined = eventParticipants.some(
            (p) => p.user_id === user.id
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
                    👤 Created by{" "}
                    {event.creator_profile?.name || "Unknown"}
                  </div>
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

                <div style={buttonRow}>
                  <button
                    type="button"
                    onClick={() => toggleLike(event.id)}
                    style={liked ? primaryBtnSmall : secondaryBtnSmall}
                  >
                    ❤️ {eventLikes.length}
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
                </div>

                <div style={commentsBox}>
                  {eventComments.map((comment) => (
                    <div key={comment.id} style={commentItem}>
                      <strong>
                        {comment.user_profile?.name || "User"}
                      </strong>
                      : {comment.text}
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

      <button type="button" onClick={openNewEvent} style={fab}>
        +
      </button>

      {open && (
        <div style={overlay}>
          <form onSubmit={saveEvent} style={modal}>
            <div style={modalTop}>
              <h2>{editId ? "Edit Training" : "Add Training"}</h2>

              <button type="button" onClick={closeModal} style={closeBtn}>
                ✕
              </button>
            </div>

            <input
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
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
                Distance: {form.distance} km
                <input
                  type="range"
                  min={distanceRange.min}
                  max={distanceRange.max}
                  value={form.distance}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      distance: Number(e.target.value),
                    })
                  }
                />
              </div>
            )}

            <input
              type="date"
              value={form.date}
              onChange={(e) =>
                setForm({ ...form, date: e.target.value })
              }
              style={field}
            />

            <input
              type="time"
              value={form.time}
              onChange={(e) =>
                setForm({ ...form, time: e.target.value })
              }
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

            <button type="submit" style={primaryBtn}>
              {savingEvent ? "Saving..." : "Save"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

const app = {
  minHeight: "100vh",
  background: "#050505",
  color: "white",
  padding: 16,
  fontFamily: "sans-serif",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 20,
};

const logo = { fontSize: 28, fontWeight: 800 };

const eventScroll = {
  display: "flex",
  gap: 16,
  overflowX: "auto",
};

const eventCard = {
  background: "#111",
  borderRadius: 20,
  padding: 20,
  minWidth: "85vw",
};

const sportTag = {
  background: "#e4ef16",
  color: "black",
  padding: "6px 12px",
  borderRadius: 20,
  display: "inline-block",
  marginBottom: 10,
};

const meta = { marginBottom: 12 };

const buttonRow = {
  display: "flex",
  gap: 8,
  marginTop: 10,
};

const primaryBtn = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: 12,
  borderRadius: 10,
};

const secondaryBtn = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: 12,
  borderRadius: 10,
};

const primaryBtnSmall = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "8px 12px",
  borderRadius: 10,
};

const secondaryBtnSmall = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: "8px 12px",
  borderRadius: 10,
};

const field = {
  width: "100%",
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: 12,
  borderRadius: 10,
};

const sportsPicker = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const sportChip = {
  background: "#222",
  border: "1px solid #333",
  padding: "6px 10px",
  borderRadius: 20,
};

const sportChipSelected = {
  background: "#e4ef16",
  color: "black",
  padding: "6px 10px",
  borderRadius: 20,
};

const fab = {
  position: "fixed",
  right: 20,
  bottom: 20,
  width: 60,
  height: 60,
  borderRadius: 30,
  background: "#e4ef16",
  color: "black",
  fontSize: 30,
  border: "none",
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  padding: 16,
};

const modal = {
  background: "#111",
  borderRadius: 20,
  padding: 20,
};

const modalTop = {
  display: "flex",
  justifyContent: "space-between",
};

const closeBtn = {
  background: "#2a2a2a",
  border: "none",
  color: "white",
  width: 32,
  height: 32,
  borderRadius: 20,
};

const commentsBox = { marginTop: 14 };

const commentItem = {
  background: "#1a1a1a",
  padding: 10,
  borderRadius: 10,
  marginBottom: 6,
};

const commentForm = { marginTop: 10 };

const commentField = {
  width: "100%",
  minHeight: 70,
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: 10,
  borderRadius: 10,
};

const mutedText = {
  fontSize: 13,
  opacity: 0.7,
};

const gpxLink = {
  display: "inline-block",
  marginTop: 8,
  color: "#e4ef16",
};



  
  

