"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
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
      .limit(1)
      .maybeSingle();

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

  const toggleSport = (sportId) => {
    setForm((prev) => {
      const alreadySelected = prev.sports.includes(sportId);

      if (alreadySelected) {
        const nextSports = prev.sports.filter((id) => id !== sportId);
        const nextDistanceSports = getDistanceSportIds(nextSports);
        const nextRange =
          distanceRanges[nextDistanceSports[0]] || { min: 1, max: 50 };

        return {
          ...prev,
          sports: nextSports,
          distance: Math.min(prev.distance, nextRange.max),
        };
      }

      const nextSports = [...prev.sports, sportId];
      const nextDistanceSports = getDistanceSportIds(nextSports);
      const nextRange =
        distanceRanges[nextDistanceSports[0]] || { min: 1, max: 50 };

      return {
        ...prev,
        sports: nextSports,
        distance:
          prev.distance < nextRange.min ? nextRange.min : prev.distance,
      };
    });
  };

  const saveEvent = async () => {
    if (!user?.id) return;

    if (!form.title || !form.date) {
      alert("Title and date are required");
      return;
    }

    setSavingEvent(true);

    const payload = {
      title: form.title,
      sports: form.sports,
      distance: showDistance ? Number(form.distance) : null,
      date: form.date,
      time: form.time || null,
      location: form.location || null,
      description: form.description || null,
      creator_id: user.id,
    };

    let result;

    if (editId) {
      result = await supabase.from("events").update(payload).eq("id", editId);
    } else {
      result = await supabase.from("events").insert(payload);
    }

    setSavingEvent(false);

    if (result.error) {
      console.error("event save error", result.error);
      alert(result.error.message);
      return;
    }

    closeModal();
    loadEvents();
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

      if (!error) loadLikes();
    } else {
      const { error } = await supabase.from("event_likes").insert({
        event_id: eventId,
        user_id: user.id,
      });

      if (!error) loadLikes();
    }
  };

  const toggleJoin = async (eventId) => {
    if (!user?.id) return;

    const existing = participants.find(
      (p) => p.event_id === eventId && p.user_id === user.id
    );

    if (existing) {
      const { error } = await supabase
        .from("event_participants")
        .delete()
        .eq("id", existing.id);

      if (!error) loadParticipants();
    } else {
      const { error } = await supabase.from("event_participants").insert({
        event_id: eventId,
        user_id: user.id,
      });

      if (!error) loadParticipants();
    }
  };

  const submitComment = async (eventId) => {
    if (!user?.id) return;

    const text = (commentText[eventId] || "").trim();
    if (!text) return;

    const { error } = await supabase.from("event_comments").insert({
      event_id: eventId,
      user_id: user.id,
      text,
    });

    if (error) {
      console.error(error);
      return;
    }

    setCommentText((prev) => ({
      ...prev,
      [eventId]: "",
    }));

    loadComments();
  };

  const deleteComment = async (commentId) => {
    const { error } = await supabase
      .from("event_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      console.error("delete comment error", error);
      return;
    }

    loadComments();
  };

  const deleteEvent = async (eventId) => {
    if (!confirm("Delete this event?")) return;

    const { error } = await supabase.from("events").delete().eq("id", eventId);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    loadEvents();
  };

  const downloadIcs = (event) => {
    const start = `${event.date.replaceAll("-", "")}T${(event.time || "12:00").replace(":", "")}00`;
    const endDate = new Date(`${event.date}T${event.time || "12:00"}:00`);
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
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
  };

  if (loading) {
    return (
      <div style={{ padding: 40, color: "white", background: "#050505", minHeight: "100vh" }}>
        Loading Endurance...
      </div>
    );
                      }



