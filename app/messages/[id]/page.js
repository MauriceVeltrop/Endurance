"use client";

import { useEffect, useState } from "react";
import ChatBox from "../../../components/ChatBox";
import { supabase } from "../../../lib/supabase";

export default function DirectMessagePage({ params }) {
  const [user, setUser] = useState(null);
  const [otherProfile, setOtherProfile] = useState(null);
  const otherUserId = params.id;

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setUser(session?.user || null);

      const { data } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("id", otherUserId)
        .limit(1)
        .maybeSingle();

      setOtherProfile(data || null);
    }

    init();
  }, [otherUserId]);

  if (!user) {
    return (
      <main style={{ minHeight: "100vh", background: "#050505", color: "white", padding: 24 }}>
        Please sign in.
      </main>
    );
  }

  return (
    <ChatBox
      currentUserId={user.id}
      chatType="direct"
      otherUserId={otherUserId}
      title={`Message ${otherProfile?.name || "Team member"}`}
    />
  );
}
