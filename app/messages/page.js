"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function MessagesPage() {
  const [user, setUser] = useState(null);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    loadInbox();
  }, []);

  async function loadInbox() {
    try {
      setLoading(true);
      setErrorText("");

      const { data: { session } } = await supabase.auth.getSession();
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

      const rows = threadRows || [];
      const otherIds = rows.map((thread) =>
        thread.user_a === currentUser.id ? thread.user_b : thread.user_a
      );

      let profilesById = {};

      if (otherIds.length) {
        const { data: otherProfiles, error: otherError } = await supabase
          .from("profiles")
          .select("id, name, avatar_url, role")
          .in("id", [...new Set(otherIds)]);

        if (otherError) throw otherError;
        profilesById = Object.fromEntries((otherProfiles || []).map((p) => [p.id, p]));
      }

      setThreads(
        rows.map((thread) => {
          const otherUserId = thread.user_a === currentUser.id ? thread.user_b : thread.user_a;
          return { ...thread, otherUserId, otherProfile: profilesById[otherUserId] || null };
        })
      );
    } catch (err) {
      console.error("messages inbox error", err);
      setErrorText(err?.message || "Could not load messages.");
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

  return (
    <main style={app}>
      <div style={topBar}>
        <Link href="/" style={linkBtn}>Back to app</Link>
      </div>

      <section style={card}>
        <h1 style={title}>Messages</h1>

        {loading ? (
          <div style={muted}>Loading messages...</div>
        ) : !user ? (
          <div style={muted}>Please sign in to view messages.</div>
        ) : errorText ? (
          <div style={errorBox}>{errorText}</div>
        ) : threads.length === 0 ? (
          <div style={emptyBox}>
            <div style={{ fontSize: 28 }}>💬</div>
            <div>No conversations yet.</div>
            <div style={mutedSmall}>Open a team member profile and tap Chat.</div>
          </div>
        ) : (
          <div style={list}>
            {threads.map((thread) => {
              const other = thread.otherProfile;
              const name = other?.name || "Unknown user";

              return (
                <Link key={thread.id} href={`/messages/${thread.otherUserId}`} style={threadRow}>
                  <div style={avatar}>
                    {other?.avatar_url ? (
                      <img src={other.avatar_url} alt={name} style={avatarImg} />
                    ) : (
                      initials(name)
                    )}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={threadName}>{name}</div>
                    <div style={lastMessage}>{thread.last_message || "No messages yet."}</div>
                  </div>

                  <div style={timeText}>
                    {thread.updated_at ? new Date(thread.updated_at).toLocaleDateString() : ""}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

const app = { minHeight: "100vh", background: "#050505", color: "white", padding: 16, fontFamily: "sans-serif" };
const topBar = { marginBottom: 16 };
const linkBtn = { display: "inline-block", background: "#2a2a2a", color: "white", textDecoration: "none", padding: "12px 16px", borderRadius: 12 };
const card = { maxWidth: 720, margin: "0 auto", background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 18 };
const title = { margin: "0 0 16px", fontSize: 30 };
const list = { display: "grid", gap: 10 };
const threadRow = { display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, background: "#171717", border: "1px solid rgba(255,255,255,0.06)", color: "white", textDecoration: "none" };
const avatar = { width: 50, height: 50, borderRadius: "50%", background: "#e4ef16", color: "black", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flex: "0 0 auto" };
const avatarImg = { width: "100%", height: "100%", objectFit: "cover" };
const threadName = { fontWeight: 900, fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const lastMessage = { marginTop: 4, color: "rgba(255,255,255,0.62)", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const timeText = { color: "rgba(255,255,255,0.45)", fontSize: 12, whiteSpace: "nowrap" };
const muted = { color: "rgba(255,255,255,0.65)" };
const mutedSmall = { color: "rgba(255,255,255,0.52)", fontSize: 14, marginTop: 6 };
const errorBox = { color: "#ffb4b4" };
const emptyBox = { display: "grid", gap: 8, padding: 22, borderRadius: 18, background: "#0b0b0b", textAlign: "center" };
