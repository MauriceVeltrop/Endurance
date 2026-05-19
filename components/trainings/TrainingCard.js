"use client";

import TrainingImage from "./TrainingImage";
import TrainingMeta from "./TrainingMeta";
import TrainingActions from "./TrainingActions";

export default function TrainingCard({
  training,
  sportLabel,
  sportImage,
  creator,
  creatorName,
  time,
  intensity,
  participantCount,
  maxParticipants,
  joined,
  spotsLeft,
  busy,
  onJoin,
  onOpen,
  onCreatorClick,
  actionNeeded = false,
  actionLabel = "Time to decide",
  statusLabel = "Upcoming",
  socialLabel = "Open for teammates",
  badges = [],
}) {
  const detailBadges = [
    training?.distance_km ? `${training.distance_km} km` : null,
    intensity && intensity !== "Intensity not set" ? intensity : null,
    training?.route_id ? "Route" : null,
    training?.workout_id ? "Workout" : null,
  ].filter(Boolean);

  return (
    <article style={actionNeeded ? styles.cardActionNeeded : styles.card}>
      <button type="button" onClick={onOpen} style={styles.imageButton} aria-label={`Open ${training.title}`}>
        <TrainingImage image={sportImage} title={training.title} />

        <div style={styles.imageOverlayTop}>
          <span style={styles.sportBadge}>{sportLabel}</span>
          <span style={styles.visibilityBadge}>{training?.visibility || "team"}</span>
        </div>

        <div style={styles.imageOverlayBottom}>
          <span style={styles.statusBadge}>{statusLabel}</span>
          {actionNeeded ? <span style={styles.actionBadge}>⚡ {actionLabel}</span> : null}
        </div>
      </button>

      <div style={styles.body}>
        <button type="button" onClick={onOpen} style={styles.titleButton}>
          <h2 style={styles.title}>{training.title}</h2>
        </button>

        <TrainingMeta
          creator={creator}
          creatorName={creatorName}
          time={time}
          location={training.start_location}
          distanceKm={training.distance_km}
          participantCount={participantCount}
          maxParticipants={maxParticipants}
          intensity={intensity}
          socialLabel={socialLabel}
          onCreatorClick={onCreatorClick}
        />

        {detailBadges.length ? (
          <div style={styles.statGrid}>
            {detailBadges.slice(0, 4).map((badge) => (
              <span key={badge} style={styles.statPill}>{badge}</span>
            ))}
          </div>
        ) : null}

        {badges.length ? (
          <div style={styles.badgeRow}>
            {badges.map((badge) => (
              <span key={badge} style={styles.microBadge}>{badge}</span>
            ))}
          </div>
        ) : null}
      </div>

      <TrainingActions
        joined={joined}
        participantCount={participantCount}
        spotsLeft={spotsLeft}
        busy={busy}
        onJoin={onJoin}
        onOpen={onOpen}
      />
    </article>
  );
}

const cardBase = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  borderRadius: 31,
  boxSizing: "border-box",
  color: "white",
  padding: 10,
  display: "grid",
  gap: 11,
  overflow: "hidden",
};

const styles = {
  card: {
    ...cardBase,
    background: "linear-gradient(145deg, rgba(21,25,32,0.94), rgba(8,11,16,0.86))",
    border: "1px solid rgba(255,255,255,0.085)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.035)",
  },
  cardActionNeeded: {
    ...cardBase,
    background: "radial-gradient(circle at 88% 8%, rgba(228,239,22,0.13), transparent 34%), linear-gradient(145deg, rgba(24,28,30,0.95), rgba(8,11,16,0.88))",
    border: "1px solid rgba(228,239,22,0.20)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  imageButton: {
    position: "relative",
    display: "block",
    width: "100%",
    minWidth: 0,
    border: 0,
    background: "transparent",
    color: "inherit",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    textAlign: "left",
  },
  imageOverlayTop: {
    position: "absolute",
    top: 11,
    left: 11,
    right: 11,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    pointerEvents: "none",
  },
  imageOverlayBottom: {
    position: "absolute",
    left: 11,
    right: 11,
    bottom: 11,
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
    pointerEvents: "none",
  },
  body: {
    minWidth: 0,
    display: "grid",
    gap: 9,
    padding: "0 2px",
  },
  titleButton: {
    border: 0,
    background: "transparent",
    color: "inherit",
    padding: 0,
    textAlign: "left",
    cursor: "pointer",
    minWidth: 0,
  },
  sportBadge: {
    maxWidth: "70%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "fit-content",
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(228,239,22,0.92)",
    color: "#0b0e12",
    fontSize: 11,
    fontWeight: 950,
    lineHeight: 1,
    boxShadow: "0 8px 22px rgba(0,0,0,0.28)",
  },
  visibilityBadge: {
    width: "fit-content",
    maxWidth: "40%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(5,7,10,0.72)",
    border: "1px solid rgba(255,255,255,0.13)",
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1,
    backdropFilter: "blur(12px)",
  },
  statusBadge: {
    width: "fit-content",
    maxWidth: "100%",
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(5,7,10,0.72)",
    border: "1px solid rgba(255,255,255,0.13)",
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1,
    backdropFilter: "blur(12px)",
  },
  actionBadge: {
    width: "fit-content",
    maxWidth: "100%",
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(228,239,22,0.92)",
    color: "#0b0e12",
    fontSize: 11,
    fontWeight: 950,
    lineHeight: 1,
  },
  title: {
    margin: 0,
    fontSize: "clamp(23px, 6vw, 34px)",
    lineHeight: 0.96,
    letterSpacing: "-0.064em",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 7,
  },
  statPill: {
    minWidth: 0,
    borderRadius: 16,
    padding: "10px 10px",
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.80)",
    fontSize: 12,
    fontWeight: 900,
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badgeRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    minWidth: 0,
  },
  microBadge: {
    maxWidth: "100%",
    borderRadius: 999,
    padding: "6px 9px",
    background: "rgba(255,255,255,0.052)",
    border: "1px solid rgba(255,255,255,0.075)",
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
    fontWeight: 850,
    lineHeight: 1,
    overflowWrap: "anywhere",
  },
};
