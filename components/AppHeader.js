// components/AppHeader.js
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function initialsFromName(name = "") {
  return String(name || "E").trim().slice(0, 1).toUpperCase() || "E";
}

export default function AppHeader({ active = "trainings" }) {
  const [profile, setProfile] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

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
          <img
            src="/logo-endurance.png"
            alt="Endurance"
            className="endurance-logo-image"
          />
        </Link>

        <button type="button" onClick={signOut} className="endurance-signout" aria-label="Sign out">
          ↪
        </button>
      </div>
    </header>
  );
}
