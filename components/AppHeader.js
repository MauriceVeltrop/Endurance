"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function AppHeader({ profile, compact = false }) {
  const router = useRouter();
  const initials = getInitials(profile?.name || profile?.email || "E");

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  
  avatarButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    cursor: "pointer",
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  avatarFallback: {
    color: "#e4ef16",
    fontWeight: 900,
    fontSize: 14,
  },

  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer",
  },

};

  return (
    <header style={compact ? styles.headerCompact : styles.header}>
      <button
        type="button"
        onClick={() => router.push("/trainings")}
        style={styles.logoButton}
        aria-label="Go to trainings"
      >
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />
      </button>

      <div style={styles.actions}>
        <button
          type="button"
          onClick={() => router.push("/routes")}
          style={styles.navButton}
          aria-label="Open routes"
        >
          Routes
        </button>

        <button
          type="button"
          onClick={() => router.push("/team")}
          style={styles.navButton}
          aria-label="Open team"
        >
          Team
        </button>

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
          ⎋
        </button>
      </div>
    </header>
  );
}

function getInitials(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "E";
}

const baseButton = {
  border: 0,
  cursor: "pointer",
  fontWeight: 950,

  avatarButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    cursor: "pointer",
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  avatarFallback: {
    color: "#e4ef16",
    fontWeight: 900,
    fontSize: 14,
  },

  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer",
  },

};

const styles = {
  header: {
    width: "100%",
    display: "grid",
    justifyItems: "center",
    gap: 16,
  },
  headerCompact: {
    width: "100%",
    display: "grid",
    justifyItems: "center",
    gap: 14,
  },
  logoButton: {
    ...baseButton,
    background: "transparent",
    padding: 0,
    lineHeight: 0,
  },
  logo: {
    width: "min(280px, 72vw)",
    height: "auto",
    display: "block",
    filter: "drop-shadow(0 12px 34px rgba(228,239,22,0.16))",
  },
  actions: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  roleBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 34,
    borderRadius: 999,
    padding: "0 11px",
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.22)",
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "capitalize",
  },
  signOutButton: {
    ...baseButton,
    minHeight: 44,
    padding: "0 18px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "white",
    fontSize: 15,
    fontWeight: 900,
  },
  navButton: {
    minWidth: 92,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 900,
    fontSize: 15,
    padding: "0 18px",
    cursor: "pointer",
  },
  adminButton: {
    ...baseButton,
    minHeight: 34,
    borderRadius: 999,
    padding: "0 11px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
  },
  avatarButton: {
    ...baseButton,
    width: 38,
    height: 38,
    borderRadius: 999,
    overflow: "hidden",
    padding: 0,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "white",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  avatarFallback: {
    display: "grid",
    placeItems: "center",
    width: "100%",
    height: "100%",
    color: "#e4ef16",
    fontSize: 13,
    letterSpacing: "-0.02em",
  },
  logoutButton: {
    ...baseButton,
    width: 38,
    height: 38,
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.82)",
    fontSize: 19,
  },

  avatarButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    cursor: "pointer",
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  avatarFallback: {
    color: "#e4ef16",
    fontWeight: 900,
    fontSize: 14,
  },

  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer",
  },

};
