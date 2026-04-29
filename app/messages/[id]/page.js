"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function DirectMessagePage() {
  const params = useParams();
  const otherUserId = params?.id;

  const [user, setUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [otherProfile, setOtherProfile] = useState(null);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [liveStatus, setLiveStatus] = useState("connecting");

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!otherUserId) return;
    loadChat();
  }, [otherUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!thread?.id || !user?.id) return;

    const channel = supabase
      .channel(`direct-message-${thread.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${thread.id}`,
        },
        async (payload) => {
          const newMessage = payload.new;

          const senderProfile =
            newMessage.sender_id === user.id
              ? myProfile
              : otherProfile;

          setMessages((prev) => {
            if (prev.some((message) => message.id === newMessage.id)) return prev;

            return [
              ...prev,
              {
                ...newMessage,
                sender_profile: senderProfile || null,
              },
            ];
          });

          if (newMessage.receiver_id === user.id) {
            await markRead(thread.id, user.id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${thread.id}`,
        },
        (payload) => {
          const updated = payload.new;

          setMessages((prev) =>
            prev.map((message) =>
              message.id === updated.id ? { ...message, ...updated } : message
            )
          );
        }
      )
      .subscribe((status) => {
        setLiveStatus(status === "SUBSCRIBED" ? "live" : "connecting");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [thread?.id, user?.id, myProfile?.id, otherProfile?.id]);

  const groupedMessages = useMemo(() => {
    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const next = messages[index + 1];

      const startsNewDay =
        !previous ||
        new Date(previous.created_at).toDateString() !==
          new Date(message.created_at).toDateString();

      const sameSenderAsPrevious =
        previous && previous.sender_id === message.sender_id;
      const sameSenderAsNext = next && next.sender_id === message.sender_id;

      return {
        ...message,
        startsNewDay,
        compactTop: sameSenderAsPrevious && !startsNewDay,
        compactBottom: sameSenderAsNext,
      };
    });
  }, [messages]);

  async function loadChat() {
    try {
      setLoading(true);
      setErrorText("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const currentUser = session?.user;

      if (!currentUser) {
        setLoading(false);
        setErrorText("Please sign in to use messages.");
        return;
      }

      setUser(currentUser);

      const [{ data: myData }, { data: otherData, error: otherError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, name, email, avatar_url, role, location")
            .eq("id", currentUser.id)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("id, name, email, avatar_url, role, location")
            .eq("id", otherUserId)
            .maybeSingle(),
        ]);

      if (otherError) throw otherError;

      setMyProfile(myData || null);
      setOtherProfile(otherData || null);

      let activeThread = await findThread(currentUser.id, otherUserId);

      if (!activeThread) {
        activeThread = await createThread(currentUser.id, otherUserId);
      }

      setThread(activeThread);

      const { data: rows, error: messageError } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("thread_id", activeThread.id)
        .order("created_at", { ascending: true });

      if (messageError) throw messageError;

      const hydrated = (rows || []).map((message) => ({
        ...message,
        sender_profile:
          message.sender_id === currentUser.id ? myData || null : otherData || null,
      }));

      setMessages(hydrated);

      await markRead(activeThread.id, currentUser.id);
    } catch (error) {
      console.error("loadChat error", error);
      setErrorText(error?.message || "Could not load this chat.");
    } finally {
      setLoading(false);
    }
  }

  async function findThread(userA, userB) {
    const { data, error } = await supabase
      .from("chat_threads")
      .select("*")
      .or(`and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    return data?.[0] || null;
  }

  async function createThread(userA, userB) {
    const ordered = [userA, userB].sort();

    const { data, error } = await supabase
      .from("chat_threads")
      .insert({
        user_a: ordered[0],
        user_b: ordered[1],
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) throw error;

    return data;
  }

  async function markRead(threadId, userId) {
    if (!threadId || !userId) return;

    const now = new Date().toISOString();

    await supabase
      .from("chat_messages")
      .update({ read_at: now })
      .eq("thread_id", threadId)
      .eq("receiver_id", userId)
      .is("read_at", null);

    await supabase.from("chat_reads").upsert(
      { thread_id: threadId, user_id: userId, last_read_at: now },
      { onConflict: "thread_id,user_id" }
    );

    setMessages((prev) =>
      prev.map((message) =>
        message.receiver_id === userId && !message.read_at
          ? { ...message, read_at: now }
          : message
      )
    );
  }

  async function sendMessage() {
    const clean = text.trim();

    if (!clean || !user?.id || !otherUserId || !thread?.id || sending) return;

    try {
      setSending(true);
      setText("");

      const now = new Date().toISOString();

      const { data: insertedMessage, error: insertError } = await supabase
        .from("chat_messages")
        .insert({
          thread_id: thread.id,
          sender_id: user.id,
          receiver_id: otherUserId,
          message: clean,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      if (insertedMessage) {
        setMessages((prev) => {
          if (prev.some((message) => message.id === insertedMessage.id)) return prev;

          return [
            ...prev,
            {
              ...insertedMessage,
              sender_profile: myProfile || null,
            },
          ];
        });
      }

      await supabase
        .from("chat_threads")
        .update({
          last_message: clean,
          last_message_at: now,
          updated_at: now,
        })
        .eq("id", thread.id);

      textareaRef.current?.focus();
    } catch (error) {
      console.error("sendMessage error", error);
      setText(clean);
      setErrorText(error?.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  function initials(value = "?") {
    const clean = String(value || "?").trim();
    const parts = clean.split(/\s+/).filter(Boolean);

    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  function displayName(profile, fallback = "User") {
    return profile?.name || profile?.email || fallback;
  }

  function formatTime(value) {
    if (!value) return "";

    return new Date(value).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDay(value) {
    if (!value) return "";

    const date = new Date(value);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) return "Today";

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  function statusLabel(message) {
    if (message.sender_id !== user?.id) return "";
    if (message.read_at) return "Read";
    return "Sent";
  }

  if (loading) {
    return (
      <main style={app}>
        <section style={loadingCard}>
          <img src="/logo-endurance.png" alt="Endurance" style={loadingLogo} />
          <div style={loadingText}>Loading chat...</div>
        </section>
      </main>
    );
  }

  return (
    <main style={app}>
      <section style={chatShell}>
        <header style={chatHeader}>
          <Link href="/messages" style={backButton} aria-label="Back to messages">
            ←
          </Link>

          <Link href={`/profile/${otherUserId}`} style={profileHeader}>
            <div style={headerAvatar}>
              {otherProfile?.avatar_url ? (
                <img
                  src={otherProfile.avatar_url}
                  alt={displayName(otherProfile)}
                  style={avatarImage}
                />
              ) : (
                initials(displayName(otherProfile))
              )}
            </div>

            <div style={headerText}>
              <div style={headerName}>{displayName(otherProfile, "Chat")}</div>

              <div style={headerSubline}>
                <span
                  style={{
                    ...liveDot,
                    background: liveStatus === "live" ? "#e4ef16" : "#777",
                  }}
                />
                <span>{liveStatus === "live" ? "Live chat" : "Connecting..."}</span>
                {otherProfile?.role ? <span>• {otherProfile.role}</span> : null}
              </div>
            </div>
          </Link>

          <button type="button" onClick={loadChat} style={refreshButton} aria-label="Refresh chat">
            ↻
          </button>
        </header>

        {errorText ? (
          <div style={errorBox}>{errorText}</div>
        ) : null}

        <div style={messagesBox}>
          {groupedMessages.length === 0 ? (
            <div style={emptyState}>
              <div style={emptyIcon}>💬</div>
              <div style={emptyTitle}>Start the conversation</div>
              <div style={emptyCopy}>
                Send your first message to {displayName(otherProfile, "this user")}.
              </div>
            </div>
          ) : (
            groupedMessages.map((message) => {
              const mine = message.sender_id === user?.id;

              return (
                <div key={message.id}>
                  {message.startsNewDay ? (
                    <div style={dayDivider}>{formatDay(message.created_at)}</div>
                  ) : null}

                  <div
                    style={{
                      ...messageRow,
                      justifyContent: mine ? "flex-end" : "flex-start",
                      marginTop: message.compactTop ? 3 : 9,
                    }}
                  >
                    {!mine && !message.compactBottom ? (
                      <div style={messageAvatar}>
                        {otherProfile?.avatar_url ? (
                          <img
                            src={otherProfile.avatar_url}
                            alt={displayName(otherProfile)}
                            style={avatarImage}
                          />
                        ) : (
                          initials(displayName(otherProfile))
                        )}
                      </div>
                    ) : !mine ? (
                      <div style={avatarSpacer} />
                    ) : null}

                    <div
                      style={{
                        ...bubble,
                        ...(mine ? myBubble : theirBubble),
                        borderBottomRightRadius: mine && message.compactBottom ? 18 : 7,
                        borderBottomLeftRadius: !mine && message.compactBottom ? 18 : 7,
                      }}
                    >
                      {!mine && !message.compactTop ? (
                        <div style={senderName}>{displayName(otherProfile)}</div>
                      ) : null}

                      <div>{message.message}</div>

                      <div
                        style={{
                          ...messageMeta,
                          color: mine ? "rgba(5,5,5,0.60)" : "rgba(255,255,255,0.50)",
                        }}
                      >
                        <span>{formatTime(message.created_at)}</span>
                        {mine ? <span>{statusLabel(message)}</span> : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div ref={bottomRef} />
        </div>

        <footer style={composer}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Write a message..."
            style={input}
            rows={1}
          />

          <button
            type="button"
            onClick={sendMessage}
            disabled={sending || !text.trim()}
            style={{
              ...sendButton,
              opacity: sending || !text.trim() ? 0.48 : 1,
            }}
            aria-label="Send message"
          >
            {sending ? "…" : "➤"}
          </button>
        </footer>
      </section>
    </main>
  );
}

const app = {
  minHeight: "100svh",
  background:
    "radial-gradient(circle at 76% 0%, rgba(228,239,22,0.13), transparent 32%), #050505",
  color: "white",
  padding: "10px 10px 14px",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const chatShell = {
  width: "min(760px, 100%)",
  height: "calc(100svh - 24px)",
  margin: "0 auto",
  display: "grid",
  gridTemplateRows: "auto auto 1fr auto",
  gap: 10,
  padding: 12,
  borderRadius: 30,
  background:
    "radial-gradient(circle at 86% 0%, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.080), rgba(255,255,255,0.030))",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 26px 86px rgba(0,0,0,0.56)",
};

const chatHeader = {
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr) 42px",
  alignItems: "center",
  gap: 10,
};

const backButton = {
  width: 42,
  height: 42,
  borderRadius: 15,
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
  textDecoration: "none",
  fontSize: 24,
  fontWeight: 900,
};

const refreshButton = {
  width: 42,
  height: 42,
  borderRadius: 15,
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(145deg, rgba(228,239,22,0.12), rgba(255,255,255,0.035))",
  border: "1px solid rgba(228,239,22,0.26)",
  color: "#e4ef16",
  fontSize: 20,
  fontWeight: 900,
};

const profileHeader = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
  color: "white",
  textDecoration: "none",
};

const headerAvatar = {
  width: 48,
  height: 48,
  borderRadius: "50%",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  background:
    "linear-gradient(135deg, rgba(228,239,22,0.98), rgba(255,255,255,0.16))",
  color: "#050505",
  border: "2px solid rgba(228,239,22,0.74)",
  fontWeight: 1000,
};

const avatarImage = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const headerText = {
  minWidth: 0,
};

const headerName = {
  fontSize: "clamp(18px, 4.7vw, 24px)",
  fontWeight: 1000,
  lineHeight: 1.05,
  letterSpacing: "-0.045em",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const headerSubline = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginTop: 4,
  color: "rgba(255,255,255,0.58)",
  fontSize: 12,
  fontWeight: 800,
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const liveDot = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  boxShadow: "0 0 14px rgba(228,239,22,0.55)",
  flex: "0 0 auto",
};

const errorBox = {
  padding: "10px 12px",
  borderRadius: 16,
  background: "rgba(120,20,20,0.28)",
  border: "1px solid rgba(255,120,120,0.22)",
  color: "#ffd2d2",
  fontSize: 13,
  fontWeight: 750,
};

const messagesBox = {
  minHeight: 0,
  overflowY: "auto",
  borderRadius: 24,
  padding: "10px 9px 12px",
  background: "rgba(0,0,0,0.34)",
  border: "1px solid rgba(255,255,255,0.075)",
};

const dayDivider = {
  width: "fit-content",
  margin: "10px auto 7px",
  padding: "5px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.075)",
  color: "rgba(255,255,255,0.56)",
  fontSize: 11,
  fontWeight: 850,
};

const messageRow = {
  display: "flex",
  alignItems: "flex-end",
  gap: 8,
};

const messageAvatar = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  background: "#e4ef16",
  color: "#050505",
  fontSize: 11,
  fontWeight: 1000,
  flex: "0 0 auto",
};

const avatarSpacer = {
  width: 30,
  flex: "0 0 auto",
};

const bubble = {
  maxWidth: "82%",
  padding: "10px 12px 8px",
  borderRadius: 20,
  lineHeight: 1.35,
  fontSize: 15,
  wordBreak: "break-word",
  boxShadow: "0 12px 28px rgba(0,0,0,0.24)",
};

const myBubble = {
  marginLeft: "auto",
  background: "linear-gradient(135deg, #e4ef16, #f2ff37)",
  color: "#050505",
};

const theirBubble = {
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.11), rgba(255,255,255,0.058))",
  color: "white",
  border: "1px solid rgba(255,255,255,0.08)",
};

const senderName = {
  color: "#e4ef16",
  fontSize: 11,
  fontWeight: 1000,
  marginBottom: 4,
};

const messageMeta = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 6,
  fontSize: 10,
  fontWeight: 850,
};

const composer = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 48px",
  gap: 9,
};

const input = {
  width: "100%",
  minHeight: 48,
  maxHeight: 122,
  resize: "vertical",
  borderRadius: 18,
  padding: "12px 13px",
  background: "rgba(255,255,255,0.075)",
  border: "1px solid rgba(255,255,255,0.12)",
  outline: "none",
  color: "white",
  fontSize: 15,
  lineHeight: 1.35,
};

const sendButton = {
  width: 48,
  minHeight: 48,
  border: "none",
  borderRadius: 18,
  background: "#e4ef16",
  color: "#050505",
  fontSize: 21,
  fontWeight: 1000,
  cursor: "pointer",
};

const emptyState = {
  minHeight: "100%",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 7,
  textAlign: "center",
  color: "rgba(255,255,255,0.60)",
  padding: 24,
};

const emptyIcon = {
  fontSize: 36,
};

const emptyTitle = {
  color: "white",
  fontSize: 18,
  fontWeight: 1000,
};

const emptyCopy = {
  maxWidth: 260,
  fontSize: 14,
  lineHeight: 1.4,
};

const loadingCard = {
  minHeight: "calc(100svh - 24px)",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 14,
  borderRadius: 30,
  background:
    "radial-gradient(circle at 76% 0%, rgba(228,239,22,0.12), transparent 30%), rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const loadingLogo = {
  width: "min(68vw, 360px)",
  filter: "drop-shadow(0 18px 32px rgba(0,0,0,0.70))",
};

const loadingText = {
  color: "rgba(255,255,255,0.66)",
  fontWeight: 850,
};
