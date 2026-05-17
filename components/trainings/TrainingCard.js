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
}) {
  return (
    <article style={actionNeeded ? styles.cardActionNeeded : styles.card}>
      <button
        type="button"
        onClick={onOpen}
        style={styles.mainButton}
        aria-label={`Open ${training.title}`}
      >
        <TrainingImage image={sportImage} title={training.title} />

        <div style={styles.body}>
          <div style={styles.topRow}>
            <span style={styles.sportBadge}>{sportLabel}</span>
            <span style={styles.visibilityBadge}>{training.visibility}</span>
            {actionNeeded ? <span style={styles.actionBadge}>⚡ {actionLabel}</span> : null}
          </div>

          <h2 style={styles.title}>{training.title}</h2>

          <TrainingMeta
            creator={creator}
            creatorName={creatorName}
            time={time}
            location={training.start_location}
            distanceKm={training.distance_km}
            participantCount={participantCount}
            maxParticipants={maxParticipants}
            intensity={intensity}
            onCreatorClick={onCreatorClick}
          />
        </div>
      </button>

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

const styles = {
  card: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    borderRadius: 28,
    boxSizing: "border-box",
    color: "white",
    background: "linear-gradient(145deg, rgba(255,255,255,0.092), rgba(255,255,255,0.036))",
    border: "1px solid rgba(255,255,255,0.13)",
    boxShadow: "0 22px 60px rgba(0,0,0,0.24)",
    padding: 10,
    display: "grid",
    gap: 8,
    overflow: "hidden",
  },
  mainButton: {
    width: "100%",
    minWidth: 0,
    border: 0,
    background: "transparent",
    color: "inherit",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "108px minmax(0, 1fr)",
    gap: 12,
    textAlign: "left",
  },
  body: {
    minWidth: 0,
    display: "grid",
    alignContent: "start",
    gap: 8,
    padding: "2px 2px 0 0",
  },
  topRow: {
    display: "flex",
    gap: 7,
    flexWrap: "wrap",
    alignItems: "center",
  },
  sportBadge: {
    width: "fit-content",
    borderRadius: 999,
    padding: "6px 9px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.23)",
    color: "#e4ef16",
    fontSize: 11,
    fontWeight: 950,
    lineHeight: 1,
  },
  visibilityBadge: {
    width: "fit-content",
    borderRadius: 999,
    padding: "6px 9px",
    background: "rgba(255,255,255,0.065)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.66)",
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1,
    textTransform: "capitalize",
  },
  title: {
    margin: 0,
    fontSize: "clamp(21px, 6vw, 30px)",
    lineHeight: 0.98,
    letterSpacing: "-0.055em",
    overflowWrap: "anywhere",
  },
};
