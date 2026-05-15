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
  hasRoute,
  hasWorkout,
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
        <span style={styles.creatorText}>Created by {creatorName}</span>
      </button>

      <div style={styles.metaLine}>
        <span>🕒 {time}</span>
        <span>📍 {location || "Location not set"}</span>
      </div>

      <div style={styles.metricRow}>
        {hasDistance ? <span style={styles.metricPill}>↗ {distanceKm} km</span> : null}
        <span style={styles.metricPill}>👥 {participantCount}{maxParticipants ? `/${maxParticipants}` : ""}</span>
        {hasIntensity ? <span style={styles.metricPill}>⚡ {intensity}</span> : null}
        {hasRoute ? <span style={styles.featurePill}>🧭 Route</span> : null}
        {hasWorkout ? <span style={styles.featurePill}>🏋️ Workout</span> : null}
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
    minWidth: 24,
    maxWidth: 24,
    maxHeight: 24,
    flexShrink: 0,
    borderRadius: "50%",
    objectFit: "cover",
    display: "block",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.24)",
  },
  creatorFallback: {
    width: 24,
    height: 24,
    minWidth: 24,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.16)",
    border: "1px solid rgba(228,239,22,0.24)",
    color: "#e4ef16",
    fontSize: 11,
    fontWeight: 950,
  },
  creatorText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaLine: {
    display: "grid",
    gap: 5,
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    lineHeight: 1.28,
    minWidth: 0,
  },
  metricRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  metricPill: {
    borderRadius: 999,
    padding: "7px 9px",
    background: "rgba(255,255,255,0.065)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.78)",
    fontWeight: 850,
    fontSize: 12,
    lineHeight: 1,
  },
  featurePill: {
    borderRadius: 999,
    padding: "7px 9px",
    background: "rgba(228,239,22,0.11)",
    border: "1px solid rgba(228,239,22,0.20)",
    color: "#e4ef16",
    fontWeight: 900,
    fontSize: 12,
    lineHeight: 1,
  },
};
