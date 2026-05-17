"use client";

export default function TrainingMeta({
  creator,
  creatorName,
  time,
  location,
  distanceKm,
  participantCount,
  maxParticipants,
  intensity,
  onCreatorClick,
}) {
  const hasDistance = distanceKm !== null && distanceKm !== undefined && distanceKm !== "";
  const hasIntensity = Boolean(intensity && intensity !== "Intensity not set");

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

      <div style={styles.infoStack}>
        <span>🕒 {time}</span>
        <span>📍 {location || "Location not set"}</span>
      </div>

      <div style={styles.metricRow}>
        {hasDistance ? <span style={styles.metricPill}>{distanceKm} km</span> : null}
        <span style={styles.metricPill}>
          {participantCount}{maxParticipants ? `/${maxParticipants}` : ""} joined
        </span>
        {hasIntensity ? <span style={styles.metricPill}>{intensity}</span> : null}
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    display: "grid",
    gap: 8,
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
    width: 24,
    height: 24,
    borderRadius: 999,
    objectFit: "cover",
    border: "1px solid rgba(228,239,22,0.24)",
    flexShrink: 0,
  },
  creatorFallback: {
    width: 24,
    height: 24,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    border: "1px solid rgba(228,239,22,0.22)",
    fontWeight: 950,
    flexShrink: 0,
  },
  creatorText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  infoStack: {
    display: "grid",
    gap: 4,
    color: "rgba(255,255,255,0.70)",
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.25,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  metricRow: {
    display: "flex",
    gap: 7,
    flexWrap: "wrap",
  },
  metricPill: {
    maxWidth: "100%",
    overflowWrap: "anywhere",
    borderRadius: 999,
    padding: "6px 9px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.76)",
    fontSize: 12,
    fontWeight: 900,
  },
};
