"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function MessagesPage() {
  const [user, setUser] = useState(null);
  const [threads, setThreads] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [unreadByThread, setUnreadByThread] = useState({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    loadInbox();
  }, []);

  const filteredThreads = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) return threads;

    return threads.filter((thread) => {
      const other = profilesById[thread.otherUserId];
      const haystack = [
        other?.name,
        other?.email,
        other?.location,
        other?.role,
        thread.last_message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(cleanQuery);
    });
  }, [query, threads, profilesById]);

  async function loadInbox() {
    try {
      setLoading(true);
      setErrorText("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const currentUser = session?.user || null;
      setUser(currentUser);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      const { data: threadRows, error: threadError } = await supabase
        .from("chat_threads")
        .select("*")
        .or(`user_a.eq.${currentUser.id},user_b.eq.${currentUser.id}`)
        .order("updated_at", { ascending: false });

      if (threadError) throw threadError;

      const normalizedThreads = (threadRows || []).map((thread) => {
        const otherUserId =
          thread.user_a === currentUser.id ? thread.user_b : thread.user_a;

        return {
          ...thread,
          otherUserId,
        };
      });

      const otherIds = [
        ...new Set(
          normalizedThreads
            .map((thread) => thread.otherUserId)
            .filter(Boolean)
        ),
      ];

      let nextProfilesById = {};

      if (otherIds.length) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, name, email, location, avatar_url, role")
          .in("id", otherIds);

        if (profileError) throw profileError;

        nextProfilesById = Object.fromEntries(
          (profiles || []).map((profile) => [profile.id, profile])
        );
      }

      const threadIds = normalizedThreads.map((thread) => thread.id);
      let nextUnreadByThread = {};

      if (threadIds.length) {
        const { data: unreadMessages, error: unreadError } = await supabase
          .from("chat_messages")
          .select("id, thread_id")
          .in("thread_id", threadIds)
          .eq("receiver_id", currentUser.id)
          .is("read_at", null);

        if (!unreadError) {
          nextUnreadByThread = (unreadMessages || []).reduce((acc, message) => {
            acc[message.thread_id] = (acc[message.thread_id] || 0) + 1;
            return acc;
          }, {});
        }
      }

      setProfilesById(nextProfilesById);
      setUnreadByThread(nextUnreadByThread);
      setThreads(normalizedThreads);
    } catch (err) {
      console.error("messages inbox error", err);
      setErrorText(err?.message || "Could not load conversations.");
    } finally {
      setLoading(false);
    }
  }

  function initials(name = "?") {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);

    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  function formatThreadTime(value) {
    if (!value) return "";

    const date = new Date(value);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  }

  return (
    <main style={app}>
      <header style={header}>
        <Link href="/" style={backButton}>
          ←
        </Link>

        <img src="/logo-endurance.png" alt="Endurance" style={logo} />

        <button type="button" onClick={loadInbox} style={refreshButton}>
          ↻
        </button>
      </header>

      <section style={panel}>
        <div style={titleRow}>
          <div>
            <div style={kicker}>Endurance Messenger</div>
            <h1 style={title}>Messages</h1>
          </div>

          <div style={countPill}>
            {threads.length} {threads.length === 1 ? "chat" : "chats"}
          </div>
        </div>

        <div style={searchWrap}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#e4ef16"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flex: "0 0 auto" }}
          >
            <circle cx="11" cy="11" r="7.5" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations..."
            style={searchInput}
          />
        </div>

        {loading ? (
          <div style={stateCard}>Loading conversations...</div>
        ) : !user ? (
          <div style={stateCard}>Please sign in to view your conversations.</div>
        ) : errorText ? (
          <div style={errorCard}>{errorText}</div>
        ) : threads.length === 0 ? (
          <div style={emptyCard}>
            <div style={emptyIcon}>💬</div>
            <div style={emptyTitle}>No conversations yet</div>
            <div style={emptyText}>
              Open a profile and start a chat with someone from your team.
            </div>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div style={stateCard}>No conversations found.</div>
        ) : (
          <div style={list}>
            {filteredThreads.map((thread) => {
              const other = profilesById[thread.otherUserId];
              const displayName = other?.name || other?.email || "Unknown user";
              const unread = unreadByThread[thread.id] || 0;

              return (
                <Link
                  key={thread.id}
                  href={`/messages/${thread.otherUserId}`}
                  style={{
                    ...threadRow,
                    borderColor:
                      unread > 0
                        ? "rgba(228,239,22,0.36)"
                        : "rgba(255,255,255,0.08)",
                    background:
                      unread > 0
                        ? "linear-gradient(135deg, rgba(228,239,22,0.095), rgba(255,255,255,0.045))"
                        : "rgba(255,255,255,0.045)",
                  }}
                >
                  <div style={avatar}>
                    {other?.avatar_url ? (
                      <img src={other.avatar_url} alt={displayName} style={avatarImg} />
                    ) : (
                      initials(displayName)
                    )}
                  </div>

                  <div style={threadText}>
                    <div style={threadTopLine}>
                      <div style={threadName}>{displayName}</div>
                      <div style={threadTime}>
                        {formatThreadTime(thread.last_message_at || thread.updated_at)}
                      </div>
                    </div>

                    <div style={threadMeta}>
                      {other?.role ? <span style={rolePill}>{other.role}</span> : null}
                      {other?.location ? <span style={locationText}>{other.location}</span> : null}
                    </div>

                    <div style={lastMessage}>
                      {thread.last_message || "No messages yet."}
                    </div>
                  </div>

                  {unread > 0 ? (
                    <div style={unreadBadge}>{unread > 9 ? "9+" : unread}</div>
                  ) : (
                    <div style={chevron}>›</div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

const app = {
  minHeight: "100svh",
  background:
    "radial-gradient(circle at 78% 0%, rgba(228,239,22,0.10), transparent 28%), #050505",
  color: "white",
  padding: "12px 16px 32px",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const header = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  display: "grid",
  gridTemplateColumns: "42px 1fr 42px",
  alignItems: "center",
  gap: 10,
  padding: "10px 0 14px",
  background: "linear-gradient(to bottom, #050505 82%, rgba(5,5,5,0))",
};

const logo = {
  height: 62,
  width: "auto",
  maxWidth: "72vw",
  justifySelf: "center",
  filter: "drop-shadow(0 14px 26px rgba(0,0,0,0.70))",
};

const backButton = {
  width: 42,
  height: 42,
  borderRadius: 15,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "white",
  textDecoration: "none",
  fontSize: 24,
};

const refreshButton = {
  width: 42,
  height: 42,
  borderRadius: 15,
  display: "grid",
  placeItems: "center",
  background: "rgba(228,239,22,0.11)",
  border: "1px solid rgba(228,239,22,0.28)",
  color: "#e4ef16",
  fontSize: 20,
};

const panel = {
  width: "min(720px, 100%)",
  margin: "0 auto",
  borderRadius: 30,
  padding: 16,
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.030))",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 28px 90px rgba(0,0,0,0.55)",
};

const titleRow = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const kicker = {
  color: "#e4ef16",
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

const title = {
  margin: "2px 0 0",
  fontSize: "clamp(30px, 8vw, 46px)",
  lineHeight: 0.95,
  letterSpacing: "-0.06em",
};

const countPill = {
  padding: "8px 11px",
  borderRadius: 999,
  background: "rgba(228,239,22,0.11)",
  border: "1px solid rgba(228,239,22,0.22)",
  color: "#e4ef16",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const searchWrap = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 20,
  background: "rgba(0,0,0,0.24)",
  border: "1px solid rgba(255,255,255,0.09)",
};

const searchInput = {
  width: "100%",
  minWidth: 0,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "white",
  fontSize: 16,
};

const list = { display: "grid", gap: 10 };

const threadRow = {
  display: "grid",
  gridTemplateColumns: "54px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  padding: 12,
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.08)",
  color: "white",
  textDecoration: "none",
};

const avatar = {
  width: 54,
  height: 54,
  borderRadius: "50%",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(135deg, rgba(228,239,22,0.98), rgba(255,255,255,0.14))",
  color: "#050505",
  fontWeight: 1000,
  border: "2px solid rgba(228,239,22,0.72)",
};

const avatarImg = { width: "100%", height: "100%", objectFit: "cover" };
const threadText = { minWidth: 0 };

const threadTopLine = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minWidth: 0,
};

const threadName = {
  fontSize: 17,
  fontWeight: 950,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const threadTime = {
  color: "rgba(255,255,255,0.46)",
  fontSize: 12,
  fontWeight: 750,
  whiteSpace: "nowrap",
};

const threadMeta = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginTop: 4,
  minWidth: 0,
};

const rolePill = {
  color: "#e4ef16",
  background: "rgba(228,239,22,0.10)",
  borderRadius: 999,
  padding: "3px 7px",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "lowercase",
};

const locationText = {
  color: "rgba(255,255,255,0.48)",
  fontSize: 12,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const lastMessage = {
  color: "rgba(255,255,255,0.62)",
  fontSize: 14,
  marginTop: 6,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const unreadBadge = {
  minWidth: 26,
  height: 26,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "#e4ef16",
  color: "#050505",
  fontSize: 12,
  fontWeight: 1000,
};

const chevron = {
  color: "rgba(255,255,255,0.35)",
  fontSize: 28,
  lineHeight: 1,
};

const stateCard = {
  padding: 18,
  borderRadius: 22,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.68)",
};

const errorCard = {
  ...stateCard,
  background: "rgba(120,20,20,0.28)",
  color: "#ffd6d6",
};

const emptyCard = {
  ...stateCard,
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 8,
  padding: 28,
};

const emptyIcon = { fontSize: 34 };
const emptyTitle = { fontSize: 18, fontWeight: 950 };

const emptyText = {
  color: "rgba(255,255,255,0.56)",
  fontSize: 14,
  lineHeight: 1.4,
};
