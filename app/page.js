"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import TeamRequestsPanel from "../components/TeamRequestsPanel";

export default function Home() {
  const emptyEvent = {
    title: "",
    sport: "Running",
    distance: 10,
    date: "",
    time: "",
    location: "",
    description: "",
  };

  const sports = [
    "Running",
    "Road Cycling",
    "Trail Running",
    "Mountain Biking",
    "Walking",
  ];

  const distanceRanges = {
    Running: { min: 1, max: 50 },
    "Road Cycling": { min: 10, max: 250 },
    "Trail Running": { min: 1, max: 50 },
    "Mountain Biking": { min: 5, max: 120 },
    Walking: { min: 1, max: 40 },
  };

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [events, setEvents] = useState([]);
  const [likes, setLikes] = useState([]);
  const [comments, setComments] = useState([]);
  const [participants, setParticipants] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyEvent);

  const [commentText, setCommentText] = useState({});

  const [authMode, setAuthMode] = useState("signin");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const range = distanceRanges[form.sport] || { min: 1, max: 50 };

  const isModerator = profile?.role === "moderator";
  const isOrganizer = profile?.role === "organisator";
  const canManageEvents = isModerator || isOrganizer;

  const formatDate = (d) => {
    if (!d) return "";
    const x = new Date(d);
    return x.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatDateTime = (date, time) => new Date(`${date}T${time}`);

  const openNew = () => {
    setEditId(null);
    setForm(emptyEvent);
    setOpen(true);
  };

  const openEdit = (event) => {
    setEditId(event.id);
    setForm({
      title: event.title,
      sport: event.sport,
      distance: event.distance,
      date: event.date,
      time: event.time,
      location: event.location,
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

    return [...events]
      .filter((e) => formatDateTime(e.date, e.time) >= now)
      .sort((a, b) => formatDateTime(a.date, a.time) - formatDateTime(b.date, b.time))
      .map((e) => {
        const eventLikes = likes.filter((l) => l.event_id === e.id);
        const eventComments = comments.filter((c) => c.event_id === e.id);
        const eventParticipants = participants.filter((p) => p.event_id === e.id);

        return {
          ...e,
          likes: eventLikes,
          comments: eventComments,
          participants: eventParticipants,
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
      setProfile(null);
      setEvents([]);
      setLikes([]);
      setComments([]);
      setParticipants([]);
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
      return;
    }

    setProfile(data);
  };

  const loadEverything = async () => {
    await Promise.all([
      loadEvents(),
      loadLikes(),
      loadComments(),
      loadParticipants(),
    ]);
  };

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select(`
        *,
        creator_profile:profiles!events_creator_id_fkey (
          id,
          naam,
          email,
          role,
          avatar_url
        )
      `)
      .order("date", { ascending: true })
      .order("time", { ascending: true });

    if (error) {
      console.error("events load error", error);
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
          naam,
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
        tekst,
        created_at,
        user_profile:profiles!event_comments_user_id_fkey (
          id,
          naam,
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
          naam,
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

  const handleSignUp = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: {
        data: {
          naam: authName || authEmail.split("@")[0],
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



const saveEvent = async (e) => {
    e.preventDefault();

    if (!form.title || !form.date || !form.time || !form.location) {
      alert("Please fill in all required fields.");
      return;
    }

    if (!user?.id) {
      alert("You must be signed in.");
      return;
    }

    setSavingEvent(true);

    if (editId) {
      const { error } = await supabase
        .from("events")
        .update({
          title: form.title,
          sport: form.sport,
          distance: form.distance,
          date: form.date,
          time: form.time,
          location: form.location,
          description: form.description,
        })
        .eq("id", editId);

      if (error) {
        setSavingEvent(false);
        alert(`Saving failed: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("events").insert({
        creator_id: user.id,
        title: form.title,
        sport: form.sport,
        distance: form.distance,
        date: form.date,
        time: form.time,
        location: form.location,
        description: form.description,
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
      tekst: text,
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
    const start = `${event.date.replaceAll("-", "")}T${event.time.replace(":", "")}00`;
    const endDate = new Date(`${event.date}T${event.time}:00`);
    endDate.setHours(endDate.getHours() + 1);

    const yyyy = endDate.getFullYear();
    const mm = String(endDate.getMonth() + 1).padStart(2, "0");
    const dd = String(endDate.getDate()).padStart(2, "0");
    const hh = String(endDate.getHours()).padStart(2, "0");
    const mi = String(endDate.getMinutes()).padStart(2, "0");
    const end = `${yyyy}${mm}${dd}T${hh}${mi}00`;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `SUMMARY:${event.title}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `LOCATION:${event.location}`,
      `DESCRIPTION:${event.sport} training via Endurance`,
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

  if (loading) {
    return (
      <main style={app}>
        <div style={emptyCard}>Loading...</div>
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
              Sign In
            </button>

            <button
              style={authMode === "signup" ? primaryBtn : secondaryBtn}
              onClick={() => setAuthMode("signup")}
              type="button"
            >
              Create Account
            </button>
          </div>

          <form onSubmit={authMode === "signup" ? handleSignUp : handleSignIn} style={grid}>
            {authMode === "signup" && (
              <input
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
                placeholder="Name"
                style={field}
              />
            )}

            <input
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email address"
              type="email"
              style={field}
            />

            <input
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
              type="password"
              style={field}
            />

            <button type="submit" style={primaryBtn}>
              {authMode === "signup" ? "Register" : "Sign In"}
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
          Signed in as <strong>{profile?.naam || user?.email}</strong>
          <div style={roleBadge}>{profile?.role || "user"}</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/profile/${user.id}`} style={actionLinkBtn}>
            My Profile
          </Link>

          {isModerator && (
            <Link href="/admin" style={actionLinkBtn}>
              Admin
            </Link>
          )}

          <button onClick={handleSignOut} style={secondaryBtn}>
            Sign Out
          </button>
        </div>
      </section>

      {user?.id && <TeamRequestsPanel userId={user.id} />}

      {open && (
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
                <div style={label}>Choose sport</div>
                <select
                  value={form.sport}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sport: e.target.value,
                      distance: distanceRanges[e.target.value].min,
                    })
                  }
                  style={field}
                >
                  {sports.map((sport) => (
                    <option key={sport} value={sport}>
                      {sport}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={label}>Distance: {form.distance} km</div>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step="1"
                  value={form.distance}
                  onChange={(e) => setForm({ ...form, distance: Number(e.target.value) })}
                  style={{ width: "100%" }}
                />
                <div style={rangeRow}>
                  <span>{range.min} km</span>
                  <span>{range.max} km</span>
                </div>
              </div>

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

              <div>
                <div style={label}>Description</div>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
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
      )}


<section style={eventsSection}>
        {eventCards.length === 0 ? (
          <div style={emptyCard}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              No upcoming events
            </div>
            <div style={{ opacity: 0.7 }}>
              As soon as events are added, they will appear here.
            </div>
          </div>
        ) : (
          <div style={horizontalScroll}>
            {eventCards.map((event) => (
              <div key={event.id} style={card}>
                <div style={sportTag}>{event.sport}</div>
                <h2 style={cardTitle}>{event.title}</h2>

                <div style={distanceText}>{event.distance} km</div>

                <div style={meta}>
                  <div>📅 {formatDate(event.date)}</div>
                  <div>⏰ {event.time}</div>
                  <div style={creatorText}>
                    👤 Created by{" "}
                    <Link
                      href={`/profile/${event.creator_id}`}
                      style={profileLink}
                    >
                      {event.creator_profile?.naam ||
                        event.creator_profile?.email ||
                        "Unknown"}
                    </Link>
                  </div>

                  <button onClick={() => openMaps(event.location)} style={mapBtn}>
                    📍 {event.location}
                  </button>

                  <div style={{ opacity: 0.75 }}>
                    Participants: {event.participants.length}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {event.participants.map((p) => (
                      <Link
                        key={p.id}
                        href={`/profile/${p.user_id}`}
                        style={chipLink}
                      >
                        {p.user_profile?.naam || "Unknown"}
                      </Link>
                    ))}
                  </div>
                </div>

                <div style={communityBox}>
                  <div style={communityTitle}>Description</div>

                  <div style={communityText}>
                    {event.description?.trim()
                      ? event.description
                      : "No description added yet."}
                  </div>

                  <div style={likeRow}>
                    <button onClick={() => toggleLike(event)} style={likeBtn}>
                      {event.likedByMe ? "❤️ Liked" : "🤍 Like"}
                    </button>

                    <div style={likeCount}>
                      {event.likes.length} like{event.likes.length === 1 ? "" : "s"}
                    </div>

                    {!!event.likes.length && (
                      <div style={likeUsers}>
                        {event.likes.map((l, index) => (
                          <span key={l.id}>
                            <Link
                              href={`/profile/${l.user_id}`}
                              style={inlineProfileLink}
                            >
                              {l.user_profile?.naam || "Unknown"}
                            </Link>
                            {index < event.likes.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={commentsWrap}>
                    <div style={communityTitle}>Comments</div>

                    {event.comments.length ? (
                      <div style={commentList}>
                        {event.comments.map((c) => (
                          <div key={c.id} style={commentItem}>
                            <div style={commentHeader}>
                              <div style={commentName}>
                                <Link
                                  href={`/profile/${c.user_id}`}
                                  style={inlineProfileLink}
                                >
                                  {c.user_profile?.naam || "Unknown"}
                                </Link>
                              </div>

                              {(c.user_id === user?.id || isModerator) && (
                                <button
                                  type="button"
                                  onClick={() => deleteComment(c.id)}
                                  style={miniDeleteBtn}
                                >
                                  Delete
                                </button>
                              )}
                            </div>

                            <div style={commentTextStyle}>{c.tekst}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={communityMuted}>No comments yet.</div>
                    )}

                    <div style={commentForm}>
                      <div style={commentUserLabel}>
                        Commenting as <strong>{profile?.naam || user?.email}</strong>
                      </div>

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
                        onClick={() => postComment(event.id)}
                        style={primaryBtnSmall}
                      >
                        Post Comment
                      </button>
                    </div>
                  </div>
                </div>

                <div style={btnRow}>
                  <button onClick={() => toggleParticipation(event)} style={primaryBtnSmall}>
                    {event.joinedByMe ? "Leave Event" : "Join Event"}
                  </button>

                  <button onClick={() => downloadIcs(event)} style={secondaryBtnSmall}>
                    Add to Calendar
                  </button>

                  {(event.isOwner || isModerator) && (
                    <button onClick={() => openEdit(event)} style={secondaryBtnSmall}>
                      Edit
                    </button>
                  )}

                  {(event.isOwner || isModerator) && (
                    <button onClick={() => deleteEvent(event.id)} style={dangerBtnSmall}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {canManageEvents && (
        <button onClick={openNew} style={fab}>
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

const actionLinkBtn = {
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

const horizontalScroll = {
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

const field = {
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

const distanceText = {
  fontSize: 16,
  fontWeight: "600",
  color: "#cfd3d6",
  marginBottom: 14,
};

const creatorText = {
  fontSize: 14,
  opacity: 0.85,
};

const profileLink = {
  color: "#e4ef16",
  textDecoration: "none",
  fontWeight: "bold",
};

const inlineProfileLink = {
  color: "#e4ef16",
  textDecoration: "none",
};

const chipLink = {
  background: "#1f1f1f",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 13,
  color: "white",
  textDecoration: "none",
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

const commentsWrap = {
  display: "grid",
  gap: 10,
};

const commentList = {
  display: "grid",
  gap: 10,
};

const commentItem = {
  background: "#151515",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 14,
  padding: 12,
};

const commentHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 4,
};

const commentName = {
  fontSize: 13,
  fontWeight: 700,
  color: "#e4ef16",
};

const commentTextStyle = {
  fontSize: 14,
  lineHeight: 1.45,
  color: "#e3e3e3",
  whiteSpace: "pre-wrap",
};

const communityMuted = {
  fontSize: 14,
  opacity: 0.6,
};

const commentUserLabel = {
  fontSize: 13,
  opacity: 0.75,
};

const commentForm = {
  display: "grid",
  gap: 10,
  marginTop: 6,
};

const commentField = {
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

  


  