if (!session) {
    return (
      <main style={authPage}>
        <div style={authCard}>
          <h1 style={logo}>Endurance</h1>

          {authMode === "signup" && (
            <input
              style={input}
              placeholder="Name"
              value={authName}
              onChange={(e) => setAuthName(e.target.value)}
            />
          )}

          <input
            style={input}
            placeholder="Email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
          />

          <input
            style={input}
            placeholder="Password"
            type="password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
          />

          <button
            style={primaryButton}
            onClick={authMode === "signin" ? handleSignIn : handleSignUp}
          >
            {authMode === "signin" ? "Sign In" : "Create Account"}
          </button>

          <button
            style={secondaryButton}
            onClick={() =>
              setAuthMode(authMode === "signin" ? "signup" : "signin")
            }
          >
            {authMode === "signin" ? "Need an account?" : "Back to sign in"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={topBar}>
        <div style={logo}>Endurance</div>

        <div style={topBarButtons}>
          <Link href={`/profile/${user.id}`} style={topButton}>
            My Profile
          </Link>

          {canManageEvents && (
            <button style={topButton} onClick={openNew}>
              + Event
            </button>
          )}

          <button style={topButton} onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </div>

      {pageError ? <div style={errorBox}>{pageError}</div> : null}

      <section style={eventsSection}>
        <div style={eventsHeader}>
          <div style={eventsTitle}>Upcoming Events</div>
          <div style={eventsHint}>← Swipe to see more →</div>
        </div>

        {eventCards.length === 0 ? (
          <div style={emptyState}>No upcoming events found.</div>
        ) : (
          <div style={horizontalScroll}>
            {eventCards.map((event) => {
              const sportLabels = getSportLabels(event.sports || []);
              const eventLikes = likes.filter((like) => like.event_id === event.id);
              const eventComments = comments.filter(
                (comment) => comment.event_id === event.id
              );
              const eventParticipants = participants.filter(
                (participant) => participant.event_id === event.id
              );

              const joinedByMe = eventParticipants.some(
                (participant) => participant.user_id === user?.id
              );

              return (
                <div key={event.id} style={eventCard}>
                  <div style={cardHeader}>
                    <div>
                      <div style={eventTitle}>{event.title}</div>
                      <div style={cardMeta}>
                        {formatDate(event.date)}
                        {event.time ? ` • ${formatTime(event.time)}` : ""}
                      </div>
                    </div>

                    {(event.creator_id === user?.id || isModerator) && (
                      <button
                        style={smallGhostButton}
                        onClick={() => openEdit(event)}
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  <div style={sportsWrap}>
                    {sportLabels.map((label) => (
                      <span key={label} style={sportPill}>
                        {label}
                      </span>
                    ))}
                  </div>

                  {event.distance ? (
                    <div style={distanceText}>{event.distance} km</div>
                  ) : null}

                  <div style={locationText}>{event.location}</div>

                  {event.description ? (
                    <div style={descriptionText}>{event.description}</div>
                  ) : null}

                  <div style={buttonRow}>
                    <button
                      style={secondaryButtonSmall}
                      onClick={() => toggleLike(event.id)}
                    >
                      ❤️ {eventLikes.length}
                    </button>

                    <button
                      style={primaryButtonSmall}
                      onClick={() => toggleJoin(event.id)}
                    >
                      {joinedByMe ? "Leave" : "Join"} ({eventParticipants.length})
                    </button>

                    <button
                      style={secondaryButtonSmall}
                      onClick={() => downloadIcs(event)}
                    >
                      Calendar
                    </button>

                    <button
                      style={secondaryButtonSmall}
                      onClick={() => openMaps(event.location)}
                    >
                      Maps
                    </button>

                    {(event.creator_id === user?.id || isModerator) && (
                      <button
                        style={dangerButtonSmall}
                        onClick={() => deleteEvent(event.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  <div style={commentsSection}>
                    {eventComments.map((comment) => (
                      <div key={comment.id} style={commentItem}>
                        <strong>{comment.user_profile?.name || "User"}:</strong>{" "}
                        {comment.text}
                      </div>
                    ))}

                    <div style={commentInputRow}>
                      <input
                        style={commentInput}
                        placeholder="Write a comment..."
                        value={commentText[event.id] || ""}
                        onChange={(e) =>
                          setCommentText((prev) => ({
                            ...prev,
                            [event.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        style={primaryButtonSmall}
                        onClick={() => submitComment(event.id)}
                      >
                        Post
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>



{open && (
        <div style={modalOverlay}>
          <div style={modal}>
            <h2 style={modalTitle}>
              {editId ? "Edit Event" : "Create Event"}
            </h2>

            <input
              style={input}
              placeholder="Event title"
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
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
                    <span style={{ marginRight: 6 }}>{sport.icon}</span>
                    {sport.label}
                  </button>
                );
              })}
            </div>

            {showDistance && (
              <div style={distanceBlock}>
                <div style={distanceLabel}>
                  Distance: {form.distance} km
                </div>
                <input
                  type="range"
                  min={activeDistanceRange.min}
                  max={activeDistanceRange.max}
                  value={form.distance}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      distance: Number(e.target.value),
                    }))
                  }
                  style={{ width: "100%" }}
                />
              </div>
            )}

            <input
              style={input}
              type="date"
              value={form.date}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, date: e.target.value }))
              }
            />

            <input
              style={input}
              type="time"
              value={form.time}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, time: e.target.value }))
              }
            />

            <input
              style={input}
              placeholder="Location"
              value={form.location}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, location: e.target.value }))
              }
            />

            <textarea
              style={textarea}
              placeholder="Description"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
            />

            <div style={modalButtons}>
              <button style={secondaryButton} onClick={closeModal}>
                Cancel
              </button>
              <button style={primaryButton} onClick={saveEvent}>
                {savingEvent ? "Saving..." : "Save Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const page = {
  minHeight: "100vh",
  background: "#050505",
  color: "white",
  padding: 16,
  fontFamily: "sans-serif",
};

const authPage = {
  minHeight: "100vh",
  background: "#050505",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const authCard = {
  width: "100%",
  maxWidth: 380,
  background: "#111",
  borderRadius: 24,
  padding: 24,
  border: "1px solid rgba(255,255,255,0.06)",
};

const logo = {
  fontSize: 28,
  fontWeight: 800,
  marginBottom: 20,
};

const topBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 18,
};

const topBarButtons = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const topButton = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
  border: "none",
};

const input = {
  width: "100%",
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: "14px 12px",
  borderRadius: 12,
  boxSizing: "border-box",
  marginBottom: 12,
};

const textarea = {
  ...input,
  minHeight: 100,
  resize: "vertical",
};

const primaryButton = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: "bold",
};

