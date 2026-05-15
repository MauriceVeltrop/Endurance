"use client";

import RoleBadge from "./RoleBadge";

function getInitials(profile) {
  const value = profile?.name || profile?.email || "E";
  return (
    String(value)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "E"
  );
}

export default function ProfileHero({ profile, sports = [], stats = {}, isOwnProfile, onEditProfile }) {
  const initials = getInitials(profile);

  return (
    <section style={styles.hero}>
      <div style={styles.glow} />

      <div style={styles.content}>
        <div style={styles.avatarWrap}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" style={styles.avatar} />
          ) : (
            <div style={styles.avatarFallback}>{initials}</div>
          )}
        </div>

        <div style={styles.meta}>
          <div style={styles.kicker}>Verified Endurance profile</div>
          <h1 style={styles.name}>{profile?.name || "Endurance athlete"}</h1>
          <p style={styles.subtitle}>{profile?.location || "Location not set"}</p>

          <div style={styles.badges}>
            <RoleBadge role={profile?.role} />
            <span style={styles.softBadge}>{sports.length} preferred sport{sports.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <strong>{stats.created ?? 0}</strong>
            <span>Created</span>
          </div>
          <div style={styles.statCard}>
            <strong>{stats.joined ?? 0}</strong>
            <span>Joined</span>
          </div>
          <div style={styles.statCard}>
            <strong>{sports.length}</strong>
            <span>Sports</span>
          </div>
        </div>

        {isOwnProfile ? (
          <button type="button" onClick={onEditProfile} style={styles.primaryButton}>
            Edit profile
          </button>
        ) : null}
      </div>
    </section>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))";

const styles = {
  hero: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 36,
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #121712, #060706)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.34)",
  },
  glow: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(circle at 80% 18%, rgba(228,239,22,0.18), transparent 28%)",
  },
  content: {
    position: "relative",
    zIndex: 2,
    padding: 24,
    display: "grid",
    gap: 18,
    justifyItems: "center",
    textAlign: "center",
  },
  avatarWrap: {
    width: 118,
    height: 118,
    borderRadius: 999,
    overflow: "hidden",
    border: "2px solid rgba(228,239,22,0.55)",
    background: "rgba(228,239,22,0.10)",
    boxShadow: "0 0 34px rgba(228,239,22,0.18), 0 16px 40px rgba(0,0,0,0.30)",
  },
  avatar: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.14)",
    color: "#e4ef16",
    fontWeight: 950,
    fontSize: 38,
  },
  meta: {
    display: "grid",
    gap: 9,
    minWidth: 0,
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
  },
  name: {
    margin: 0,
    fontSize: "clamp(38px, 10vw, 66px)",
    lineHeight: 0.94,
    letterSpacing: "-0.075em",
    overflowWrap: "anywhere",
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.66)",
    fontWeight: 800,
  },
  badges: {
    display: "flex",
    gap: 9,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  softBadge: {
    display: "inline-flex",
    minHeight: 30,
    alignItems: "center",
    borderRadius: 999,
    padding: "0 12px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.76)",
    fontSize: 12,
    fontWeight: 900,
  },
  statsGrid: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  statCard: {
    minHeight: 78,
    borderRadius: 22,
    background: glass,
    border: "1px solid rgba(255,255,255,0.11)",
    display: "grid",
    alignContent: "center",
    gap: 4,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    padding: "0 18px",
    cursor: "pointer",
  },
};
