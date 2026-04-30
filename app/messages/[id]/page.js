"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const ENDURANCE_YELLOW = "#eaff00";
const DARK_BG = "#050505";
const CHAT_BG = "#070707";
const PANEL = "#1f2024";
const PANEL_DARK = "#17181c";
const TEXT = "#f5f5f5";

const REACTIONS = ["👍", "🔥", "💪", "😂", "❤️", "👏"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function timeLabel(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);

  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function dateChip(value) {
  const d = new Date(value);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function initials(name = "?") {
  return String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function displayName(profile, fallback = "User") {
  return profile?.name || profile?.email || fallback;
}

function avatarUrl(profile) {
  return profile?.avatar_url || "";
}

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
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [liveStatus, setLiveStatus] = useState("connecting");
  const [otherTyping, setOtherTyping] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [showActionsFor, setShowActionsFor] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const canSend = text.trim().length > 0 || !!selectedFile;

  useEffect(() => {
    if (!otherUserId) return;
    loadChat();
  }, [otherUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, otherTyping]);

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

  const groupedRows = useMemo(() => {
    const rows = [];
    let lastDate = null;

    messages
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .forEach((message, index, sorted) => {
        if (!lastDate || !sameDay(lastDate, message.created_at)) {
          rows.push({
            type: "date",
            id: `date-${message.created_at}`,
            label: dateChip(message.created_at),
          });
          lastDate = message.created_at;
        }

        const previous = sorted[index - 1];
        const next = sorted[index + 1];

        const sameSenderAsPrevious =
          previous &&
          previous.sender_id === message.sender_id &&
          sameDay(previous.created_at, message.created_at);

        const sameSenderAsNext =
          next &&
          next.sender_id === message.sender_id &&
          sameDay(next.created_at, message.created_at);

        rows.push({
          type: "message",
          ...message,
          compactTop: sameSenderAsPrevious,
          compactBottom: sameSenderAsNext,
        });
      });

    return rows;
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

      setMessages(
        visibleRows.map((message) => ({
          ...message,
          sender_profile:
            message.sender_id === currentUser.id ? myData || null : otherData || null,
        }))
      );

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

    if (error) return;

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

  async function uploadSelectedFile(file) {
    if (!file || !user?.id || !thread?.id) return null;

    setUploadingMedia(true);

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${thread.id}/${user.id}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("chat-attachments")
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("chat-attachments").getPublicUrl(filePath);

    return {
      url: data.publicUrl,
      type: file.type?.startsWith("image/") ? "image" : "file",
    };
  }

  async function sendMessage() {
    const clean = text.trim();

    if ((!clean && !selectedFile) || !user?.id || !otherUserId || !thread?.id || sending) return;

    try {
      setSending(true);

      const media = selectedFile ? await uploadSelectedFile(selectedFile) : null;
      const now = new Date().toISOString();
      const messageText = clean || (media?.type === "image" ? "Photo" : "Attachment");

      setText("");
      setSelectedFile(null);
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
        payload.media_type = media.type || "file";
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
      setErrorText(error?.message || "Could not send message.");
    } finally {
      setSending(false);
      setUploadingMedia(false);
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

  function startEdit(message) {
    setEditingMessage(message);
    setReplyTo(null);
    setText(message.message || "");
    textareaRef.current?.focus();
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      editingMessage ? editMessage() : sendMessage();
    }
  }

  function findReplyMessage(id) {
    if (!id) return null;
    return messages.find((message) => message.id === id);
  }

  function statusLabel(message) {
    if (message.sender_id !== user?.id) return "";
    return message.read_at ? "✓✓" : "✓";
  }

  function renderAvatar(profile, size = "large") {
    const url = avatarUrl(profile);
    const name = displayName(profile, "User");

    return (
      <div style={size === "small" ? styles.smallAvatarWrap : styles.avatarWrap}>
        <span style={size === "small" ? styles.smallAvatarFallback : styles.avatarFallback}>
          {initials(name)}
        </span>

        {url ? (
          <img
            src={url}
            alt={name}
            style={size === "small" ? styles.smallAvatar : styles.avatar}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
    );
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <section style={styles.loadingCard}>
          <img src="/logo-endurance.png" alt="Endurance" style={styles.loadingLogo} />
          <div style={styles.loadingText}>Loading chat...</div>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <Link href="/messages" style={styles.backButton} aria-label="Back to messages">
          ‹
        </Link>

        <Link href={`/profile/${otherUserId}`} style={styles.profileHeader}>
          {renderAvatar(otherProfile)}

          <div style={styles.headerText}>
            <div style={styles.name}>{displayName(otherProfile, "Chat")}</div>
            <div style={styles.status}>
              <span style={styles.dot} />
              {liveStatus === "live" ? "online" : "connecting"}
              {otherProfile?.role ? (
                <>
                  <span style={styles.bullet}>•</span>
                  <span>{otherProfile.role}</span>
                </>
              ) : null}
            </div>
          </div>
        </Link>

        <button
          style={styles.menuButton}
          aria-label="Menu"
          onClick={() => setMenuOpen((value) => !value)}
          type="button"
        >
          ⋮
        </button>

        {menuOpen ? (
          <div style={styles.menu}>
            <Link href={`/profile/${otherUserId}`} style={styles.menuItem}>
              View profile
            </Link>
          </div>
        ) : null}
      </header>

      {errorText ? (
        <div style={styles.errorBox}>
          <span>{errorText}</span>
          <button type="button" onClick={() => setErrorText("")} style={styles.errorClose}>
            ×
          </button>
        </div>
      ) : null}

      <section style={styles.chat}>
        <div style={styles.backgroundPattern} />

        {groupedRows.map((item) => {
          if (item.type === "date") {
            return (
              <div key={item.id} style={styles.dateRow}>
                <span style={styles.datePill}>{item.label}</span>
              </div>
            );
          }

          const mine = item.sender_id === user?.id;
          const senderProfile = mine ? myProfile : otherProfile;
          const senderName = displayName(senderProfile);
          const replyMessage = findReplyMessage(item.reply_to_message_id);
          const messageReactions = reactionsByMessageId[item.id] || {};

          return (
            <div
              key={item.id}
              style={{
                ...styles.messageRow,
                justifyContent: mine ? "flex-end" : "flex-start",
                marginTop: item.compactTop ? 2 : 7,
              }}
            >
              {!mine ? renderAvatar(otherProfile, "small") : null}

              <div style={styles.messageStack}>
                <div
                  onClick={() => setShowActionsFor(showActionsFor === item.id ? null : item.id)}
                  style={{
                    ...styles.bubble,
                    ...(mine ? styles.bubbleMine : styles.bubbleOther),
                    borderBottomRightRadius: mine && item.compactBottom ? 18 : 5,
                    borderBottomLeftRadius: !mine && item.compactBottom ? 18 : 5,
                  }}
                >
                  {!mine && !item.compactTop ? (
                    <div style={styles.senderName}>{senderName}</div>
                  ) : null}

                  {replyMessage ? (
                    <div style={styles.replyPreview}>
                      <strong>{replyMessage.sender_id === user?.id ? "You" : displayName(otherProfile)}</strong>
                      <span>{replyMessage.message}</span>
                    </div>
                  ) : null}

                  {item.media_url ? (
                    item.media_type === "image" ? (
                      <img src={item.media_url} alt="Shared media" style={styles.mediaImage} />
                    ) : (
                      <a href={item.media_url} target="_blank" rel="noreferrer" style={styles.fileLink}>
                        Open attachment
                      </a>
                    )
                  ) : null}

                  <div style={styles.messageText}>{item.message}</div>

                  <div
                    style={{
                      ...styles.messageMeta,
                      color: mine ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.54)",
                    }}
                  >
                    <span>{timeLabel(item.created_at)}</span>
                    {item.edited_at ? <span>edited</span> : null}
                    {mine ? <span>{statusLabel(item)}</span> : null}
                  </div>
                </div>

                {Object.keys(messageReactions).length > 0 ? (
                  <div style={{ ...styles.reactionSummary, justifyContent: mine ? "flex-end" : "flex-start" }}>
                    {Object.entries(messageReactions).map(([emoji, data]) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => toggleReaction(item, emoji)}
                        style={{
                          ...styles.reactionChip,
                          borderColor: data.mine ? "rgba(234,255,0,0.55)" : "rgba(255,255,255,0.10)",
                        }}
                      >
                        {emoji} {data.count}
                      </button>
                    ))}
                  </div>
                ) : null}

                {showActionsFor === item.id ? (
                  <div style={{ ...styles.actionsBar, justifyContent: mine ? "flex-end" : "flex-start" }}>
                    {REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => toggleReaction(item, emoji)}
                        style={styles.emojiButton}
                      >
                        {emoji}
                      </button>
                    ))}

                    <button type="button" onClick={() => setReplyTo(item)} style={styles.smallAction}>
                      Reply
                    </button>

                    {mine ? (
                      <>
                        <button type="button" onClick={() => startEdit(item)} style={styles.smallAction}>
                          Edit
                        </button>
                        <button type="button" onClick={() => deleteMessage(item)} style={styles.smallActionDanger}>
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {otherTyping ? (
          <div style={styles.messageRow}>
            {renderAvatar(otherProfile, "small")}
            <div style={styles.typingBubble}>
              <span style={styles.typingDot} />
              <span style={styles.typingDot} />
              <span style={styles.typingDot} />
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </section>

      <footer style={styles.composerWrap}>
        {(replyTo || editingMessage) && (
          <div style={styles.contextBar}>
            <div style={styles.contextText}>
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
              style={styles.contextClose}
            >
              ×
            </button>
          </div>
        )}

        {selectedFile ? (
          <div style={styles.filePreview}>
            <span style={styles.fileName}>📎 {selectedFile.name}</span>
            <button style={styles.fileRemove} onClick={() => setSelectedFile(null)} type="button">
              ×
            </button>
          </div>
        ) : null}

        <div style={styles.composer}>
          <button
            style={styles.attachButton}
            aria-label="Add attachment"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            📎
          </button>

          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setSelectedFile(file || null);
              event.target.value = "";
            }}
          />

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => handleTyping(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={editingMessage ? "Edit message" : "Message"}
            style={styles.input}
          />

          <button
            style={{
              ...styles.sendButton,
              opacity: canSend && !sending && !uploadingMedia ? 1 : 0.55,
            }}
            disabled={!canSend || sending || uploadingMedia}
            onClick={editingMessage ? editMessage : sendMessage}
            aria-label="Send message"
            type="button"
          >
            {sending || uploadingMedia ? "…" : "➤"}
          </button>
        </div>
      </footer>
    </main>
  );
}

const styles = {
  page: {
    height: "100dvh",
    width: "100%",
    background: DARK_BG,
    color: TEXT,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  header: {
    height: 74,
    minHeight: 74,
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "9px 11px",
    background: "rgba(5,5,5,.98)",
    borderBottom: "1px solid rgba(255,255,255,.08)",
    position: "relative",
    zIndex: 20,
    boxSizing: "border-box",
  },

  backButton: {
    width: 32,
    height: 42,
    border: "none",
    background: "transparent",
    color: ENDURANCE_YELLOW,
    fontSize: 42,
    lineHeight: "32px",
    fontWeight: 800,
    cursor: "pointer",
    padding: 0,
    textDecoration: "none",
    display: "grid",
    placeItems: "center",
  },

  profileHeader: {
    minWidth: 0,
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "white",
    textDecoration: "none",
  },

  avatarWrap: {
    width: 54,
    height: 54,
    minWidth: 54,
    borderRadius: "50%",
    border: `3px solid ${ENDURANCE_YELLOW}`,
    overflow: "hidden",
    position: "relative",
    background: PANEL,
    display: "grid",
    placeItems: "center",
  },

  avatar: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    position: "absolute",
    inset: 0,
    zIndex: 2,
  },

  avatarFallback: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    color: ENDURANCE_YELLOW,
    fontWeight: 900,
    fontSize: 16,
    zIndex: 1,
  },

  headerText: {
    minWidth: 0,
    flex: 1,
  },

  name: {
    fontSize: 21,
    lineHeight: "24px",
    fontWeight: 900,
    color: "#fff",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    letterSpacing: "-0.035em",
  },

  status: {
    marginTop: 2,
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: ENDURANCE_YELLOW,
    fontSize: 14,
    lineHeight: "18px",
    fontWeight: 800,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: ENDURANCE_YELLOW,
    display: "inline-block",
    flex: "0 0 auto",
  },

  bullet: {
    color: ENDURANCE_YELLOW,
    opacity: 0.9,
  },

  menuButton: {
    width: 34,
    height: 42,
    border: "none",
    background: "transparent",
    color: ENDURANCE_YELLOW,
    fontSize: 32,
    lineHeight: "32px",
    fontWeight: 900,
    cursor: "pointer",
  },

  menu: {
    position: "absolute",
    right: 10,
    top: 64,
    width: 160,
    borderRadius: 14,
    overflow: "hidden",
    background: "#1f2024",
    boxShadow: "0 16px 40px rgba(0,0,0,.45)",
    border: "1px solid rgba(255,255,255,.08)",
    zIndex: 40,
  },

  menuItem: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: TEXT,
    textAlign: "left",
    padding: "13px 15px",
    fontSize: 14,
    display: "block",
    textDecoration: "none",
    boxSizing: "border-box",
    fontWeight: 700,
  },

  errorBox: {
    padding: "8px 12px",
    background: "rgba(120,20,20,0.34)",
    borderBottom: "1px solid rgba(255,120,120,0.20)",
    color: "#ffd2d2",
    fontSize: 13,
    fontWeight: 750,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    zIndex: 21,
  },

  errorClose: {
    background: "transparent",
    color: "#ffd2d2",
    border: "none",
    fontSize: 18,
  },

  chat: {
    position: "relative",
    flex: 1,
    overflowY: "auto",
    padding: "18px 10px 112px",
    boxSizing: "border-box",
    background:
      "radial-gradient(circle at 20% 10%, rgba(234,255,0,.035), transparent 26%), radial-gradient(circle at 80% 0%, rgba(234,255,0,.025), transparent 22%), #020202",
  },

  backgroundPattern: {
    pointerEvents: "none",
    position: "fixed",
    inset: 0,
    opacity: 0.14,
    backgroundImage:
      "radial-gradient(rgba(255,255,255,.28) 1px, transparent 1px)",
    backgroundSize: "28px 28px",
    zIndex: 0,
  },

  dateRow: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "center",
    margin: "10px 0 16px",
  },

  datePill: {
    background: "#26272b",
    color: "#d2d2d2",
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: 900,
    boxShadow: "0 3px 10px rgba(0,0,0,.28)",
  },

  messageRow: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    margin: "7px 0",
  },

  smallAvatarWrap: {
    width: 32,
    height: 32,
    minWidth: 32,
    borderRadius: "50%",
    overflow: "hidden",
    position: "relative",
    background: PANEL,
    marginBottom: 1,
    display: "grid",
    placeItems: "center",
  },

  smallAvatar: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    position: "absolute",
    inset: 0,
    zIndex: 2,
  },

  smallAvatarFallback: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    color: ENDURANCE_YELLOW,
    fontSize: 10,
    fontWeight: 900,
    zIndex: 1,
  },

  messageStack: {
    maxWidth: "78%",
    display: "grid",
    gap: 3,
  },

  bubble: {
    minWidth: 70,
    padding: "9px 11px 6px",
    borderRadius: 18,
    boxShadow: "0 4px 12px rgba(0,0,0,.28)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    boxSizing: "border-box",
  },

  bubbleMine: {
    background: ENDURANCE_YELLOW,
    color: "#111",
    borderBottomRightRadius: 5,
  },

  bubbleOther: {
    background: `linear-gradient(180deg, ${PANEL}, ${PANEL_DARK})`,
    color: "#f4f4f4",
    border: "1px solid rgba(255,255,255,.055)",
    borderBottomLeftRadius: 5,
  },

  senderName: {
    color: ENDURANCE_YELLOW,
    fontSize: 12,
    lineHeight: "15px",
    fontWeight: 900,
    marginBottom: 5,
  },

  messageText: {
    fontSize: 19,
    lineHeight: "24px",
    letterSpacing: "-.2px",
  },

  messageMeta: {
    marginTop: 2,
    textAlign: "right",
    fontSize: 11,
    lineHeight: "14px",
    fontWeight: 900,
    display: "flex",
    justifyContent: "flex-end",
    gap: 5,
  },

  replyPreview: {
    display: "grid",
    gap: 2,
    padding: "7px 8px",
    borderRadius: 12,
    background: "rgba(0,0,0,0.14)",
    borderLeft: "3px solid rgba(234,255,0,0.85)",
    marginBottom: 7,
    fontSize: 12,
  },

  mediaImage: {
    width: "100%",
    maxWidth: 260,
    borderRadius: 15,
    marginBottom: 7,
    display: "block",
  },

  fileLink: {
    color: ENDURANCE_YELLOW,
    fontWeight: 900,
  },

  reactionSummary: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
  },

  reactionChip: {
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.10)",
    padding: "3px 7px",
    fontSize: 11,
    fontWeight: 850,
  },

  actionsBar: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
  },

  emojiButton: {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    padding: "5px 7px",
    fontSize: 14,
  },

  smallAction: {
    border: "1px solid rgba(234,255,0,0.24)",
    background: "rgba(234,255,0,0.10)",
    color: ENDURANCE_YELLOW,
    borderRadius: 999,
    padding: "5px 8px",
    fontSize: 11,
    fontWeight: 900,
  },

  smallActionDanger: {
    border: "1px solid rgba(255,120,120,0.28)",
    background: "rgba(255,120,120,0.10)",
    color: "#ffb0b0",
    borderRadius: 999,
    padding: "5px 8px",
    fontSize: 11,
    fontWeight: 900,
  },

  typingBubble: {
    display: "flex",
    gap: 4,
    padding: "10px 12px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.08)",
  },

  typingDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.65)",
  },

  composerWrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    padding: "7px 8px calc(8px + env(safe-area-inset-bottom))",
    background:
      "linear-gradient(180deg, rgba(2,2,2,0), rgba(2,2,2,.92) 18%, rgba(2,2,2,.98))",
    boxSizing: "border-box",
  },

  contextBar: {
    margin: "0 0 6px 48px",
    maxWidth: "calc(100% - 60px)",
    minHeight: 34,
    borderRadius: 16,
    background: "rgba(234,255,0,0.10)",
    border: "1px solid rgba(234,255,0,0.22)",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 24px",
    gap: 6,
    alignItems: "center",
    padding: "6px 8px 6px 12px",
    boxSizing: "border-box",
    fontSize: 12,
  },

  contextText: {
    minWidth: 0,
    display: "grid",
    gap: 1,
    overflow: "hidden",
  },

  contextClose: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "none",
    background: "rgba(255,255,255,.12)",
    color: "#fff",
    fontSize: 18,
    lineHeight: "20px",
  },

  filePreview: {
    margin: "0 0 6px 48px",
    maxWidth: "calc(100% - 60px)",
    minHeight: 34,
    borderRadius: 16,
    background: "#202126",
    border: "1px solid rgba(255,255,255,.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 8px 6px 12px",
    boxSizing: "border-box",
  },

  fileName: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "#eee",
    fontSize: 13,
    fontWeight: 700,
  },

  fileRemove: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "none",
    background: "rgba(255,255,255,.12)",
    color: "#fff",
    fontSize: 18,
    lineHeight: "20px",
  },

  composer: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    width: "100%",
    boxSizing: "border-box",
  },

  attachButton: {
    width: 40,
    height: 40,
    minWidth: 40,
    borderRadius: "50%",
    border: "none",
    background: "#202126",
    color: ENDURANCE_YELLOW,
    fontSize: 20,
    lineHeight: "20px",
    fontWeight: 800,
    display: "grid",
    placeItems: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,.35)",
  },

  input: {
    flex: 1,
    height: 40,
    minHeight: 40,
    maxHeight: 40,
    resize: "none",
    border: "none",
    outline: "none",
    borderRadius: 22,
    background: "#202126",
    color: "#fff",
    fontSize: 17,
    lineHeight: "22px",
    padding: "9px 14px",
    boxSizing: "border-box",
    fontFamily: "inherit",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)",
    overflow: "hidden",
  },

  sendButton: {
    width: 40,
    height: 40,
    minWidth: 40,
    borderRadius: "50%",
    border: "none",
    background: ENDURANCE_YELLOW,
    color: "#111",
    fontSize: 20,
    lineHeight: "20px",
    fontWeight: 900,
    display: "grid",
    placeItems: "center",
    transform: "rotate(-35deg)",
    boxShadow: "0 2px 10px rgba(234,255,0,.22)",
  },

  loadingCard: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 14,
    background:
      "radial-gradient(circle at 76% 0%, rgba(234,255,0,0.12), transparent 30%), #050505",
  },

  loadingLogo: {
    width: "min(68vw, 360px)",
    filter: "drop-shadow(0 18px 32px rgba(0,0,0,0.70))",
  },

  loadingText: {
    color: "rgba(255,255,255,0.66)",
    fontWeight: 850,
  },
};