const secondaryButton = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const primaryButtonSmall = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: "bold",
};

const secondaryButtonSmall = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
};

const smallGhostButton = {
  background: "transparent",
  color: "#e4ef16",
  border: "1px solid rgba(228,239,22,0.3)",
  padding: "8px 12px",
  borderRadius: 10,
};

const dangerButtonSmall = {
  background: "#5a1f1f",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
};

const errorBox = {
  background: "#3a1616",
  color: "#ffd2d2",
  padding: 16,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.05)",
  marginBottom: 18,
};

const eventsSection = {
  paddingBottom: 110,
};

const eventsHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
  paddingInline: 2,
};

const eventsTitle = {
  fontSize: 20,
  fontWeight: 700,
};

const eventsHint = {
  fontSize: 13,
  opacity: 0.65,
};

const horizontalScroll = {
  display: "flex",
  gap: 16,
  overflowX: "auto",
  paddingBottom: 8,
  paddingRight: 24,
  scrollSnapType: "x mandatory",
  WebkitOverflowScrolling: "touch",
};

const emptyState = {
  background: "#111",
  padding: 24,
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.05)",
};

const eventCard = {
  background: "#111",
  padding: 20,
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.05)",
  minWidth: "82vw",
  maxWidth: "82vw",
  scrollSnapAlign: "start",
  flexShrink: 0,
};

const cardHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 10,
};

const eventTitle = {
  fontSize: 24,
  fontWeight: 700,
};

const cardMeta = {
  fontSize: 14,
  opacity: 0.7,
  marginTop: 4,
};

const sportsWrap = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 12,
};

const sportPill = {
  background: "rgba(228,239,22,0.12)",
  color: "#e4ef16",
  padding: "7px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: "bold",
};

const distanceText = {
  fontSize: 16,
  fontWeight: 600,
  color: "#cfd3d6",
  marginBottom: 8,
};

const locationText = {
  fontSize: 15,
  marginBottom: 8,
};

const descriptionText = {
  fontSize: 14,
  lineHeight: 1.5,
  color: "#d6d6d6",
  marginBottom: 14,
};

const buttonRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 14,
};

const commentsSection = {
  display: "grid",
  gap: 10,
};

const commentItem = {
  background: "#151515",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 14,
  padding: 12,
  fontSize: 14,
};

const commentInputRow = {
  display: "flex",
  gap: 8,
  marginTop: 4,
};

const commentInput = {
  flex: 1,
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: "12px 12px",
  borderRadius: 12,
};

const modalOverlay = {
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

const modalTitle = {
  margin: 0,
  marginBottom: 14,
  fontSize: 24,
};

const sportsPicker = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 12,
};

const sportChip = {
  background: "#222",
  border: "1px solid #333",
  color: "white",
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

const distanceBlock = {
  marginBottom: 12,
};

const distanceLabel = {
  marginBottom: 8,
  fontSize: 14,
};

const modalButtons = {
  display: "flex",
  gap: 10,
  marginTop: 12,
};




  
