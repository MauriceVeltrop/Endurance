"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import TeamRequestsPanel from "../components/TeamRequestsPanel";
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

  const currentDistanceSportIds = getDistanceSportIds(form.sports);
  const showDistance = currentDistanceSportIds.length > 0;
  const activeDistanceRange =
    distanceRanges[currentDistanceSportIds[0]] || { min: 1, max: 50 };

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
    });
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditId(null);
    setForm(emptyEvent);
  };




const eventCards = useMemo(() => {
    const now = new Date();

    const filteredEvents =
      userSports.length > 0
        ? events.filter((event) => {
            const eventSports = Array.isArray(event.sports) ? event.sports : [];
            return eventSports.some((sportId) => userSports.includes(sportId));
          })
        : events;

    return [...filteredEvents]
      .filter((event) => makeEventDateTime(event) >= now)
      .sort((a, b) => makeEventDateTime(a) - makeEventDateTime(b))
      .map((event) => {
        const eventLikes = likes.filter((like) => like.event_id === event.id);
        const eventComments = comments.filter(
          (comment) => comment.event_id === event.id
        );
        const eventParticipants = participants.filter(
          (participant) => participant.event_id === event.id
        );

        return {
          ...event,
          likes: eventLikes,
          comments: eventComments,
          participants: eventParticipants,
          isOwner: user?.id === event.creator_id,
          likedByMe: !!eventLikes.find((like) => like.user_id === user?.id),
          joinedByMe: !!eventParticipants.find(
            (participant) => participant.user_id === user?.id
          ),
        };
      });
  }, [events, likes, comments, participants, user, userSports]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
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
      setProfile(null);
      setEvents([]);
      setLikes([]);
      setComments([]);
      setParticipants([]);
      setUserSports([]);
      return;
    }

    loadProfile();
    loadEverything();
  }, [user?.id]);

  const loadProfile = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("profile load error", error);
      setPageError(error.message);
      return;
    }

    setProfile(data);
  };

  const loadEverything = async () => {
    setPageError("");

    await Promise.all([
      loadEvents(),
      loadLikes(),
      loadComments(),
      loadParticipants(),
      loadUserSports(),
    ]);
  };

  const loadEvents = async () => {
    const { data, error } = await supabase
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
      .order("time", { ascending: true });

    if (error) {
      console.error("events load error", error);
      setPageError(error.message);
      return;
    }

    setEvents(data || []);
  };

  const loadLikes = async () => {
    const { data, error } = await supabase
      .from("event_likes")
      .select(`
        id,
        event_id,
        user_id,
        created_at,
        user_profile:profiles!event_likes_user_id_fkey (
          id,
          name,
          role,
          avatar_url
        )
      `);

    if (error) {
      console.error("likes load error", error);
      return;
    }

    setLikes(data || []);
  };

  const loadComments = async () => {
    const { data, error } = await supabase
      .from("event_comments")
      .select(`
        id,
        event_id,
        user_id,
        text,
        created_at,
        user_profile:profiles!event_comments_user_id_fkey (
          id,
          name,
          role,
          avatar_url
        )
      `)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("comments load error", error);
      return;
    }

    setComments(data || []);
  };



