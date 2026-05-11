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
      <button type="button" onClick={() => router.push("/trainings")} style={styles.logoButton} aria-label="Go to trainings">
        <img src="/logo-endurance.png" alt="Endurance" style={styles.logo} />
      </button>

      <div style={styles.actions}>
        {profile?.role ? <span style={styles.roleBadge}>{profile.role}</span> : null}

        {profile?.role === "admin" ? (
          <button type="button" onClick={() => router.push("/admin")} style={styles.iconButton} aria-label="Open admin">
            ⚙
          </button>
        ) : null}

        <button type="button" onClick={() => router.push("/profile")} style={styles.avatarButton} aria-label="Open profile">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" style={styles.avatarImage} />
          ) : (
            <span style={styles.avatarFallback}>{initials}</span>
          )}
        </button>

        <button type="button" onClick={signOut} style={styles.iconButton} aria-label="Log out">
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
  fontFamily: "inherit",
};

const styles = {
  header: {
    width: "min(960px, 100%)",
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  headerCompact: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  logoButton: {
    ...baseButton,
    flex: "0 1 auto",
    minWidth: 0,
    background: "transparent",
    padding: 0,
    lineHeight: 0,
  },
  logo: {
    width: "clamp(150px, 38vw, 220px)",
    height: "auto",
    display: "block",
    filter: "drop-shadow(0 12px 34px rgba(228,239,22,0.12))",
  },
  actions: {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  roleBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    borderRadius: 999,
    padding: "0 11px",
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.22)",
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "capitalize",
    whiteSpace: "nowrap",
  },
  avatarButton: {
    ...baseButton,
    width: 42,
    height: 42,
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
  iconButton: {
    ...baseButton,
    width: 42,
    height: 42,
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.82)",
    fontSize: 18,
  },
};
