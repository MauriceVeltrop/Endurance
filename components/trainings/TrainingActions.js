"use client";

export default function TrainingActions({
  joined,
  participantCount,
  spotsLeft,
  busy,
  onJoin,
  onOpen,
}) {
  const isFull = !joined && spotsLeft === 0;

  return (
    <div style={styles.footer}>
      <button type="button" onClick={onOpen} style={styles.openButton}>
        View details
      </button>

      <button
        type="button"
        onClick={onJoin}
        disabled={busy || isFull}
        style={joined ? styles.leaveButton : styles.joinButton}
      >
        {busy ? "..." : joined ? "Joined" : isFull ? "Full" : "Join"}
      </button>
    </div>
  );
}

const baseButton = {
  border: 0,
  cursor: "pointer",
  fontWeight: 950,
  minHeight: 42,
  borderRadius: 999,
  padding: "0 12px",
  fontSize: 13,
  width: "100%",
};

const styles = {
  footer: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(88px, auto)",
    alignItems: "center",
    gap: 8,
    paddingTop: 4,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  joinButton: {
    ...baseButton,
    color: "#101406",
    background: "#e4ef16",
  },
  leaveButton: {
    ...baseButton,
    color: "#e4ef16",
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.22)",
  },
  openButton: {
    ...baseButton,
    color: "white",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.11)",
  },
};
