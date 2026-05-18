"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function AppHeader({ profile, compact = false, notificationCount = 0 }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = getInitials(profile?.name || profile?.email || "E");

  const menuItems = [
    { label: "Trainings", description: "Find, create and join sessions", icon: "▣", href: "/trainings" },
    { label: "Inbox", description: "Invites, requests and messages", icon: "✉", href: "/inbox" },
    { label: "Team", description: "Training partners", icon: "◎", href: "/team" },
    { label: "Profile", description: "Your sports and identity", icon: "●", href: "/profile" },
    { label: "Privacy", description: "Visibility and permissions", icon: "◐", href: "/profile/privacy" },
  ];

  if (["admin", "moderator"].includes(profile?.role)) {
    menuItems.push({ label: "Admin", description: "Manage users and roles", icon: "⚡", href: "/admin" });
  }

  function openPath(href) {
    setMenuOpen(false);
    router.push(href);
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <header style={compact ? styles.headerCompact : styles.header}>
      <div style={styles.topRow}>
        <button type="button" onClick={() => openPath("/profile")} style={styles.avatarButton} aria-label="Open profile">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" style={styles.avatarImage} />
          ) : (
            <span style={styles.avatarFallback}>{initials}</span>
          )}
        </button>

        <button type="button" onClick={() => openPath("/trainings")} style={styles.logoButton} aria-label="Go to trainings">
          <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />
        </button>

        <button type="button" onClick={signOut} style={styles.signOutButton} aria-label="Sign out" title="Sign out">
          <svg viewBox="0 0 24 24" aria-hidden="true" style={styles.signOutIcon}>
            <path d="M10 7.5V6.25A2.25 2.25 0 0 1 12.25 4h5.5A2.25 2.25 0 0 1 20 6.25v11.5A2.25 2.25 0 0 1 17.75 20h-5.5A2.25 2.25 0 0 1 10 17.75V16.5" />
            <path d="M4 12h10.75" />
            <path d="M11.5 8.75 14.75 12l-3.25 3.25" />
          </svg>
        </button>
      </div>

      <div style={styles.menuShell}>
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          style={menuOpen ? styles.menuButtonOpen : styles.menuButton}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <span style={styles.hamburger}>☰</span>
          <span>Menu</span>
          <span style={styles.chevron}>{menuOpen ? "⌃" : "⌄"}</span>
        </button>

        {notificationCount > 0 ? (
          <span style={styles.menuNotificationBadge}>{notificationCount > 99 ? "99+" : notificationCount}</span>
        ) : null}

        {menuOpen ? (
          <div style={styles.menuPanel}>
            {menuItems.map((item) => (
              <button key={item.href} type="button" onClick={() => openPath(item.href)} style={styles.menuItem}>
                <span style={styles.menuIcon}>{item.icon}</span>
                <span style={styles.menuText}>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <span style={styles.menuArrow}>›</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function getInitials(value) {
  return (
    String(value)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "E"
  );
}

const baseButton = { border: 0, cursor: "pointer", fontWeight: 950 };

const styles = {
  header: { width: "100%", maxWidth: "100%", display: "grid", justifyItems: "center", gap: 12, position: "relative", zIndex: 20, overflow: "visible" },
  headerCompact: { width: "100%", maxWidth: "100%", display: "grid", justifyItems: "center", gap: 12, position: "relative", zIndex: 20, overflow: "visible" },
  topRow: { width: "100%", maxWidth: "100%", display: "grid", gridTemplateColumns: "48px minmax(0, 1fr) 48px", alignItems: "center", gap: 8, boxSizing: "border-box" },
  logoButton: { ...baseButton, background: "transparent", padding: 0, lineHeight: 0, justifySelf: "center", minWidth: 0 },
  logo: { width: "min(250px, 62vw)", maxWidth: "100%", height: "auto", display: "block", filter: "drop-shadow(0 12px 34px rgba(228,239,22,0.16))" },
  menuShell: { position: "relative", display: "grid", justifyItems: "center", width: "100%", maxWidth: "100%" },
  menuButton: { ...baseButton, minWidth: 140, height: 46, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "linear-gradient(145deg, rgba(18,22,28,0.90), rgba(8,12,16,0.88))", color: "white", fontSize: 16, padding: "0 16px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 18px 44px rgba(0,0,0,0.32)", backdropFilter: "blur(12px)" },
  menuButtonOpen: { ...baseButton, minWidth: 140, height: 46, borderRadius: 999, border: "1px solid rgba(228,239,22,0.36)", background: "linear-gradient(145deg, rgba(228,239,22,0.10), rgba(18,22,28,0.90))", color: "#e4ef16", fontSize: 16, padding: "0 16px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 0 0 1px rgba(228,239,22,0.05), 0 18px 44px rgba(0,0,0,0.34)", backdropFilter: "blur(12px)" },
  hamburger: { fontSize: 19, lineHeight: 1 },
  chevron: { fontSize: 18, lineHeight: 1, opacity: 0.9 },
  menuPanel: { position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)", width: "min(390px, calc(100vw - 32px))", borderRadius: 24, overflow: "hidden", background: "linear-gradient(145deg, rgba(14,18,24,0.98), rgba(5,8,10,0.98))", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 28px 90px rgba(0,0,0,0.55)", backdropFilter: "blur(18px)", zIndex: 50 },
  menuNotificationBadge: { position: "absolute", top: -5, right: "calc(50% - 76px)", minWidth: 22, height: 22, padding: "0 6px", borderRadius: 999, background: "#e4ef16", color: "#05070A", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 950, lineHeight: 1, border: "2px solid #05070A", boxShadow: "0 0 18px rgba(228,239,22,0.28)", zIndex: 3 },
  menuItem: { ...baseButton, width: "100%", minHeight: 68, display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) 22px", alignItems: "center", gap: 12, padding: "10px 14px", background: "transparent", color: "white", borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "left" },
  menuIcon: { width: 42, height: 42, borderRadius: 15, display: "grid", placeItems: "center", background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.20)", color: "#e4ef16", fontSize: 20 },
  menuText: { display: "grid", gap: 3, minWidth: 0 },
  menuArrow: { color: "rgba(255,255,255,0.76)", fontSize: 28, lineHeight: 1 },
  avatarButton: { ...baseButton, width: 46, height: 46, borderRadius: 999, border: "2px solid rgba(228,239,22,0.78)", background: "rgba(228,239,22,0.08)", display: "grid", placeItems: "center", overflow: "hidden", padding: 0, boxShadow: "0 0 0 1px rgba(228,239,22,0.13), 0 0 26px rgba(228,239,22,0.20), 0 12px 34px rgba(0,0,0,0.26)", justifySelf: "start" },
  avatarImage: { width: "100%", height: "100%", objectFit: "cover" },
  avatarFallback: { color: "#e4ef16", fontWeight: 950, fontSize: 13 },
  signOutButton: { ...baseButton, width: 46, height: 46, borderRadius: 999, border: "2px solid rgba(228,239,22,0.70)", background: "radial-gradient(circle at 32% 22%, rgba(228,239,22,0.20), transparent 38%), rgba(228,239,22,0.07)", color: "#e4ef16", display: "grid", placeItems: "center", padding: 0, boxShadow: "0 0 0 1px rgba(228,239,22,0.10), 0 0 28px rgba(228,239,22,0.18), 0 12px 34px rgba(0,0,0,0.26)", justifySelf: "end" },
  signOutIcon: { width: 27, height: 27, fill: "none", stroke: "#e4ef16", strokeWidth: 2.35, strokeLinecap: "round", strokeLinejoin: "round", filter: "drop-shadow(0 0 8px rgba(228,239,22,0.40))" },
};
