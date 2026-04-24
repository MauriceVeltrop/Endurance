"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import TeamRequestsPanel from "../components/TeamRequestsPanel";
import EventRouteMap from "../components/EventRouteMap";
import { SPORTS, getSportLabels } from "../lib/sports";

export default function Home() {
  const emptyEvent = {
    title: "",
    sports: [],
    distance: 10,
    date: "",
    time: "",
    location: "",
    description: "",
    gpxFile: null,
    gpx_file_path: "",
    gpx_file_url: "",
    route_points: null,
  };

  const distanceRanges = {
    running: { min: 1, max: 50 },
    "trail-running": { min: 1, max: 50 },
    "road-cycling": { min: 10, max: 250 },
    "mountain-biking": { min: 5, max: 120 },
    "gravel-cycling": { min: 10, max: 250 },
    walking: { min: 1, max: 40 },
    swimming: { min: 1, max: 10 },
    kayaking: { min: 1, max: 50 },
  };

  const routeSports = [
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
  const [likes, setLikes] = useState([]);
  const [comments, setComments] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [userSports, setUserSports] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyEvent);

  const [commentText, setCommentText] = useState({});
  const [pageError, setPageError] = useState("");

  const [authMode, setAuthMode] = useState("signin");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const isModerator = profile?.role === "moderator";
  const isOrganizer = profile?.role === "organizer";
  const canManageEvents = isModerator || isOrganizer;

  const formatDate = (value) => {
    if (!value) return "";

    const d = new Date(`${value}T00:00:00`);

    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatTime = (value) => {
    if (!value) return "";
    return value.slice(0, 5);
  };

  const makeEventDateTime = (event) => {
    const timeValue = event?.time || "23:59";
    return new Date(`${event.date}T${timeValue}`);
  };

  const getDistanceSportIds = (sports = []) => {
    return sports.filter((sportId) => distanceRanges[sportId]);
  };

  const eventCanHaveRoute = (sports = []) => {
    return sports.some((sportId) => routeSports.includes(sportId));
  };

  const currentDistanceSportIds = getDistanceSportIds(form.sports);
  const showDistance = currentDistanceSportIds.length > 0;
  const activeDistanceRange =
    distanceRanges[currentDistanceSportIds[0]] || { min: 1, max: 50 };

  const showGpxUpload = eventCanHaveRoute(form.sports);

  const openNew = () => {
    setEditId(null);
    setForm(emptyEvent);
    setOpen(true);
  };

  const openEdit = (event) => {
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
      gpx_file_path: event.gpx_file_path || "",
      gpx_file_url: event.gpx_file_url || "",
      route_points: event.route_points || null,
    });

    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditId(null);
    setForm(emptyEvent);
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

  const saveEvent = async (e) => {
    e.preventDefault();

    if (!form.title || !form.date) {
      alert("Title and date are required");
      return;
    }

    setSavingEvent(true);

    let gpxFilePath = form.gpx_file_path || null;
    let gpxFileUrl = form.gpx_file_url || null;
    let routePoints = form.route_points || null;

    if (form.gpxFile) {
      routePoints = await parseGpxFile(form.gpxFile);

      const filePath = `${user.id}/${Date.now()}-${form.gpxFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("event-gpx")
        .upload(filePath, form.gpxFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: "application/gpx+xml",
        });

      if (uploadError) {
        setSavingEvent(false);
        alert(`GPX upload failed: ${uploadError.message}`);
        return;
      }

      const { data: publicData } = supabase.storage
        .from("event-gpx")
        .getPublicUrl(filePath);

      gpxFilePath = filePath;
      gpxFileUrl = publicData.publicUrl;
    }

    const payload = {
      title: form.title,
      sports: form.sports,
      distance: form.distance,
      date: form.date,
      time: form.time,
      location: form.location,
      description: form.description,
      creator_id: user.id,
      gpx_file_path: gpxFilePath,
      gpx_file_url: gpxFileUrl,
      route_points: routePoints,
    };

    let error;

    if (editId) {
      const res = await supabase
        .from("events")
        .update(payload)
        .eq("id", editId);

      error = res.error;
    } else {
      const res = await supabase.from("events").insert(payload);
      error = res.error;
    }

    setSavingEvent(false);

    if (error) {
      alert(error.message);
      return;
    }

    closeModal();
    loadAll();
  };

  const deleteEvent = async (id) => {
    if (!confirm("Delete this event?")) return;

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadAll();
  };


const loadAll = async () => {
    setLoading(true);
    setPageError("");

    try {
      const [
        { data: eventsData, error: eventsError },
        { data: likesData, error: likesError },
        { data: commentsData, error: commentsError },
        { data: participantsData, error: participantsError },
      ] = await Promise.all([
        supabase
          .from("events")
          .select("*, creator_profile:profiles!events_creator_id_fkey(name)")
          .order("date", { ascending: true }),

        supabase.from("event_likes").select("*"),

        supabase
          .from("event_comments")
          .select(
            "*, profile:profiles!event_comments_user_id_fkey(id,name)"
          )
          .order("created_at", { ascending: true }),

        supabase.from("event_participants").select("*"),
      ]);

      if (eventsError) throw eventsError;
      if (likesError) throw likesError;
      if (commentsError) throw commentsError;
      if (participantsError) throw participantsError;

      setEvents(eventsData || []);
      setLikes(likesData || []);
      setComments(commentsData || []);
      setParticipants(participantsData || []);
    } catch (err) {
      console.error(err);
      setPageError(err.message);
    }

    setLoading(false);
  };

  useEffect(() => {
    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        setProfile(profileData || null);
      }

      setLoading(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) loadAll();
  }, [user]);

  const toggleSport = (sportId) => {
    setForm((prev) => {
      const exists = prev.sports.includes(sportId);

      const sports = exists
        ? prev.sports.filter((s) => s !== sportId)
        : [...prev.sports, sportId];

      return {
        ...prev,
        sports,
      };
    });
  };



const toggleLike = async (eventId) => {
    if (!user?.id) return;

    const existing = likes.find(
      (like) => like.event_id === eventId && like.user_id === user.id
    );

    if (existing) {
      const { error } = await supabase
        .from("event_likes")
        .delete()
        .eq("id", existing.id);

      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("event_likes").insert({
        event_id: eventId,
        user_id: user.id,
      });

      if (error) {
        alert(error.message);
        return;
      }
    }

    loadAll();
  };

  const toggleJoin = async (eventId) => {
    if (!user?.id) return;

    const existing = participants.find(
      (participant) =>
        participant.event_id === eventId && participant.user_id === user.id
    );

    if (existing) {
      const { error } = await supabase
        .from("event_participants")
        .delete()
        .eq("id", existing.id);

      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("event_participants").insert({
        event_id: eventId,
        user_id: user.id,
      });

      if (error) {
        alert(error.message);
        return;
      }
    }

    loadAll();
  };

  const addComment = async (eventId) => {
    if (!user?.id) return;

    const text = (commentText[eventId] || "").trim();

    if (!text) return;

    const { error } = await supabase.from("event_comments").insert({
      event_id: eventId,
      user_id: user.id,
      text,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setCommentText((prev) => ({
      ...prev,
      [eventId]: "",
    }));

    loadAll();
  };

  const deleteComment = async (commentId) => {
    const { error } = await supabase
      .from("event_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      alert(error.message);
      return;
    }

    loadAll();
  };

  const downloadIcs = (event) => {
    const startTime = event.time || "12:00";
    const start = `${event.date.replaceAll("-", "")}T${startTime.replace(
      ":",
      ""
    )}00`;

    const endDate = new Date(`${event.date}T${startTime}:00`);
    endDate.setHours(endDate.getHours() + 1);

    const yyyy = endDate.getFullYear();
    const mm = String(endDate.getMonth() + 1).padStart(2, "0");
    const dd = String(endDate.getDate()).padStart(2, "0");
    const hh = String(endDate.getHours()).padStart(2, "0");
    const mi = String(endDate.getMinutes()).padStart(2, "0");
    const end = `${yyyy}${mm}${dd}T${hh}${mi}00`;

    const sportText = getSportLabels(event.sports || []).join(" • ");

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `SUMMARY:${event.title}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
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

  const openMaps = (location) => {
    const q = encodeURIComponent(location || "");
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${q}`,
      "_blank"
    );
  };



if (!session) {
    return (
      <main style={app}>
        <div style={authWrap}>
          <h1 style={logo}>Endurance</h1>

          <div style={authCard}>
            <div style={authTabs}>
              <button
                style={authMode === "signin" ? tabActive : tab}
                onClick={() => setAuthMode("signin")}
              >
                Sign in
              </button>

              <button
                style={authMode === "signup" ? tabActive : tab}
                onClick={() => setAuthMode("signup")}
              >
                Sign up
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

            {authMode === "signin" ? (
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
            ) : (
              <button
                style={primaryBtn}
                onClick={async () => {
                  const { error } = await supabase.auth.signUp({
                    email: authEmail,
                    password: authPassword,
                    options: {
                      data: {
                        name: authName,
                      },
                    },
                  });

                  if (error) alert(error.message);
                  else alert("Account created. Check your email.");
                }}
              >
                Create account
              </button>
            )}
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

          {isModerator && (
            <Link href="/admin" style={linkBtn}>
              Admin
            </Link>
          )}

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

      <div style={eventScrollWrap}>
        <div style={eventScrollHint}>Swipe →</div>

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
                    📍 {event.location || "Location"}
                  </button>

                  <div>
                    👤 Created by{" "}
                    {event.creator_profile?.name || "Unknown"}
                  </div>

                  <div>
                    Participants: {eventParticipants.length}
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
                        onClick={() => openEdit(event)}
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

                  {eventComments.length === 0 ? (
                    <div style={mutedText}>No comments yet.</div>
                  ) : (
                    eventComments.map((comment) => (
                      <div key={comment.id} style={commentItem}>
                        <div>
                          <strong>
                            {comment.profile?.name || "User"}
                          </strong>
                          : {comment.text}
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
                    ))
                  )}

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
                      Post Comment
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {canManageEvents && (
        <button type="button" onClick={openNew} style={fab}>
          +
        </button>
      )}

      {open && (
        <div style={overlay}>
          <form onSubmit={saveEvent} style={modal}>
            <div style={modalTop}>
              <h2 style={{ margin: 0 }}>
                {editId ? "Edit Training" : "Add Training"}
              </h2>

              <button
                type="button"
                onClick={closeModal}
                style={closeBtn}
              >
                ✕
              </button>
            </div>

            <div style={grid}>
              <input
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value })
                }
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
                        onClick={() => toggleSport(sport.id)}
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
                    value={form.distance}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        distance: Number(e.target.value),
                      })
                    }
                    style={{ width: "100%" }}
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

                  {form.gpx_file_url && (
                    <div style={mutedText}>
                      Current GPX file is already attached.
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Description"
                style={{ ...field, minHeight: 110 }}
              />

              <button
                type="submit"
                disabled={savingEvent}
                style={primaryBtn}
              >
                {savingEvent ? "Saving..." : "Save"}
              </button>
            </div>
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

const authWrap = {
  maxWidth: 420,
  margin: "0 auto",
  paddingTop: 60,
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
  marginBottom: 16,
};

const tab = {
  flex: 1,
  background: "#222",
  color: "white",
  border: "none",
  padding: 12,
  borderRadius: 12,
};

const tabActive = {
  ...tab,
  background: "#e4ef16",
  color: "black",
  fontWeight: "bold",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 18,
};

const logo = {
  fontSize: 28,
  fontWeight: 800,
};

const headerRight = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const linkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const sectionTitle = {
  fontSize: 22,
  fontWeight: 800,
  marginBottom: 10,
};

const eventScrollWrap = {
  position: "relative",
};

const eventScrollHint = {
  fontSize: 13,
  opacity: 0.65,
  marginBottom: 8,
  textAlign: "right",
};

const eventScroll = {
  display: "flex",
  gap: 16,
  overflowX: "auto",
  paddingBottom: 12,
  scrollSnapType: "x mandatory",
  WebkitOverflowScrolling: "touch",
};

const eventCard = {
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 24,
  padding: 20,
  minWidth: "85vw",
  maxWidth: "85vw",
  flexShrink: 0,
  scrollSnapAlign: "start",
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

const eventTitle = {
  fontSize: 26,
  marginTop: 0,
  marginBottom: 8,
};

const distanceText = {
  fontSize: 16,
  fontWeight: 600,
  color: "#cfd3d6",
  marginBottom: 14,
};

const meta = {
  display: "grid",
  gap: 8,
  marginBottom: 16,
};

const mapBtn = {
  background: "transparent",
  color: "white",
  border: "none",
  padding: 0,
  textAlign: "left",
  fontSize: 16,
};

const gpxLink = {
  display: "inline-block",
  color: "#e4ef16",
  textDecoration: "none",
  marginBottom: 12,
  fontWeight: "bold",
};

const descriptionBox = {
  marginTop: 14,
  padding: 14,
  background: "#0b0b0b",
  borderRadius: 18,
};

const descriptionTitle = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 8,
};

const descriptionText = {
  fontSize: 14,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  color: "#d6d6d6",
};

const buttonRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 14,
};

const commentsBox = {
  marginTop: 16,
  display: "grid",
  gap: 10,
};

const commentItem = {
  background: "#151515",
  borderRadius: 14,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
};

const commentForm = {
  display: "grid",
  gap: 10,
};

const commentField = {
  width: "100%",
  minHeight: 80,
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: 12,
  borderRadius: 12,
  boxSizing: "border-box",
};

const mutedText = {
  fontSize: 13,
  opacity: 0.65,
};

const loadingText = {
  padding: 24,
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
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.75)",
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
  background: "#2a2a2a",
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

const label = {
  fontSize: 14,
  opacity: 0.8,
  marginBottom: 6,
};

const field = {
  width: "100%",
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: "12px",
  borderRadius: 12,
  boxSizing: "border-box",
};

const sportsPicker = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const sportChip = {
  background: "#222",
  color: "white",
  border: "1px solid #333",
  padding: "8px 14px",
  borderRadius: 999,
};

const sportChipSelected = {
  background: "#e4ef16",
  color: "black",
  border: "1px solid #e4ef16",
  padding: "8px 14px",
  borderRadius: 999,
  fontWeight: "bold",
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
};
            
  


  

  




  
