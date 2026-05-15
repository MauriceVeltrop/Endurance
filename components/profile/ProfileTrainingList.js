"use client";

import { getPrimarySport, getSportLabel, formatTrainingTime } from "../../lib/trainingHelpers";

export default function ProfileTrainingList({ title, trainings = [], emptyText, onOpen }) {
  return (
    <section style={styles.card}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.kicker}>{title}</div>
          <h2 style={styles.title}>Training sessions</h2>
        </div>
        <span style={styles.count}>{trainings.length}</span>
      </div>

      {trainings.length ? (
        <div style={styles.list}>
          {trainings.map((training) => {
            const sport = getPrimarySport(training);
            return (
              <button key={training.id} type="button" onClick={() => onOpen?.(training.id)} style={styles.trainingRow}>
                <span style={styles.sportBadge}>{getSportLabel(sport)}</span>
                <span style={styles.trainingTitle}>{training.title}</span>
                <span style={styles.trainingMeta}>{formatTrainingTime(training)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p style={styles.empty}>{emptyText || "No trainings yet."}</p>
      )}
    </section>
  );
}

const styles = {
  card: {
    borderRadius: 30,
    padding: 18,
    background: "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.12)",
    display: "grid",
    gap: 14,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "start",
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: "4px 0 0",
    fontSize: 26,
    letterSpacing: "-0.055em",
  },
  count: {
    minWidth: 42,
    height: 42,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    border: "1px solid rgba(228,239,22,0.20)",
    fontWeight: 950,
  },
  list: {
    display: "grid",
    gap: 10,
  },
  trainingRow: {
    width: "100%",
    border: 0,
    borderRadius: 20,
    padding: 12,
    background: "rgba(255,255,255,0.055)",
    color: "white",
    display: "grid",
    gap: 6,
    textAlign: "left",
    cursor: "pointer",
  },
  sportBadge: {
    width: "fit-content",
    borderRadius: 999,
    padding: "6px 9px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.20)",
    color: "#e4ef16",
    fontSize: 11,
    fontWeight: 950,
  },
  trainingTitle: {
    fontSize: 18,
    fontWeight: 950,
    letterSpacing: "-0.035em",
  },
  trainingMeta: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 13,
    fontWeight: 800,
  },
  empty: {
    margin: 0,
    color: "rgba(255,255,255,0.62)",
    lineHeight: 1.5,
  },
};
