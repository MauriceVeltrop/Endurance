"use client";

export default function TrainingMeta({
  creator,
  creatorName,
  time,
  location,
  participantCount,
  maxParticipants,
  socialLabel,
  onCreatorClick,
}) {
  return (
    <div style={styles.wrap}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onCreatorClick?.();
        }}
        style={styles.creatorRow}
      >
        {creator?.avatar_url ? (
          <img src={creator.avatar_url} alt="" style={styles.creatorAvatar} />
        ) : (
          <span style={styles.creatorFallback}>{String(creatorName || "O").slice(0, 1).toUpperCase()}</span>
        )}
        <span style={styles.creatorText}>Hosted by {creatorName}</span>
      </button>

      <div style={styles.infoGrid}>
        <span style={styles.infoItem}>🕒 {time}</span>
        <span style={styles.infoItem}>📍 {location || "Location not set"}</span>
        <span style={styles.infoItem}>👥 {socialLabel || `${participantCount} joined`}</span>
        <span style={styles.infoItem}>🎟 {participantCount}{maxParticipants ? `/${maxParticipants}` : ""} joined</span>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    display: "grid",
    gap: 9,
    minWidth: 0,
  },
  creatorRow: {
    border: 0,
    padding: 0,
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: 850,
    lineHeight: 1.2,
  },
  creatorAvatar: {
    width: 27,
    height: 27,
    borderRadius: 999,
    objectFit: "cover",
    border: "1px solid rgba(228,239,22,0.22)",
    flexShrink: 0,
  },
  creatorFallback: {
    width: 27,
    height: 27,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.10)",
    color: "#e4ef16",
    border: "1px solid rgba(228,239,22,0.18)",
    fontWeight: 950,
    flexShrink: 0,
  },
  creatorText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 7,
    minWidth: 0,
  },
  infoItem: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "rgba(255,255,255,0.70)",
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.065)",
    borderRadius: 15,
    padding: "9px 9px",
    fontSize: 12,
    fontWeight: 850,
  },
};
