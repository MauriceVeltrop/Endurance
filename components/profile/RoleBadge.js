"use client";

export default function RoleBadge({ role }) {
  const value = role || "user";
  const label = value === "admin" ? "Admin" : value === "moderator" ? "Moderator" : value === "organizer" ? "Organizer" : "Athlete";

  return <span style={styles.badge}>{label}</span>;
}

const styles = {
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    borderRadius: 999,
    padding: "0 12px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.28)",
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
};
