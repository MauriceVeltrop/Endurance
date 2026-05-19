"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const items = [
  { href: "/trainings", label: "Train", icon: "⚡" },
  { href: "/routes", label: "Routes", icon: "⌁" },
  { href: "/workouts", label: "Workouts", icon: "◫" },
  { href: "/team", label: "Team", icon: "◎" },
  { href: "/inbox", label: "Inbox", icon: "✉", badge: true },
];

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [badgeCount, setBadgeCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadBadgeCount() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;

        if (!userId) {
          if (!cancelled) setBadgeCount(0);
          return;
        }

        const [{ count: inviteCount }, { count: notificationCount }] = await Promise.all([
          supabase
            .from("training_invites")
            .select("id", { count: "exact", head: true })
            .eq("invitee_id", userId)
            .eq("status", "pending"),
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .is("read_at", null),
        ]);

        if (!cancelled) setBadgeCount((inviteCount || 0) + (notificationCount || 0));
      } catch (error) {
        console.warn("Bottom nav badge skipped", error);
        if (!cancelled) setBadgeCount(0);
      }
    }

    loadBadgeCount();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav style={styles.nav} aria-label="Primary navigation">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href + "/"));
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => router.push(item.href)}
            style={active ? styles.itemActive : styles.item}
            aria-current={active ? "page" : undefined}
          >
            <span style={styles.iconWrap}>
              <span style={active ? styles.iconActive : styles.icon}>{item.icon}</span>
              {item.badge && badgeCount > 0 ? (
                <span style={styles.badge}>{badgeCount > 99 ? "99+" : badgeCount}</span>
              ) : null}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const base = {
  border: 0,
  cursor: "pointer",
  fontWeight: 950,
  fontFamily: "inherit",
};

const styles = {
  nav: {
    position: "fixed",
    left: "50%",
    bottom: "max(12px, env(safe-area-inset-bottom))",
    transform: "translateX(-50%)",
    zIndex: 40,
    width: "min(460px, calc(100vw - 22px))",
    minHeight: 68,
    padding: 7,
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 5,
    borderRadius: 28,
    background: "linear-gradient(145deg, rgba(18,22,28,0.92), rgba(5,7,10,0.86))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 18px 70px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.05)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
  },
  item: {
    ...base,
    position: "relative",
    borderRadius: 21,
    background: "transparent",
    color: "rgba(255,255,255,0.58)",
    display: "grid",
    placeItems: "center",
    gap: 2,
    fontSize: 10.5,
    letterSpacing: "-0.02em",
    minWidth: 0,
  },
  itemActive: {
    ...base,
    position: "relative",
    borderRadius: 21,
    background: "rgba(228,239,22,0.105)",
    color: "#e4ef16",
    display: "grid",
    placeItems: "center",
    gap: 2,
    fontSize: 10.5,
    letterSpacing: "-0.02em",
    border: "1px solid rgba(228,239,22,0.18)",
    minWidth: 0,
  },
  iconWrap: {
    position: "relative",
    display: "grid",
    placeItems: "center",
    minWidth: 24,
    minHeight: 22,
  },
  icon: { fontSize: 17, lineHeight: 1 },
  iconActive: { fontSize: 18, lineHeight: 1 },
  badge: {
    position: "absolute",
    top: -10,
    right: -15,
    minWidth: 20,
    height: 20,
    padding: "0 5px",
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "#e4ef16",
    color: "#070a0f",
    border: "2px solid #05070a",
    fontSize: 10,
    fontWeight: 950,
    boxShadow: "0 0 18px rgba(228,239,22,0.22)",
  },
};
