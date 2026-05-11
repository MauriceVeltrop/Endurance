"use client";

import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

const mainLinks = [
  { href: "/trainings", label: "Trainings" },
  { href: "/trainings/new", label: "Create" },
  { href: "/profile", label: "Profile" },
];

export default function AppHeader({ profile, compact = false }) {
  const router = useRouter();
  const pathname = usePathname();
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

      <nav style={styles.navPill} aria-label="Primary navigation">
        {mainLinks.map((link) => {
          const active = pathname === link.href || (link.href !== "/trainings" && pathname?.startsWith(link.href));
          return (
            <button
              key={link.href}
              type="button"
              onClick={() => router.push(link.href)}
              style={active ? styles.navButtonActive : styles.navButton}
            >
              {link.label}
            </button>
          );
        })}
      </nav>

      <div style={styles.actions}>
        {profile?.role ? <span style={styles.roleBadge}>{profile.role}</span> : null}

        {["admin", "moderator"].includes(profile?.role) ? (
          <button type="button" onClick={() => router.push("/admin")} style={styles.adminButton} aria-label="Open admin">
            Admin
          </button>
        ) : null}

        <button type="button" onClick={() => router.push("/profile")} style={styles.avatarButton} aria-label="Open profile">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" style={styles.avatarImage} />
          ) : (
            <span style={styles.avatarFallback}>{initials}</span>
          )}
        </button>

        <button type="button" onClick={signOut} style={styles.logoutButton} aria-label="Log out">
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
};

const styles = {
  header: {
    width: "min(1040px, 100%)",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: 14,
  },
  headerCompact: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: 14,
  },
  logoButton: {
    ...baseButton,
    background: "transparent",
    padding: 0,
    lineHeight: 0,
    justifySelf: "start",
  },
  logo: {
    width: "clamp(142px, 25vw, 220px)",
    height: "auto",
    display: "block",
    filter: "drop-shadow(0 12px 34px rgba(228,239,22,0.12))",
  },
  navPill: {
    justifySelf: "center",
    display: "flex",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    padding: 5,
    borderRadius: 999,
    background: "rgba(255,255,255,0.065)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    overflowX: "auto",
    maxWidth: "100%",
  },
  navButton: {
    ...baseButton,
    minHeight: 34,
    borderRadius: 999,
    padding: "0 12px",
    background: "transparent",
    color: "rgba(255,255,255,0.68)",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  navButtonActive: {
    ...baseButton,
    minHeight: 34,
    borderRadius: 999,
    padding: "0 12px",
    background: "#e4ef16",
    color: "#101406",
    fontSize: 12,
    whiteSpace: "nowrap",
    boxShadow: "0 12px 24px rgba(228,239,22,0.14)",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "end",
    gap: 9,
    minWidth: 0,
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
    width: 42,
    height: 42,
    borderRadius: 999,
    overflow: "hidden",
    padding: 0,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "white",
    flex: "0 0 auto",
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
    width: 42,
    height: 42,
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.82)",
    fontSize: 19,
    flex: "0 0 auto",
  },
};
