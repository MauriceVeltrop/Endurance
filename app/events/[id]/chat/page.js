"use client";

import { useEffect, useState } from "react";
import ChatBox from "../../../../components/ChatBox";
import { supabase } from "../../../../lib/supabase";

export default function EventChatPage({ params }) {
  const [user, setUser] = useState(null);
  const [event, setEvent] = useState(null);
  const eventId = params.id;

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setUser(session?.user || null);

      const { data } = await supabase
        .from("events")
        .select("id, title")
        .eq("id", eventId)
        .limit(1)
        .maybeSingle();

      setEvent(data || null);
    }

    init();
  }, [eventId]);

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
      chatType="event"
      eventId={eventId}
      title={`${event?.title || "Event"} Chat`}
    />
  );
}
