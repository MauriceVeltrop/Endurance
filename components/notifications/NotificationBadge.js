"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function NotificationBadge({ className = "" }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { count: unreadCount } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);

      if (mounted) setCount(unreadCount || 0);
    }

    load();

    const channel = supabase
      .channel("notifications-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        load
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  if (!count) return null;

  return (
    <span className={`inline-flex min-w-5 items-center justify-center rounded-full bg-lime-300 px-1.5 py-0.5 text-xs font-black text-black ${className}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
