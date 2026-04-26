"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function ChatBox({
  currentUserId,
  chatType = "direct",
  otherUserId = null,
  eventId = null,
  title = "Chat",
}) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const channelKey =
    chatType === "event"
      ? `event-chat-${eventId}`
      : `direct-chat-${[currentUserId, otherUserId].sort().join("-")}`;

  useEffect(() => {
    if (!currentUserId) return;

    checkAccessAndLoad();

    const channel = supabase
      .channel(channelKey)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const next = payload.new;

          const belongsToChat =
            chatType === "event"
              ? next.chat_type === "event" && next.event_id === eventId
              : next.chat_type === "direct" &&
                ((next.sender_id === currentUserId &&
                  next.receiver_id === otherUserId) ||
                  (next.sender_id === otherUserId &&
                    next.receiver_id === currentUserId));

          if (belongsToChat) {
            setMessages((prev) => [...prev, next]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, otherUserId, eventId, chatType]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function checkAccessAndLoad() {
    setLoading(true);
    setError("");

    try {
      if (chatType === "direct") {
        const { data: teamRows, error: teamError } = await supabase
          .from("training_partners")
          .select("*")
          .or(
            `and(requester_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
          )
          .eq("status", "accepted")
          .limit(1);

        if (teamError) throw teamError;

        if (!teamRows?.length) {
          setAllowed(false);
          setError("You can only message people in your team.");
          setLoading(false);
          return;
        }

        setAllowed(true);

        const { data, error: loadError } = await supabase
          .from("chat_messages")
          .select(`
            *,
            sender_profile:profiles!chat_messages_sender_id_fkey (
              id,
              name,
              avatar_url
            )
          `)
          .eq("chat_type", "direct")
          .or(
            `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
          )
          .order("created_at", { ascending: true });

        if (loadError) throw loadError;
        setMessages(data || []);
      }

      if (chatType === "event") {
        const { data: eventRows, error: eventError } = await supabase
          .from("events")
          .select("id, creator_id")
          .eq("id", eventId)
          .limit(1);

        if (eventError) throw eventError;

        const event = eventRows?.[0];

        if (!event) {
          setAllowed(false);
          setError("Event not found.");
          setLoading(false);
          return;
        }

        const { data: profileRows } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", currentUserId)
          .limit(1);

        const role = profileRows?.[0]?.role;

        const { data: participantRows } = await supabase
          .from("event_participants")
          .select("id")
          .eq("event_id", eventId)
          .eq("user_id", currentUserId)
          .limit(1);

        const canUseEventChat =
          event.creator_id === currentUserId ||
          role === "moderator" ||
          role === "organizer" ||
          !!participantRows?.length;

        if (!canUseEventChat) {
          setAllowed(false);
          setError("Only participants, organizers and moderators can use this event chat.");
          setLoading(false);
          return;
        }

        setAllowed(true);

        const { data, error: loadError } = await supabase
          .from("chat_messages")
          .select(`
            *,
            sender_profile:profiles!chat_messages_sender_id_fkey (
              id,
              name,
              avatar_url
            )
          `)
          .eq("chat_type", "event")
          .eq("event_id", eventId)
          .order("created_at", { ascending: true });

        if (loadError) throw loadError;
        setMessages(data || []);
      }
    } catch (err) {
      setError(err.message || "Could not load chat.");
    }

    setLoading(false);
  }

  async function sendMessage() {
    const cleanText = text.trim();

    if (!cleanText || sending || !allowed) return;

    setSending(true);
    setError("");

    try {
      const payload =
        chatType === "event"
          ? {
              chat_type: "event",
              event_id: eventId,
              sender_id: currentUserId,
              receiver_id: null,
              text: cleanText,
            }
          : {
              chat_type: "direct",
              event_id: null,
              sender_id: currentUserId,
              receiver_id: otherUserId,
              text: cleanText,
            };

      const { error: insertError } = await supabase
        .from("chat_messages")
        .insert(payload);

      if (insertError) throw insertError;

      setText("");
    } catch (err) {
      setError(err.message || "Could not send message.");
    }

    setSending(false);
  }

  if (loading) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>Loading chat...</div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h2 style={styles.title}>{title}</h2>
          <p style={styles.error}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.top}>
          <h2 style={styles.title}>{title}</h2>
          <Link href="/" style={styles.backLink}>
            Back
          </Link>
        </div>

        <div style={styles.messages}>
          {messages.length === 0 ? (
            <div style={styles.empty}>No messages yet.</div>
          ) : (
            messages.map((message) => {
              const mine = message.sender_id === currentUserId;
              const name =
                message.sender_profile?.name ||
                (mine ? "You" : "Team member");

              return (
                <div
                  key={message.id}
                  style={{
                    ...styles.messageRow,
                    justifyContent: mine ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      ...styles.bubble,
                      background: mine ? "#e4ef16" : "#222",
                      color: mine ? "#000" : "#fff",
                    }}
                  >
                    {!mine && <div style={styles.sender}>{name}</div>}
                    <div>{message.text}</div>
                    <div
                      style={{
                        ...styles.time,
                        color: mine ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.45)",
                      }}
                    >
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div ref={bottomRef} />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.inputRow}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a message..."
            style={styles.input}
          />

          <button
            type="button"
            onClick={sendMessage}
            disabled={sending || !text.trim()}
            style={{
              ...styles.sendBtn,
              opacity: sending || !text.trim() ? 0.55 : 1,
            }}
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    background: "#050505",
    color: "white",
    padding: 18,
  },
  card: {
    maxWidth: 760,
    margin: "0 auto",
    background: "#0d0d0d",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 24,
    padding: 16,
  },
  top: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    margin: 0,
    fontSize: 24,
  },
  backLink: {
    color: "#e4ef16",
    textDecoration: "none",
    fontWeight: 800,
  },
  messages: {
    height: "62vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 10,
    background: "#080808",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  empty: {
    opacity: 0.6,
    padding: 12,
  },
  messageRow: {
    display: "flex",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    padding: "10px 12px",
    lineHeight: 1.35,
    fontSize: 15,
    wordBreak: "break-word",
  },
  sender: {
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.7,
    marginBottom: 4,
  },
  time: {
    fontSize: 11,
    marginTop: 5,
    textAlign: "right",
  },
  inputRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    marginTop: 12,
  },
  input: {
    minHeight: 54,
    resize: "vertical",
    borderRadius: 16,
    padding: 12,
    background: "#1c1c1c",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 15,
  },
  sendBtn: {
    border: "none",
    borderRadius: 16,
    padding: "0 18px",
    background: "#e4ef16",
    color: "#000",
    fontWeight: 900,
    cursor: "pointer",
  },
  error: {
    color: "#ffb4b4",
  },
};
