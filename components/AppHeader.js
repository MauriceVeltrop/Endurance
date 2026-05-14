"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function AppHeader({ profile, compact = false }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = getInitials(profile?.name || profile?.email || "E");

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const menuItems = [
    {
      label: "Trainings",
      description: "Browse all training sessions",
      icon: "▣",
      href: "/trainings",
    },
    {
      label: "Routes",
      description: "Browse and manage routes",
      icon: "⌁",
      href: "/routes",
    },
    {
      label: "Workouts",
      description: "Create and manage workouts",
      icon: "▰",
      href: "/workouts",
    },
    {
      label: "Team",
      description: "Team Up partners and invites",
      icon: "◎",
      href: "/team",
    },
  ];

  if (["admin", "moderator"].includes(profile?.role)) {
    menuItems.push({
      label: "Admin",
      description: "Manage users and roles",
      icon: "★",
      href: "/admin",
    });
  }

  const goTo = (href) => {
    setMenuOpen(false);
    router.push(href);
  };

  return (
    <header style={compact ? styles.headerCompact : styles.header}>
      <div style={styles.topRow}>
        <button
          type="button"
          onClick={() => router.push("/trainings")}
          style={styles.logoButton}
          aria-label="Go to trainings"
        >
          <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />
        </button>

        <div style={styles.alwaysVisibleActions}>
          <button
            type="button"
            onClick={() => router.push("/profile")}
            style={styles.avatarButton}
            aria-label="Open profile"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" style={styles.avatarImage} />
            ) : (
              <span style={styles.avatarFallback}>{initials}</span>
            )}
          </button>

          <button
            type="button"
            onClick={signOut}
            style={styles.iconButton}
            aria-label="Log out"
          >
            ↪
          </button>
        </div>
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

        {menuOpen ? (
          <div style={styles.menuPanel}>
            {menuItems.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => goTo(item.href)}
                style={styles.menuItem}
              >
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

const baseButton = {
  border: 0,
  cursor: "pointer",
  fontWeight: 950,
};

const styles = {
  header: {
    width: "100%",
    display: "grid",
    justifyItems: "center",
    gap: 14,
    position: "relative",
    zIndex: 20,
  },

  headerCompact: {
    width: "100%",
    display: "grid",
    justifyItems: "center",
    gap: 12,
    position: "relative",
    zIndex: 20,
  },

  topRow: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 10,
  },

  logoButton: {
    ...baseButton,
    background: "transparent",
    padding: 0,
    lineHeight: 0,
    justifySelf: "center",
    marginLeft: 86,
  },

  logo: {
    width: "min(280px, 62vw)",
    height: "auto",
    display: "block",
    filter: "drop-shadow(0 12px 34px rgba(228,239,22,0.16))",
  },

  alwaysVisibleActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 9,
  },

  menuShell: {
    position: "relative",
    display: "grid",
    justifyItems: "center",
    width: "100%",
  },

  menuButton: {
    ...baseButton,
    minWidth: 150,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.25)",
    background: "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045))",
    color: "white",
    fontSize: 16,
    padding: "0 16px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    boxShadow: "0 18px 44px rgba(0,0,0,0.22)",
    backdropFilter: "blur(12px)",
  },

  menuButtonOpen: {
    ...baseButton,
    minWidth: 150,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.42)",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    fontSize: 16,
    padding: "0 16px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    boxShadow: "0 0 0 1px rgba(228,239,22,0.07), 0 18px 44px rgba(0,0,0,0.26)",
    backdropFilter: "blur(12px)",
  },

  hamburger: {
    fontSize: 19,
    lineHeight: 1,
  },

  chevron: {
    fontSize: 18,
    lineHeight: 1,
    opacity: 0.9,
  },

  menuPanel: {
    position: "absolute",
    top: 58,
    width: "min(430px, calc(100vw - 36px))",
    borderRadius: 24,
    overflow: "hidden",
    background:
      "linear-gradient(145deg, rgba(25,30,25,0.98), rgba(9,12,9,0.98))",
    border: "1px solid rgba(228,239,22,0.22)",
    boxShadow: "0 28px 90px rgba(0,0,0,0.45)",
    backdropFilter: "blur(18px)",
    zIndex: 50,
  },

  menuItem: {
    ...baseButton,
    width: "100%",
    minHeight: 74,
    display: "grid",
    gridTemplateColumns: "48px minmax(0, 1fr) 22px",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    background: "transparent",
    color: "white",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    textAlign: "left",
  },

  menuIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.20)",
    color: "#e4ef16",
    fontSize: 22,
  },

  menuText: {
    display: "grid",
    gap: 3,
  },

  menuArrow: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 30,
    lineHeight: 1,
  },

  avatarButton: {
    ...baseButton,
    width: 48,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    padding: 0,
    boxShadow: "0 12px 34px rgba(0,0,0,0.26)",
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  avatarFallback: {
    color: "#e4ef16",
    fontWeight: 950,
    fontSize: 14,
  },

  iconButton: {
    ...baseButton,
    width: 48,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.18)",
    background: "rgba(228,239,22,0.08)",
    color: "white",
    fontSize: 25,
    display: "grid",
    placeItems: "center",
    padding: 0,
    boxShadow: "0 12px 34px rgba(0,0,0,0.26)",
  },
};
