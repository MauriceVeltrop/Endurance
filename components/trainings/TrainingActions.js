"use client";

export default function TrainingActions({ joined, spotsLeft, busy, onJoin, onOpen }) {
  const isFull = !joined && spotsLeft === 0;

  return (
    <div style={styles.footer}>
      <button type="button" onClick={onOpen} style={styles.openButton}>
        Details
      </button>

      <button
        type="button"
        onClick={onJoin}
        disabled={busy || isFull}
        style={joined ? styles.leaveButton : styles.joinButton}
      >
        {busy ? "..." : joined ? "Joined" : isFull ? "Full" : "Join session"}
      </button>
    </div>
  );
}

const baseButton = {
  border: 0,
  cursor: "pointer",
  fontWeight: 950,
  minHeight: 47,
  borderRadius: 17,
  padding: "0 13px",
  fontSize: 13,
  width: "100%",
  fontFamily: "inherit",
};

const styles = {
  footer: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.8fr) minmax(118px, 1.2fr)",
    alignItems: "center",
    gap: 8,
    paddingTop: 2,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  joinButton: {
    ...baseButton,
    color: "#0b0e12",
    background: "#e4ef16",
    boxShadow: "0 14px 32px rgba(228,239,22,0.15)",
  },
  leaveButton: {
    ...baseButton,
    color: "#e4ef16",
    background: "rgba(228,239,22,0.09)",
    border: "1px solid rgba(228,239,22,0.18)",
  },
  openButton: {
    ...baseButton,
    color: "rgba(255,255,255,0.88)",
    background: "rgba(255,255,255,0.065)",
    border: "1px solid rgba(255,255,255,0.09)",
  },
};
