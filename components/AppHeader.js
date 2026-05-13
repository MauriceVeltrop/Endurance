"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function AppHeader({ profile, compact = false }) {
  const router = useRouter();
  const initials = getInitials(profile?.name || profile?.email || "E");

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
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
          onClick={() => router.push("/workouts")}
          style={styles.navButton}
          aria-label="Open workouts"
        >
          Workouts
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

        {["admin", "moderator"].includes(profile?.role) ? (
          <button
            type="button"
            onClick={() => router.push("/admin")}
            style={styles.navButton}
            aria-label="Open admin"
          >
            Admin
          </button>
        ) : null}

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

  navButton: {
    ...baseButton,
    minWidth: 92,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 900,
    fontSize: 15,
    padding: "0 18px",
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
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontSize: 20,
    display: "grid",
    placeItems: "center",
    padding: 0,
  },
};
