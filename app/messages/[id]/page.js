"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function DirectMessagePage() {
  const params = useParams();
  const otherUserId = params?.id;

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    loadChat();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadChat() {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user;

    if (!currentUser) return;

    setUser(currentUser);

    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: true });

    setMessages(data || []);
  }

  async function sendMessage() {
    const clean = text.trim();
    if (!clean) return;

    await supabase.from("chat_messages").insert({
      sender_id: user.id,
      receiver_id: otherUserId,
      message: clean
    });

    setText("");
    loadChat();
  }

  return (
    <main style={{maxWidth:700,margin:"0 auto",padding:20}}>
      <h2>Chat</h2>

      <div style={{height:400,overflowY:"auto",border:"1px solid #ddd",padding:10}}>
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;

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

        <button onClick={sendMessage}>
          Send
        </button>
      </div>
    </main>
  );
}
