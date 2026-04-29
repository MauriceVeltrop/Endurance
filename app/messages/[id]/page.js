
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

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

  const bottomRef = useRef(null);

  useEffect(() => {
    if (!otherUserId) return;
    loadChat();
  }, [otherUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadChat() {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user;

    if (!currentUser) {
      setLoading(false);
      return;
    }

    setUser(currentUser);

    const { data: myData } = await supabase
      .from("profiles")
      .select("id,name,avatar_url")
      .eq("id", currentUser.id)
      .single();

    const { data: otherData } = await supabase
      .from("profiles")
      .select("id,name,avatar_url")
      .eq("id", otherUserId)
      .single();

    setMyProfile(myData);
    setOtherProfile(otherData);

    let activeThread = await findThread(currentUser.id, otherUserId);

    if (!activeThread) {
      activeThread = await createThread(currentUser.id, otherUserId);
    }

    setThread(activeThread);

    const { data: messageRows } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("thread_id", activeThread.id)
      .order("created_at", { ascending: true });

    setMessages(messageRows || []);

    await markRead(activeThread.id, currentUser.id);

    setLoading(false);
  }

  async function findThread(userA, userB) {
    const { data } = await supabase
      .from("chat_threads")
      .select("*")
      .or(`and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`)
      .limit(1);

    return data?.[0] || null;
  }

  async function createThread(userA, userB) {
    const ordered = [userA, userB].sort();

    const { data } = await supabase
      .from("chat_threads")
      .insert({ user_a: ordered[0], user_b: ordered[1] })
      .select("*")
      .single();

    return data;
  }

  async function markRead(threadId, userId) {
    const now = new Date().toISOString();

    await supabase
      .from("chat_messages")
      .update({ read_at: now })
      .eq("thread_id", threadId)
      .eq("receiver_id", userId)
      .is("read_at", null);
  }

  async function sendMessage() {
    const clean = text.trim();

    if (!clean || !user?.id || !thread?.id) return;

    setSending(true);

    await supabase.from("chat_messages").insert({
      thread_id: thread.id,
      sender_id: user.id,
      receiver_id: otherUserId,
      message: clean,
    });

    await supabase
      .from("chat_threads")
      .update({
        last_message: clean,
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread.id);

    setText("");

    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });

    setMessages(data || []);

    setSending(false);
  }

  if (loading) {
    return <div style={{padding:20}}>Loading chat...</div>;
  }

  return (
    <main style={{maxWidth:700,margin:"0 auto",padding:20}}>
      <h2>Chat with {otherProfile?.name}</h2>

      <div style={{height:400,overflowY:"auto",border:"1px solid #ddd",padding:10}}>
        {messages.map((m) => {
          const mine = m.sender_id === user.id;

          return (
            <div key={m.id} style={{textAlign:mine?"right":"left",marginBottom:10}}>
              <div
                style={{
                  display:"inline-block",
                  background:mine?"#e4ef16":"#eee",
                  padding:10,
                  borderRadius:12,
                  maxWidth:"70%"
                }}
              >
                {m.message}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}></div>
      </div>

      <div style={{display:"flex",gap:10,marginTop:10}}>
        <textarea
          value={text}
          onChange={(e)=>setText(e.target.value)}
          placeholder="Write message..."
          style={{flex:1,padding:10}}
        />

        <button onClick={sendMessage} disabled={sending}>
          Send
        </button>
      </div>
    </main>
  );
}
