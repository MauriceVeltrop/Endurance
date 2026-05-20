// components/BottomNav.js
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";

function itemMatchesPath(item, pathname) {
  if (!pathname) return false;
  return item.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export default function BottomNav({ unreadCount: externalUnreadCount = null }) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [role, setRole] = useState(null);

  useEffect(() => {
    let alive = true;

    async function loadNavState() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user?.id || !alive) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (alive) setRole(profile?.role || "user");

      if (externalUnreadCount !== null && externalUnreadCount !== undefined) {
        if (alive) setUnreadCount(Number(externalUnreadCount) || 0);
        return;
      }

      const [{ count: notificationCount }, { count: inviteCount }] = await Promise.all([
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null),
        supabase
          .from("training_invites")
          .select("id", { count: "exact", head: true })
          .eq("invitee_id", user.id)
          .eq("status", "pending"),
      ]);

      if (alive) setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    }

    loadNavState();

    return () => {
      alive = false;
    };
  }, [externalUnreadCount]);

  const allItems = useMemo(() => {
    const items = [
      { href: "/trainings", label: "Trainings", icon: "⌁", match: ["/trainings"] },
      { href: "/routes", label: "Routes", icon: "◇", match: ["/routes"] },
      { href: "/workouts", label: "Workouts", icon: "✦", match: ["/workouts"] },
      { href: "/team", label: "Team", icon: "👥", match: ["/team"] },
      { href: "/notifications", label: "Inbox", icon: "✉", match: ["/notifications", "/inbox"] },
    ];

    if (role === "admin" || role === "moderator") {
      items.push({ href: "/admin", label: "Admin", icon: "⚙", match: ["/admin"] });
    }

    return items;
  }, [role]);

  const visibleItems = allItems.filter((item) => !itemMatchesPath(item, pathname));

  return (
    <nav className="endurance-bottom-nav" aria-label="Primary navigation">
      {visibleItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <span className="nav-icon">
            {item.icon}
            {item.href === "/notifications" && unreadCount > 0 && (
              <strong className="nav-badge">{unreadCount}</strong>
            )}
          </span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
