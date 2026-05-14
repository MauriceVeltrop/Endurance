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
      <div style={styles.footerText}>
        <span style={styles.joined}>
          {joined
            ? "You joined"
            : spotsLeft !== null && spotsLeft !== undefined
              ? `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`
              : "Open session"}
        </span>
        <span style={styles.footerSub}>
          {participantCount ? `${participantCount} joined` : "No participants yet"}
        </span>
      </div>

      <div style={styles.actions}>
        <button
          type="button"
          onClick={onJoin}
          disabled={busy || isFull}
          style={joined ? styles.leaveButton : styles.joinButton}
        >
          {busy ? "..." : joined ? "Leave" : isFull ? "Full" : "Join"}
        </button>

        <button type="button" onClick={onOpen} style={styles.openButton}>
          Open →
        </button>
      </div>
    </div>
  );
}

const baseButton = {
  border: 0,
  cursor: "pointer",
  fontWeight: 950,
  minHeight: 42,
  borderRadius: 999,
  padding: "0 13px",
  fontSize: 13,
};

const styles = {
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingTop: 2,
    flexWrap: "wrap",
  },
  footerText: {
    display: "grid",
    gap: 3,
    minWidth: 0,
  },
  joined: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: 950,
    fontSize: 13,
  },
  footerSub: {
    color: "rgba(255,255,255,0.50)",
    fontWeight: 800,
    fontSize: 12,
  },
  actions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexShrink: 0,
  },
  joinButton: {
    ...baseButton,
    color: "#101406",
    background: "#e4ef16",
  },
  leaveButton: {
    ...baseButton,
    color: "white",
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.14)",
  },
  openButton: {
    ...baseButton,
    color: "#101406",
    background: "#e4ef16",
  },
};
