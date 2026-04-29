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
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [liveStatus, setLiveStatus] = useState("connecting");

  useEffect(() => {
    loadInbox();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`messenger-overview-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_threads" },
        () => loadInbox(false)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        (payload) => {
          const message = payload.new || payload.old;

          if (
            message?.sender_id === user.id ||
            message?.receiver_id === user.id
          ) {
            loadInbox(false);
          }
        }
      )
      .subscribe((status) => {
        setLiveStatus(status === "SUBSCRIBED" ? "live" : "connecting");
      });

    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  const unreadTotal = Object.values(unreadByThread).reduce(
    (sum, count) => sum + Number(count || 0),
    0
  );

  const filteredThreads = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    return threads.filter((thread) => {
      const other = profilesById[thread.otherUserId];
      const unread = unreadByThread[thread.id] || 0;

      if (filter === "unread" && unread === 0) return false;
      if (!cleanQuery) return true;

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
  }, [query, filter, threads, profilesById, unreadByThread]);

  async function loadInbox(showLoader = true) {
    try {
      if (showLoader) setLoading(true);
      setErrorText("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const currentUser = session?.user || null;
      setUser(currentUser);

      if (!currentUser) {
        if (showLoader) setLoading(false);
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
      if (showLoader) setLoading(false);
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

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    if (isYesterday) return "Yesterday";

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  }

  return (
    <main style={app}>
      <header style={topHeader}>
        <Link href="/" style={headerButton}>
          ←
        </Link>

        <img src="/logo-endurance.png" alt="Endurance" style={logo} />

        <button type="button" onClick={() => loadInbox()} style={headerButton}>
          ↻
        </button>
      </header>

      <section style={hero}>
        <div style={heroTop}>
          <div>
            <div style={kicker}>Endurance Messenger</div>
            <h1 style={title}>Messages</h1>
          </div>

          <div style={unreadSummary}>
            <div style={unreadNumber}>{unreadTotal}</div>
            <div style={unreadLabel}>unread</div>
          </div>
        </div>

        <div style={statusRow}>
          <span
            style={{
              ...statusDot,
              background: liveStatus === "live" ? "#e4ef16" : "#777",
            }}
          />
          <span>{liveStatus === "live" ? "Live updates active" : "Connecting realtime..."}</span>
        </div>

        <div style={searchBar}>
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

        <div style={tabs}>
          <button
            type="button"
            onClick={() => setFilter("all")}
            style={filter === "all" ? activeTab : tab}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => setFilter("unread")}
            style={filter === "unread" ? activeTab : tab}
          >
            Unread
          </button>
        </div>
      </section>

      <section style={listPanel}>
        {loading ? (
          <StateCard title="Loading conversations..." />
        ) : !user ? (
          <StateCard title="Please sign in to view your conversations." />
        ) : errorText ? (
          <StateCard title={errorText} danger />
        ) : threads.length === 0 ? (
          <EmptyState />
        ) : filteredThreads.length === 0 ? (
          <StateCard title="No conversations found." />
        ) : (
          <div style={list}>
            {filteredThreads.map((thread) => {
              const other = profilesById[thread.otherUserId];
              const displayName = other?.name || other?.email || "Unknown user";
              const unread = unreadByThread[thread.id] || 0;
              const hasUnread = unread > 0;

              return (
                <Link
                  key={thread.id}
                  href={`/messages/${thread.otherUserId}`}
                  style={{
                    ...threadRow,
                    borderColor: hasUnread
                      ? "rgba(228,239,22,0.44)"
                      : "rgba(255,255,255,0.08)",
                    background: hasUnread
                      ? "linear-gradient(135deg, rgba(228,239,22,0.105), rgba(255,255,255,0.045))"
                      : "rgba(255,255,255,0.045)",
                  }}
                >
                  <div style={avatarWrap}>
                    <div style={avatar}>
                      {other?.avatar_url ? (
                        <img src={other.avatar_url} alt={displayName} style={avatarImg} />
                      ) : (
                        initials(displayName)
                      )}
                    </div>

                    {hasUnread ? <div style={unreadDot} /> : null}
                  </div>

                  <div style={threadText}>
                    <div style={threadTop}>
                      <div style={threadName}>{displayName}</div>
                      <div style={threadTime}>
                        {formatThreadTime(thread.last_message_at || thread.updated_at)}
                      </div>
                    </div>

                    <div style={threadMeta}>
                      {other?.role ? <span style={rolePill}>{other.role}</span> : null}
                      {other?.location ? (
                        <span style={locationText}>{other.location}</span>
                      ) : null}
                    </div>

                    <div style={lastMessage}>
                      {thread.last_message || "No messages yet."}
                    </div>
                  </div>

                  {hasUnread ? (
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

function StateCard({ title, danger = false }) {
  return (
    <div
      style={{
        ...stateCard,
        background: danger ? "rgba(120,20,20,0.28)" : stateCard.background,
        color: danger ? "#ffd6d6" : stateCard.color,
      }}
    >
      {title}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={emptyCard}>
      <div style={emptyIcon}>💬</div>
      <div style={emptyTitle}>No conversations yet</div>
      <div style={emptyText}>
        Open a profile and start a chat with someone from your team.
      </div>
    </div>
  );
}

const app = {
  minHeight: "100svh",
  background:
    "radial-gradient(circle at 76% 0%, rgba(228,239,22,0.12), transparent 30%), #050505",
  color: "white",
  padding: "10px 16px 34px",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const topHeader = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  display: "grid",
  gridTemplateColumns: "40px 1fr 40px",
  alignItems: "center",
  gap: 10,
  padding: "8px 0 10px",
  background: "linear-gradient(to bottom, #050505 84%, rgba(5,5,5,0))",
};

const logo = {
  height: 54,
  width: "auto",
  maxWidth: "72vw",
  justifySelf: "center",
  filter: "drop-shadow(0 14px 26px rgba(0,0,0,0.70))",
};

const headerButton = {
  width: 40,
  height: 40,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.085), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.11)",
  color: "white",
  textDecoration: "none",
  fontSize: 22,
};

const hero = {
  width: "min(600px, calc(100vw - 32px))",
  margin: "0 auto 12px",
  borderRadius: 28,
  padding: 15,
  background:
    "radial-gradient(circle at 86% 0%, rgba(228,239,22,0.15), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.030))",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 22px 68px rgba(0,0,0,0.45)",
};

const heroTop = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};

const kicker = {
  color: "#e4ef16",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: "0.11em",
  textTransform: "uppercase",
};

const title = {
  margin: "2px 0 0",
  fontSize: "clamp(32px, 8vw, 48px)",
  lineHeight: 0.9,
  letterSpacing: "-0.07em",
};

const unreadSummary = {
  minWidth: 66,
  padding: "9px 11px",
  borderRadius: 19,
  background: "rgba(228,239,22,0.11)",
  border: "1px solid rgba(228,239,22,0.23)",
  textAlign: "center",
};

const unreadNumber = {
  color: "#e4ef16",
  fontSize: 23,
  fontWeight: 1000,
  lineHeight: 1,
};

const unreadLabel = {
  color: "rgba(255,255,255,0.62)",
  fontSize: 10,
  fontWeight: 850,
  marginTop: 3,
};

const statusRow = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  color: "rgba(255,255,255,0.58)",
  fontSize: 12,
  fontWeight: 750,
  marginBottom: 11,
};

const statusDot = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  boxShadow: "0 0 14px rgba(228,239,22,0.45)",
};

const searchBar = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 11,
  padding: "11px 13px",
  borderRadius: 19,
  background: "rgba(0,0,0,0.25)",
  border: "1px solid rgba(255,255,255,0.09)",
};

const searchInput = {
  width: "100%",
  minWidth: 0,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "white",
  fontSize: 15,
};

const tabs = {
  display: "flex",
  gap: 7,
};

const tab = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.055)",
  color: "rgba(255,255,255,0.72)",
  padding: "8px 12px",
  borderRadius: 999,
  fontWeight: 850,
  fontSize: 13,
};

const activeTab = {
  ...tab,
  background: "#e4ef16",
  color: "#050505",
  border: "1px solid #e4ef16",
};

const listPanel = {
  width: "min(600px, calc(100vw - 32px))",
  margin: "0 auto",
  borderRadius: 26,
  padding: 9,
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.052), rgba(255,255,255,0.025))",
  border: "1px solid rgba(255,255,255,0.08)",
};

const list = {
  display: "grid",
  gap: 9,
};

const threadRow = {
  display: "grid",
  gridTemplateColumns: "52px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 11,
  padding: 11,
  borderRadius: 21,
  border: "1px solid rgba(255,255,255,0.08)",
  color: "white",
  textDecoration: "none",
  boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
};

const avatarWrap = {
  position: "relative",
  width: 52,
  height: 52,
};

const avatar = {
  width: 52,
  height: 52,
  borderRadius: "50%",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(135deg, rgba(228,239,22,0.98), rgba(255,255,255,0.14))",
  color: "#050505",
  fontWeight: 1000,
  border: "2px solid rgba(228,239,22,0.70)",
};

const avatarImg = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const unreadDot = {
  position: "absolute",
  right: 1,
  bottom: 2,
  width: 13,
  height: 13,
  borderRadius: "50%",
  background: "#e4ef16",
  border: "2px solid #111",
};

const threadText = {
  minWidth: 0,
};

const threadTop = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minWidth: 0,
};

const threadName = {
  fontSize: 16,
  fontWeight: 950,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const threadTime = {
  color: "rgba(255,255,255,0.46)",
  fontSize: 11,
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
  fontSize: 10,
  fontWeight: 900,
  textTransform: "lowercase",
};

const locationText = {
  color: "rgba(255,255,255,0.48)",
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const lastMessage = {
  color: "rgba(255,255,255,0.62)",
  fontSize: 13,
  marginTop: 6,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const unreadBadge = {
  minWidth: 24,
  height: 24,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "#e4ef16",
  color: "#050505",
  fontSize: 11,
  fontWeight: 1000,
};

const chevron = {
  color: "rgba(255,255,255,0.35)",
  fontSize: 26,
  lineHeight: 1,
};

const stateCard = {
  padding: 18,
  borderRadius: 21,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.68)",
};

const emptyCard = {
  ...stateCard,
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 8,
  padding: 28,
};

const emptyIcon = {
  fontSize: 34,
};

const emptyTitle = {
  fontSize: 18,
  fontWeight: 950,
};

const emptyText = {
  color: "rgba(255,255,255,0.56)",
  fontSize: 14,
  lineHeight: 1.4,
};