const loadParticipants = async () => {
    const { data, error } = await supabase
      .from("event_participants")
      .select(`
        id,
        event_id,
        user_id,
        created_at,
        user_profile:profiles!event_participants_user_id_fkey (
          id,
          name,
          role,
          avatar_url
        )
      `)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("participants load error", error);
      return;
    }

    setParticipants(data || []);
  };

  const loadUserSports = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("user_sports")
      .select("sport")
      .eq("user_id", user.id);

    if (error) {
      console.error("user sports load error", error);
      return;
    }

    setUserSports((data || []).map((row) => row.sport));
  };

  const handleSignUp = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: {
        data: {
          name: authName || authEmail.split("@")[0],
        },
      },
    });

    if (error) {
      alert(`Sign up failed: ${error.message}`);
      return;
    }

    alert("Account created. You can now sign in.");
    setAuthMode("signin");
  };

  const handleSignIn = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });

    if (error) {
      alert(`Sign in failed: ${error.message}`);
      return;
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const toggleSportInForm = (sportId) => {
    const alreadySelected = form.sports.includes(sportId);

    if (alreadySelected) {
      const nextSports = form.sports.filter((id) => id !== sportId);
      const nextDistanceSports = getDistanceSportIds(nextSports);
      const nextRange =
        distanceRanges[nextDistanceSports[0]] || { min: 1, max: 50 };

      setForm({
        ...form,
        sports: nextSports,
        distance: Math.min(form.distance, nextRange.max),
      });
      return;
    }

    const nextSports = [...form.sports, sportId];
    const nextDistanceSports = getDistanceSportIds(nextSports);
    const nextRange =
      distanceRanges[nextDistanceSports[0]] || { min: 1, max: 50 };

    setForm({
      ...form,
      sports: nextSports,
      distance: form.distance < nextRange.min ? nextRange.min : form.distance,
    });
  };

  const saveEvent = async (e) => {
    e.preventDefault();

    if (!form.title || !form.date || !form.time || !form.location) {
      alert("Please fill in all required fields.");
      return;
    }

    if (form.sports.length === 0) {
      alert("Please select at least one sport.");
      return;
    }

    if (!user?.id) {
      alert("You must be signed in.");
      return;
    }

    setSavingEvent(true);

    const payload = {
      title: form.title,
      sports: form.sports,
      distance: showDistance ? form.distance : null,
      date: form.date,
      time: form.time,
      location: form.location,
      description: form.description,
    };

    if (editId) {
      const { error } = await supabase
        .from("events")
        .update(payload)
        .eq("id", editId);

      if (error) {
        setSavingEvent(false);
        alert(`Saving failed: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("events").insert({
        creator_id: user.id,
        ...payload,
      });

      if (error) {
        setSavingEvent(false);
        alert(`Creating event failed: ${error.message}`);
        return;
      }
    }

    await loadEvents();
    setSavingEvent(false);
    closeModal();
  };




const deleteEvent = async (id) => {
    if (!confirm("Delete this event?")) return;

    const { error } = await supabase.from("events").delete().eq("id", id);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    await loadEverything();
  };

  const toggleParticipation = async (event) => {
    if (!user?.id) {
      alert("You must be signed in.");
      return;
    }

    if (event.joinedByMe) {
      const { error } = await supabase
        .from("event_participants")
        .delete()
        .eq("event_id", event.id)
        .eq("user_id", user.id);

      if (error) {
        alert(`Leaving event failed: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("event_participants").insert({
        event_id: event.id,
        user_id: user.id,
      });

      if (error) {
        alert(`Joining event failed: ${error.message}`);
        return;
      }
    }

    await loadParticipants();
  };

  const toggleLike = async (event) => {
    if (!user?.id) {
      alert("You must be signed in.");
      return;
    }

    if (event.likedByMe) {
      const { error } = await supabase
        .from("event_likes")
        .delete()
        .eq("event_id", event.id)
        .eq("user_id", user.id);

      if (error) {
        alert(`Removing like failed: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("event_likes").insert({
        event_id: event.id,
        user_id: user.id,
      });

      if (error) {
        alert(`Liking event failed: ${error.message}`);
        return;
      }
    }

    await loadLikes();
  };

  const postComment = async (eventId) => {
    if (!user?.id) {
      alert("You must be signed in.");
      return;
    }

    const text = (commentText[eventId] || "").trim();
    if (!text) return;

    const { error } = await supabase.from("event_comments").insert({
      event_id: eventId,
      user_id: user.id,
      text,
    });

    if (error) {
      alert(`Posting comment failed: ${error.message}`);
      return;
    }

    setCommentText((prev) => ({ ...prev, [eventId]: "" }));
    await loadComments();
  };

  const deleteComment = async (commentId) => {
    const { error } = await supabase
      .from("event_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      alert(`Deleting comment failed: ${error.message}`);
      return;
    }

    await loadComments();
  };

  const downloadIcs = (event) => {
    const start = `${event.date.replaceAll("-","")}T${event.time.replace(":", "")}00`;
    const endDate = new Date(`${event.date}T${event.time}:00`);
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
      `LOCATION:${event.location}`,
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
    const q = encodeURIComponent(location);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
  };




if (!session) {
    return (
      <main style={authPage}>
        <div style={authCard}>
          <h1 style={logo}>Endurance</h1>

          <form onSubmit={authMode === "signin" ? handleSignIn : handleSignUp}>
            {authMode === "signup" && (
              <input
                placeholder="Name"
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
                style={input}
              />
            )}

            <input
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              style={input}
            />

            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              style={input}
            />

            <button style={primaryButton}>
              {authMode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <button
            style={secondaryButton}
            onClick={() =>
              setAuthMode(authMode === "signin" ? "signup" : "signin")
            }
          >
            {authMode === "signin"
              ? "Create new account"
              : "Back to sign in"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <header style={header}>
        <div style={logo}>Endurance</div>

        <div style={headerRight}>
          <Link href={`/profile/${user.id}`} style={headerButton}>
            My Profile
          </Link>

          {isModerator && (
            <Link href="/admin" style={headerButton}>
              Admin
            </Link>
          )}

          {canManageEvents && (
            <button style={headerButton} onClick={openNew}>
              + Event
            </button>
          )}

          <button style={headerButton} onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </header>

      <TeamRequestsPanel user={user} />

      {pageError && <div style={errorBox}>{pageError}</div>}

      <section style={eventsSection}>
        <div style={eventsHeader}>
          <div style={eventsTitle}>Upcoming Events</div>
          <div style={eventsHint}>← Swipe to see more →</div>
        </div>

        <div style={horizontalScroll}>
          {eventCards.map((event) => (
            <div key={event.id} style={card}>
              <div style={cardTop}>
                <div style={eventTitle}>{event.title}</div>

                {(event.isOwner || isModerator) && (
                  <div style={cardActions}>
                    <button
                      style={smallButton}
                      onClick={() => openEdit(event)}
                    >
                      Edit
                    </button>

                    <button
                      style={smallButton}
                      onClick={() => deleteEvent(event.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <div style={sportsRow}>
                {(event.sports || []).map((sportId) => {
                  const sport = SPORTS.find((s) => s.id === sportId);
                  if (!sport) return null;

                  return (
                    <span key={sportId} style={sportBadge}>
                      {sport.icon} {sport.label}
                    </span>
                  );
                })}
              </div>

              {event.distance && (
                <div style={distanceRow}>
                  Distance: {event.distance} km
                </div>
              )}

              <div style={metaRow}>
                <span>{formatDate(event.date)}</span>
                <span>{formatTime(event.time)}</span>
              </div>

              <div style={locationRow}>
                📍 {event.location}
              </div>

              <div style={creatorRow}>
                by{" "}
                <Link
                  href={`/profile/${event.creator_profile?.id}`}
                  style={profileLink}
                >
                  {event.creator_profile?.name || "Unknown"}
                </Link>
              </div>

              {event.description && (
                <div style={description}>
                  {event.description}
                </div>
              )}

              <div style={actionsRow}>
                <button
                  style={likeButton}
                  onClick={() => toggleLike(event)}
                >
                  ❤️ {event.likes.length}
                </button>

                <button
                  style={joinButton}
                  onClick={() => toggleParticipation(event)}
                >
                  {event.joinedByMe ? "Leave" : "Join"} (
                  {event.participants.length})
                </button>

                <button
                  style={mapButton}
                  onClick={() => openMaps(event.location)}
                >
                  Map
                </button>

                <button
                  style={calendarButton}
                  onClick={() => downloadIcs(event)}
                >
                  Calendar
                </button>
              </div>

              <div style={commentsBlock}>
                {event.comments.map((comment) => (
                  <div key={comment.id} style={commentRow}>
                    <Link
                      href={`/profile/${comment.user_profile?.id}`}
                      style={profileLink}
                    >
                      {comment.user_profile?.name || "User"}
                    </Link>

                    <span style={commentText}>
                      {comment.text}
                    </span>

                    {(comment.user_id === user.id || isModerator) && (
                      <button
                        style={deleteCommentButton}
                        onClick={() => deleteComment(comment.id)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                <div style={commentInputRow}>
                  <input
                    placeholder="Write a comment..."
                    value={commentText[event.id] || ""}
                    onChange={(e) =>
                      setCommentText((prev) => ({
                        ...prev,
                        [event.id]: e.target.value,
                      }))
                    }
                    style={commentInput}
                  />

                  <button
                    style={commentButton}
                    onClick={() => postComment(event.id)}
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>



{open && (
        <div style={modalOverlay}>
          <div style={modal}>
            <h2 style={modalTitle}>
              {editId ? "Edit Event" : "Create Event"}
            </h2>

            <form onSubmit={saveEvent}>
              <input
                placeholder="Event title"
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value })
                }
                style={input}
              />

              <div style={sportsPicker}>
                {SPORTS.map((sport) => (
                  <button
                    type="button"
                    key={sport.id}
                    onClick={() => toggleSportInForm(sport.id)}
                    style={{
                      ...sportButton,
                      background: form.sports.includes(sport.id)
                        ? "#1f6feb"
                        : "#111",
                    }}
                  >
                    {sport.icon} {sport.label}
                  </button>
                ))}
              </div>

              {showDistance && (
                <div style={distanceBlock}>
                  <div>
                    Distance: {form.distance} km
                  </div>

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
                style={input}
              />

              <input
                type="time"
                value={form.time}
                onChange={(e) =>
                  setForm({ ...form, time: e.target.value })
                }
                style={input}
              />

              <input
                placeholder="Location"
                value={form.location}
                onChange={(e) =>
                  setForm({ ...form, location: e.target.value })
                }
                style={input}
              />

              <textarea
                placeholder="Description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                style={textarea}
              />

              <div style={modalActions}>
                <button
                  type="button"
                  style={secondaryButton}
                  onClick={closeModal}
                >
                  Cancel
                </button>

                <button
                  style={primaryButton}
                  disabled={savingEvent}
                >
                  {savingEvent ? "Saving..." : "Save Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}


/* =========================
   STYLES
========================= */

const page = {
  background: "#000",
  minHeight: "100vh",
  color: "white",
  fontFamily: "system-ui",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  padding: 20,
  borderBottom: "1px solid #222",
};

const logo = {
  fontSize: 24,
  fontWeight: 700,
};

const headerRight = {
  display: "flex",
  gap: 12,
};

const headerButton = {
  background: "#111",
  border: "1px solid #333",
  padding: "8px 14px",
  borderRadius: 10,
  cursor: "pointer",
  textDecoration: "none",
  color: "white",
};

const eventsSection = {
  padding: 20,
};

const eventsHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
};

const eventsTitle = {
  fontSize: 20,
  fontWeight: 700,
};

const eventsHint = {
  fontSize: 13,
  opacity: 0.6,
};

const horizontalScroll = {
  display: "flex",
  gap: 16,
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  WebkitOverflowScrolling: "touch",
};

const card = {
  background: "#111",
  padding: 20,
  borderRadius: 20,
  minWidth: "82vw",
  maxWidth: "82vw",
  scrollSnapAlign: "start",
  flexShrink: 0,
  border: "1px solid #222",
};

const eventTitle = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 6,
};

const sportsRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 10,
};

const sportBadge = {
  background: "#222",
  padding: "4px 8px",
  borderRadius: 8,
  fontSize: 12,
};

const metaRow = {
  display: "flex",
  gap: 10,
  fontSize: 14,
  marginBottom: 4,
};

const locationRow = {
  fontSize: 14,
  marginBottom: 8,
};

const description = {
  fontSize: 14,
  marginTop: 8,
};

const actionsRow = {
  display: "flex",
  gap: 8,
  marginTop: 12,
};

const likeButton = {
  background: "#111",
  border: "1px solid #333",
  padding: "6px 10px",
  borderRadius: 8,
  cursor: "pointer",
  color: "white",
};

const joinButton = likeButton;
const mapButton = likeButton;
const calendarButton = likeButton;

const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const modal = {
  background: "#111",
  padding: 30,
  borderRadius: 16,
  width: 420,
  maxWidth: "90%",
};

const modalTitle = {
  marginBottom: 16,
};

const input = {
  width: "100%",
  marginBottom: 10,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #333",
  background: "#000",
  color: "white",
};

const textarea = {
  ...input,
  minHeight: 80,
};

const primaryButton = {
  background: "#1f6feb",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  color: "white",
  cursor: "pointer",
};

const secondaryButton = {
  ...primaryButton,
  background: "#333",
};

const modalActions = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 12,
};

const sportsPicker = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 12,
};

const sportButton = {
  border: "1px solid #333",
  borderRadius: 10,
  padding: "6px 10px",
  color: "white",
  cursor: "pointer",
};

const distanceBlock = {
  marginBottom: 10,
};

const authPage = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#000",
};

const authCard = {
  background: "#111",
  padding: 30,
  borderRadius: 16,
  width: 320,
};

const errorBox = {
  background: "#441",
  padding: 12,
  margin: 20,
  borderRadius: 8,
};





  
  
  

