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
}) {
  return (
    <article style={styles.card}>
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
            hasRoute={Boolean(training.route_id)}
            hasWorkout={Boolean(training.workout_id)}
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
    background: "linear-gradient(145deg, rgba(255,255,255,0.095), rgba(255,255,255,0.038))",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 16px 46px rgba(0,0,0,0.30)",
    display: "grid",
    gap: 10,
    overflow: "hidden",
    padding: 12,
  },
  mainButton: {
    display: "grid",
    gridTemplateColumns: "112px minmax(0, 1fr)",
    gap: 12,
    alignItems: "stretch",
    textAlign: "left",
    border: 0,
    padding: 0,
    margin: 0,
    color: "white",
    background: "transparent",
    cursor: "pointer",
    width: "100%",
    minWidth: 0,
  },
  body: {
    display: "grid",
    alignContent: "start",
    gap: 8,
    minWidth: 0,
    padding: "2px 2px 0 0",
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  sportBadge: {
    display: "inline-flex",
    minWidth: 0,
    maxWidth: "72%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.28)",
    color: "#e4ef16",
    fontWeight: 950,
    fontSize: 12,
  },
  visibilityBadge: {
    borderRadius: 999,
    padding: "7px 9px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.72)",
    fontWeight: 850,
    fontSize: 12,
    textTransform: "capitalize",
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: "clamp(22px, 6vw, 30px)",
    lineHeight: 1.02,
    letterSpacing: "-0.055em",
    overflowWrap: "anywhere",
  },
};
