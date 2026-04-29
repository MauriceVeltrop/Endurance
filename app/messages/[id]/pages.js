"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!otherUserId) return;
    loadChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUserId]);

  useEffect(() => {
    if (!thread?.id) return;

    const channel = supabase
      .channel(`chat-thread-${thread.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${thread.id}` },
        async (payload) => {
          const newMessage = payload.new;
          const { data: senderProfile } = await supabase
            .from("profiles")
            .select("id, name, avatar_url")
            .eq("id", newMessage.sender_id)
            .maybeSingle();

          setMessages((prev) => [...prev, { ...newMessage, sender_profile: senderProfile || null }]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [thread?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function loadChat() {
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

      const { data: myData, error: myError } = await supabase
        .from("profiles")
        .select("id, name, role, avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (myError) throw myError;
      setMyProfile(myData || null);

      const { data: otherData, error: otherError } = await supabase
        .from("profiles")
        .select("id, name, role, avatar_url")
        .eq("id", otherUserId)
        .maybeSingle();

      if (otherError) throw otherError;
      if (!otherData) throw new Error("User not found.");
      setOtherProfile(otherData);

      const isModerator = myData?.role === "moderator";

      if (!isModerator) {
        const { data: relationshipRows, error: relationshipError } = await supabase
          .from("training_partners")
          .select("id")
          .eq("status", "accepted")
          .or(`and(requester_id.eq.${currentUser.id},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${currentUser.id})`)
          .limit(1);

        if (relationshipError) throw relationshipError;

        if (!relationshipRows?.length) {
          setErrorText("You can only chat with people in your team.");
          setLoading(false);
          return;
        }
      }

      let activeThread = await findThread(currentUser.id, otherUserId);
      if (!activeThread) activeThread = await createThread(currentUser.id, otherUserId);
      setThread(activeThread);

      const { data: messageRows, error: messageError } = await supabase
        .from("chat_messages")
        .select(`*, sender_profile:profiles!chat_messages_sender_id_fkey (id, name, avatar_url)`)
        .eq("thread_id", activeThread.id)
        .order("created_at", { ascending: true });

      if (messageError) throw messageError;
      setMessages(messageRows || []);
      await markRead(activeThread.id, currentUser.id);
    } catch (err) {
      console.error("chat load error", err);
      setErrorText(err?.message || "Could not load chat.");
    } finally {
      setLoading(false);
    }
  }

  async function findThread(userA, userB) {
    const { data, error } = await supabase
      .from("chat_threads")
      .select("*")
      .or(`and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`)
      .limit(1);
    if (error) throw error;
    return data?.[0] || null;
  }

  async function createThread(userA, userB) {
    const ordered = [userA, userB].sort();
    const { data, error } = await supabase
      .from("chat_threads")
      .insert({ user_a: ordered[0], user_b: ordered[1] })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async function markRead(threadId, userId) {
    await supabase.from("chat_reads").upsert(
      { thread_id: threadId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: "thread_id,user_id" }
    );
  }

  async function sendMessage() {
    const cleanText = text.trim();
    if (!cleanText || !user?.id || !thread?.id || sending) return;

    try {
      setSending(true);
      setErrorText("");

      const { error: insertError } = await supabase.from("chat_messages").insert({
        thread_id: thread.id,
        sender_id: user.id,
        message: cleanText,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("chat_threads")
        .update({ last_message: cleanText, updated_at: new Date().toISOString() })
        .eq("id", thread.id);
      if (updateError) throw updateError;

      await markRead(thread.id, user.id);
      setText("");
    } catch (err) {
      console.error("send message error", err);
      setErrorText(err?.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  function initials(name = "?") {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  if (loading) return <main style={app}><div style={card}>Loading chat...</div></main>;
  if (!user) return <main style={app}><div style={card}>Please sign in.</div></main>;

  return (
    <main style={app}>
      <section style={card}>
        <div style={topRow}>
          <Link href={`/profile/${otherUserId}`} style={backBtn}>Back</Link>
          <div style={personHeader}>
            <div style={avatarSmall}>
              {otherProfile?.avatar_url ? <img src={otherProfile.avatar_url} alt={otherProfile.name || "User"} style={avatarImg} /> : initials(otherProfile?.name)}
            </div>
            <div>
              <h1 style={title}>{otherProfile?.name || "Chat"}</h1>
              <div style={subtitle}>{myProfile?.role === "moderator" ? "Moderator chat" : "Team chat"}</div>
            </div>
          </div>
        </div>

        {errorText ? <div style={errorBox}>{errorText}</div> : (
          <>
            <div style={messagesBox}>
              {messages.length === 0 ? <div style={emptyText}>No messages yet.</div> : messages.map((message) => {
                const mine = message.sender_id === user.id;
                return (
                  <div key={message.id} style={{ ...messageRow, justifyContent: mine ? "flex-end" : "flex-start" }}>
                    <div style={{ ...bubble, background: mine ? "#e4ef16" : "#222", color: mine ? "#000" : "#fff" }}>
                      {!mine && <div style={senderName}>{message.sender_profile?.name || "User"}</div>}
                      <div>{message.message}</div>
                      <div style={{ ...timeText, color: mine ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.45)" }}>
                        {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div style={inputRow}>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message..." style={input} />
              <button type="button" onClick={sendMessage} disabled={sending || !text.trim()} style={{ ...sendBtn, opacity: sending || !text.trim() ? 0.55 : 1 }}>
                {sending ? "..." : "Send"}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

const app = { minHeight: "100vh", background: "#050505", color: "white", padding: 16, fontFamily: "sans-serif" };
const card = { maxWidth: 760, margin: "0 auto", background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 16 };
const topRow = { display: "grid", gap: 14, marginBottom: 14 };
const backBtn = { width: "fit-content", background: "#2a2a2a", color: "white", textDecoration: "none", padding: "10px 14px", borderRadius: 12 };
const personHeader = { display: "flex", alignItems: "center", gap: 12 };
const avatarSmall = { width: 54, height: 54, borderRadius: "50%", background: "#e4ef16", color: "black", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, overflow: "hidden" };
const avatarImg = { width: "100%", height: "100%", objectFit: "cover" };
const title = { margin: 0, fontSize: 24 };
const subtitle = { marginTop: 3, color: "rgba(255,255,255,0.6)", fontSize: 13 };
const messagesBox = { height: "62vh", overflowY: "auto", background: "#080808", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18, padding: 10, display: "flex", flexDirection: "column", gap: 10 };
const messageRow = { display: "flex" };
const bubble = { maxWidth: "82%", borderRadius: 18, padding: "10px 12px", lineHeight: 1.35, fontSize: 15, wordBreak: "break-word" };
const senderName = { fontSize: 12, fontWeight: 900, opacity: 0.7, marginBottom: 4 };
const timeText = { fontSize: 11, marginTop: 5, textAlign: "right" };
const inputRow = { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 12 };
const input = { minHeight: 54, resize: "vertical", borderRadius: 16, padding: 12, background: "#1c1c1c", color: "white", border: "1px solid rgba(255,255,255,0.12)", fontSize: 15 };
const sendBtn = { border: "none", borderRadius: 16, padding: "0 18px", background: "#e4ef16", color: "#000", fontWeight: 900, cursor: "pointer" };
const errorBox = { color: "#ffb4b4", background: "#180808", border: "1px solid rgba(255,120,120,0.25)", borderRadius: 14, padding: 12 };
const emptyText = { color: "rgba(255,255,255,0.6)", padding: 12 };
