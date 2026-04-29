"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const REACTIONS = ["👍", "🔥", "💪", "😂", "❤️", "👏"];

export default function DirectMessagePage() {
  const params = useParams();
  const otherUserId = params?.id;

  const [user, setUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [otherProfile, setOtherProfile] = useState(null);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reactionsByMessageId, setReactionsByMessageId] = useState({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [liveStatus, setLiveStatus] = useState("connecting");
  const [otherTyping, setOtherTyping] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [showActionsFor, setShowActionsFor] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (!otherUserId) return;
    loadChat();
  }, [otherUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherTyping]);

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
            newMessage.sender_id === user.id ? myProfile : otherProfile;

          setMessages((prev) => {
            if (prev.some((message) => message.id === newMessage.id)) return prev;
            return [...prev, { ...newMessage, sender_profile: senderProfile || null }];
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_message_reactions",
        },
        () => loadReactions()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_typing",
          filter: `thread_id=eq.${thread.id}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row || row.user_id === user.id) return;

          const lastTyping = new Date(row.updated_at).getTime();
          const isRecent = Date.now() - lastTyping < 4500;
          setOtherTyping(Boolean(row.is_typing && isRecent));

          setTimeout(() => setOtherTyping(false), 4800);
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
      if (!activeThread) activeThread = await createThread(currentUser.id, otherUserId);

      setThread(activeThread);

      const { data: rows, error: messageError } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("thread_id", activeThread.id)
        .order("created_at", { ascending: true });

      if (messageError) throw messageError;

      const visibleRows = (rows || []).filter((message) => !message.deleted_at);

      const hydrated = visibleRows.map((message) => ({
        ...message,
        sender_profile:
          message.sender_id === currentUser.id ? myData || null : otherData || null,
      }));

      setMessages(hydrated);

      await markRead(activeThread.id, currentUser.id);
      await loadReactions(activeThread.id);
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

  async function loadReactions(threadId = thread?.id) {
    if (!threadId) return;

    const { data, error } = await supabase
      .from("chat_message_reactions")
      .select("id, message_id, user_id, emoji")
      .eq("thread_id", threadId);

    if (error) {
      console.warn("Reactions not available yet:", error.message);
      return;
    }

    const grouped = {};
    (data || []).forEach((reaction) => {
      if (!grouped[reaction.message_id]) grouped[reaction.message_id] = {};
      if (!grouped[reaction.message_id][reaction.emoji]) {
        grouped[reaction.message_id][reaction.emoji] = {
          count: 0,
          mine: false,
        };
      }

      grouped[reaction.message_id][reaction.emoji].count += 1;
      if (reaction.user_id === user?.id) grouped[reaction.message_id][reaction.emoji].mine = true;
    });

    setReactionsByMessageId(grouped);
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

  async function setTyping(isTyping) {
    if (!thread?.id || !user?.id) return;

    await supabase
      .from("chat_typing")
      .upsert(
        {
          thread_id: thread.id,
          user_id: user.id,
          is_typing: isTyping,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "thread_id,user_id" }
      )
      .then(() => null)
      .catch(() => null);
  }

  function handleTyping(value) {
    setText(value);

    if (!thread?.id || !user?.id) return;

    setTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 1800);
  }

  async function sendMessage(media = null) {
    const clean = text.trim();

    if ((!clean && !media) || !user?.id || !otherUserId || !thread?.id || sending) return;

    try {
      setSending(true);

      const now = new Date().toISOString();
      const messageText = clean || (media?.type === "image" ? "Photo" : "Attachment");

      setText("");
      setReplyTo(null);
      setEditingMessage(null);
      await setTyping(false);

      const payload = {
        thread_id: thread.id,
        sender_id: user.id,
        receiver_id: otherUserId,
        message: messageText,
        reply_to_message_id: replyTo?.id || null,
      };

      if (media?.url) {
        payload.media_url = media.url;
        payload.media_type = media.type || "image";
      }

      const { data: insertedMessage, error: insertError } = await supabase
        .from("chat_messages")
        .insert(payload)
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
          last_message: messageText,
          last_message_at: now,
          updated_at: now,
        })
        .eq("id", thread.id);

      textareaRef.current?.focus();
    } catch (error) {
      console.error("sendMessage error", error);
      if (!media) setText(clean);
      setErrorText(error?.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  async function editMessage() {
    const clean = text.trim();
    if (!clean || !editingMessage?.id) return;

    try {
      const { error } = await supabase
        .from("chat_messages")
        .update({
          message: clean,
          edited_at: new Date().toISOString(),
        })
        .eq("id", editingMessage.id)
        .eq("sender_id", user.id);

      if (error) throw error;

      setMessages((prev) =>
        prev.map((message) =>
          message.id === editingMessage.id
            ? { ...message, message: clean, edited_at: new Date().toISOString() }
            : message
        )
      );

      setText("");
      setEditingMessage(null);
    } catch (error) {
      setErrorText(error?.message || "Could not edit message.");
    }
  }

  async function deleteMessage(message) {
    if (!message?.id || message.sender_id !== user?.id) return;

    const confirmed = window.confirm("Delete this message?");
    if (!confirmed) return;

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("chat_messages")
      .update({
        deleted_at: now,
        message: "Message deleted",
      })
      .eq("id", message.id)
      .eq("sender_id", user.id);

    if (error) {
      setErrorText(error.message);
      return;
    }

    setMessages((prev) => prev.filter((item) => item.id !== message.id));
  }

  async function toggleReaction(message, emoji) {
    if (!message?.id || !thread?.id || !user?.id) return;

    const current = reactionsByMessageId[message.id]?.[emoji];
    const mine = current?.mine;

    if (mine) {
      await supabase
        .from("chat_message_reactions")
        .delete()
        .eq("message_id", message.id)
        .eq("user_id", user.id)
        .eq("emoji", emoji);
    } else {
      await supabase.from("chat_message_reactions").upsert(
        {
          thread_id: thread.id,
          message_id: message.id,
          user_id: user.id,
          emoji,
          created_at: new Date().toISOString(),
        },
        { onConflict: "message_id,user_id,emoji" }
      );
    }

    await loadReactions();
  }

  async function uploadMedia(file) {
    if (!file || !user?.id || !thread?.id) return;

    try {
      setUploadingMedia(true);

      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${thread.id}/${user.id}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("chat-media").getPublicUrl(filePath);
      await sendMessage({ url: data.publicUrl, type: file.type?.startsWith("image/") ? "image" : "file" });
    } catch (error) {
      setErrorText(error?.message || "Could not upload media.");
    } finally {
      setUploadingMedia(false);
    }
  }

  function startEdit(message) {
    setEditingMessage(message);
    setReplyTo(null);
    setText(message.message || "");
    textareaRef.current?.focus();
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

  function findReplyMessage(id) {
    if (!id) return null;
    return messages.find((message) => message.id === id);
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
          <div style={errorBox}>
            <span>{errorText}</span>
            <button type="button" onClick={() => setErrorText("")} style={errorClose}>
              ×
            </button>
          </div>
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
              const replyMessage = findReplyMessage(message.reply_to_message_id);
              const messageReactions = reactionsByMessageId[message.id] || {};

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

                    <div style={messageStack}>
                      <div
                        onClick={() => setShowActionsFor(showActionsFor === message.id ? null : message.id)}
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

                        {replyMessage ? (
                          <div style={replyPreview}>
                            <strong>{replyMessage.sender_id === user?.id ? "You" : displayName(otherProfile)}</strong>
                            <span>{replyMessage.message}</span>
                          </div>
                        ) : null}

                        {message.media_url ? (
                          message.media_type === "image" ? (
                            <img src={message.media_url} alt="Shared media" style={mediaImage} />
                          ) : (
                            <a href={message.media_url} target="_blank" rel="noreferrer" style={fileLink}>
                              Open attachment
                            </a>
                          )
                        ) : null}

                        <div>{message.message}</div>

                        <div
                          style={{
                            ...messageMeta,
                            color: mine ? "rgba(5,5,5,0.60)" : "rgba(255,255,255,0.50)",
                          }}
                        >
                          <span>{formatTime(message.created_at)}</span>
                          {message.edited_at ? <span>Edited</span> : null}
                          {mine ? <span>{statusLabel(message)}</span> : null}
                        </div>
                      </div>

                      {Object.keys(messageReactions).length > 0 ? (
                        <div style={{ ...reactionSummary, justifyContent: mine ? "flex-end" : "flex-start" }}>
                          {Object.entries(messageReactions).map(([emoji, data]) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => toggleReaction(message, emoji)}
                              style={{
                                ...reactionChip,
                                borderColor: data.mine ? "rgba(228,239,22,0.55)" : "rgba(255,255,255,0.10)",
                              }}
                            >
                              {emoji} {data.count}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {showActionsFor === message.id ? (
                        <div style={{ ...actionsBar, justifyContent: mine ? "flex-end" : "flex-start" }}>
                          {REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => toggleReaction(message, emoji)}
                              style={emojiButton}
                            >
                              {emoji}
                            </button>
                          ))}

                          <button type="button" onClick={() => setReplyTo(message)} style={smallAction}>
                            Reply
                          </button>

                          {mine ? (
                            <>
                              <button type="button" onClick={() => startEdit(message)} style={smallAction}>
                                Edit
                              </button>
                              <button type="button" onClick={() => deleteMessage(message)} style={smallActionDanger}>
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {otherTyping ? (
            <div style={typingRow}>
              <div style={messageAvatar}>
                {otherProfile?.avatar_url ? (
                  <img src={otherProfile.avatar_url} alt={displayName(otherProfile)} style={avatarImage} />
                ) : (
                  initials(displayName(otherProfile))
                )}
              </div>

              <div style={typingBubble}>
                <span style={typingDot} />
                <span style={typingDot} />
                <span style={typingDot} />
              </div>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        {(replyTo || editingMessage) && (
          <div style={contextBar}>
            <div style={{ minWidth: 0 }}>
              <strong>{editingMessage ? "Editing message" : "Replying to"}</strong>
              <span>{(editingMessage || replyTo)?.message}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setReplyTo(null);
                setEditingMessage(null);
                setText("");
              }}
              style={contextClose}
            >
              ×
            </button>
          </div>
        )}

        <footer style={composer}>
          <label style={attachButton}>
            +
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadMedia(file);
                event.target.value = "";
              }}
            />
          </label>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => handleTyping(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                editingMessage ? editMessage() : sendMessage();
              }
            }}
            placeholder={
              editingMessage
                ? "Edit message..."
                : `Message ${displayName(otherProfile, "user")}...`
            }
            style={input}
            rows={1}
          />

          <button
            type="button"
            onClick={editingMessage ? editMessage : () => sendMessage()}
            disabled={sending || uploadingMedia || !text.trim()}
            style={{
              ...sendButton,
              opacity: sending || uploadingMedia || !text.trim() ? 0.48 : 1,
            }}
            aria-label="Send message"
          >
            {sending || uploadingMedia ? "…" : "➤"}
          </button>
        </footer>
      </section>
    </main>
  );
}

const app = {
  height: "100svh",
  overflow: "hidden",
  background:
    "radial-gradient(circle at 76% 0%, rgba(228,239,22,0.13), transparent 32%), #050505",
  color: "white",
  padding: 8,
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const chatShell = {
  width: "min(720px, 100%)",
  height: "calc(100svh - 16px)",
  margin: "0 auto",
  display: "grid",
  gridTemplateRows: "auto auto minmax(0, 1fr) auto auto",
  gap: 8,
  padding: 10,
  borderRadius: 26,
  background:
    "radial-gradient(circle at 86% 0%, rgba(228,239,22,0.10), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.080), rgba(255,255,255,0.030))",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 24px 76px rgba(0,0,0,0.56)",
};

const chatHeader = {
  display: "grid",
  gridTemplateColumns: "38px minmax(0, 1fr) 38px",
  alignItems: "center",
  gap: 8,
};

const backButton = {
  width: 38,
  height: 38,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
  textDecoration: "none",
  fontSize: 22,
  fontWeight: 900,
};

const refreshButton = {
  width: 38,
  height: 38,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(145deg, rgba(228,239,22,0.12), rgba(255,255,255,0.035))",
  border: "1px solid rgba(228,239,22,0.26)",
  color: "#e4ef16",
  fontSize: 18,
  fontWeight: 900,
};

const profileHeader = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  minWidth: 0,
  color: "white",
  textDecoration: "none",
};

const headerAvatar = {
  width: 42,
  height: 42,
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
  fontSize: "clamp(17px, 4.6vw, 23px)",
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
  marginTop: 3,
  color: "rgba(255,255,255,0.58)",
  fontSize: 11,
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
  padding: "9px 11px",
  borderRadius: 15,
  background: "rgba(120,20,20,0.28)",
  border: "1px solid rgba(255,120,120,0.22)",
  color: "#ffd2d2",
  fontSize: 13,
  fontWeight: 750,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const errorClose = {
  background: "transparent",
  color: "#ffd2d2",
  border: "none",
  fontSize: 18,
};

const messagesBox = {
  minHeight: 0,
  overflowY: "auto",
  borderRadius: 22,
  padding: "8px 7px 10px",
  background: "rgba(0,0,0,0.34)",
  border: "1px solid rgba(255,255,255,0.075)",
};

const dayDivider = {
  width: "fit-content",
  margin: "9px auto 7px",
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
  gap: 7,
};

const messageAvatar = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
  background: "#e4ef16",
  color: "#050505",
  fontSize: 10,
  fontWeight: 1000,
  flex: "0 0 auto",
};

const avatarSpacer = {
  width: 28,
  flex: "0 0 auto",
};

const messageStack = {
  maxWidth: "84%",
  display: "grid",
  gap: 4,
};

const bubble = {
  padding: "9px 11px 7px",
  borderRadius: 19,
  lineHeight: 1.34,
  fontSize: 15,
  wordBreak: "break-word",
  boxShadow: "0 12px 26px rgba(0,0,0,0.24)",
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
  marginTop: 5,
  fontSize: 10,
  fontWeight: 850,
};

const replyPreview = {
  display: "grid",
  gap: 2,
  padding: "7px 8px",
  borderRadius: 12,
  background: "rgba(0,0,0,0.14)",
  borderLeft: "3px solid rgba(228,239,22,0.85)",
  marginBottom: 7,
  fontSize: 12,
};

const mediaImage = {
  width: "100%",
  maxWidth: 260,
  borderRadius: 15,
  marginBottom: 7,
  display: "block",
};

const fileLink = {
  color: "#e4ef16",
  fontWeight: 900,
};

const reactionSummary = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
};

const reactionChip = {
  borderRadius: 999,
  background: "rgba(255,255,255,0.08)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.10)",
  padding: "3px 7px",
  fontSize: 11,
  fontWeight: 850,
};

const actionsBar = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
};

const emojiButton = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.08)",
  borderRadius: 999,
  padding: "5px 7px",
  fontSize: 14,
};

const smallAction = {
  border: "1px solid rgba(228,239,22,0.24)",
  background: "rgba(228,239,22,0.10)",
  color: "#e4ef16",
  borderRadius: 999,
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 900,
};

const smallActionDanger = {
  ...smallAction,
  border: "1px solid rgba(255,120,120,0.28)",
  background: "rgba(255,120,120,0.10)",
  color: "#ffb0b0",
};

const typingRow = {
  display: "flex",
  alignItems: "flex-end",
  gap: 7,
  marginTop: 10,
};

const typingBubble = {
  display: "flex",
  gap: 4,
  padding: "10px 12px",
  borderRadius: 18,
  background: "rgba(255,255,255,0.08)",
};

const typingDot = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.65)",
};

const contextBar = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 28px",
  gap: 8,
  alignItems: "center",
  padding: "8px 10px",
  borderRadius: 16,
  background: "rgba(228,239,22,0.10)",
  border: "1px solid rgba(228,239,22,0.22)",
  color: "white",
  fontSize: 12,
};

const contextClose = {
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "none",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  fontSize: 18,
};

const composer = {
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr) 48px",
  gap: 8,
};

const attachButton = {
  width: 42,
  minHeight: 46,
  borderRadius: 17,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.075)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e4ef16",
  fontSize: 24,
  fontWeight: 900,
};

const input = {
  width: "100%",
  minHeight: 46,
  maxHeight: 108,
  resize: "vertical",
  borderRadius: 17,
  padding: "11px 12px",
  background: "rgba(255,255,255,0.075)",
  border: "1px solid rgba(255,255,255,0.12)",
  outline: "none",
  color: "white",
  fontSize: 15,
  lineHeight: 1.35,
};

const sendButton = {
  width: 48,
  minHeight: 46,
  border: "none",
  borderRadius: 17,
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
  minHeight: "calc(100svh - 16px)",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 14,
  borderRadius: 26,
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
