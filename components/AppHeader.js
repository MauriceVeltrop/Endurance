// components/AppHeader.js
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

function initialsFromName(name = "") {
  return String(name || "E").trim().slice(0, 1).toUpperCase() || "E";
}

export default function AppHeader({ active = "trainings" }) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [profile, setProfile] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadHeader() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!alive || !user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id,name,first_name,last_name,avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (alive) setProfile(profileData || null);

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

    loadHeader();
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const items = [
    ["trainings", "/trainings", "Trainings"],
    ["routes", "/routes", "Routes"],
    ["workouts", "/workouts", "Workouts"],
    ["team", "/team", "Team"],
    ["notifications", "/notifications", "Inbox"],
    ["profile", "/profile", "Profile"],
  ];

  const name = profile?.first_name || profile?.name || "Endurance";

  return (
    <header className="endurance-shell endurance-header">
      <div className="endurance-topbar">
        <Link href="/profile" className="endurance-avatar" aria-label="Profile">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" />
          ) : (
            <span>{initialsFromName(name)}</span>
          )}
        </Link>

        <Link href="/trainings" className="endurance-logo" aria-label="Endurance home">
          <span className="endurance-logo-pulse">⌁</span>
          <span>ENDURANCE</span>
        </Link>

        <button type="button" onClick={signOut} className="endurance-signout" aria-label="Sign out">
          ↪
        </button>
      </div>

      <div className="endurance-menu-row">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="endurance-menu-button"
          aria-expanded={open}
        >
          <span className="endurance-menu-icon">☰</span>
          <span>Menu</span>
          <span className="endurance-menu-chevron">⌄</span>
          {unreadCount > 0 && <span className="endurance-menu-badge">{unreadCount}</span>}
        </button>
      </div>

      {open && (
        <nav className="endurance-menu-panel">
          {items.map(([key, href, label]) => (
            <Link
              key={key}
              href={href}
              className={active === key ? "is-active" : ""}
              onClick={() => setOpen(false)}
            >
              <span>{label}</span>
              {key === "notifications" && unreadCount > 0 && (
                <strong className="endurance-small-badge">{unreadCount}</strong>
              )}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
