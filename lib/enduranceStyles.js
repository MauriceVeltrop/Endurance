export const app = {
  background: "#050505",
  color: "white",
  minHeight: "100vh",
  padding: 16,
  fontFamily: "sans-serif",
};

export const header = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  display: "flex",
  justifyContent: "center",
  padding: "12px 0 18px",
  background: "linear-gradient(to bottom, #050505 85%, rgba(5,5,5,0))",
};

export const authCard = {
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 24,
  padding: 20,
};

export const authTabs = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 16,
};

export const loginBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 18,
  padding: "14px 16px",
  marginBottom: 18,
};

export const loginInfo = {
  fontSize: 14,
  color: "#ddd",
};

export const roleBadge = {
  marginTop: 6,
  display: "inline-block",
  background: "rgba(228,239,22,0.12)",
  color: "#e4ef16",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: "bold",
};

export const actionLinkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

export const eventsSection = {
  paddingBottom: 110,
};

export const horizontalScroll = {
  display: "flex",
  gap: 16,
  overflowX: "auto",
  paddingBottom: 8,
  scrollSnapType: "x mandatory",
  WebkitOverflowScrolling: "touch",
};

export const emptyCard = {
  background: "#111",
  padding: 24,
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.05)",
};

export const errorCard = {
  background: "#3a1616",
  color: "#ffd2d2",
  padding: 16,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.05)",
  marginBottom: 18,
};

export const label = {
  marginBottom: 6,
  opacity: 0.82,
  fontSize: 14,
};

export const helperText = {
  fontSize: 13,
  opacity: 0.7,
  marginTop: 6,
};

export const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.72)",
  zIndex: 20,
  padding: 16,
  display: "flex",
  alignItems: "center",
};

export const modal = {
  width: "100%",
  background: "#111",
  borderRadius: 24,
  padding: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  maxHeight: "90vh",
  overflowY: "auto",
};

export const modalTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 14,
};

export const closeBtn = {
  background: "#1d1d1d",
  color: "white",
  border: "none",
  width: 36,
  height: 36,
  borderRadius: 999,
};

export const grid = {
  display: "grid",
  gap: 12,
};

export const field = {
  width: "100%",
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: "14px 12px",
  borderRadius: 12,
  boxSizing: "border-box",
};

export const rangeRow = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
  opacity: 0.6,
  marginTop: 4,
};

export const sportsPicker = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 6,
};

export const sportChip = {
  background: "#222",
  border: "1px solid #333",
  color: "white",
  padding: "8px 14px",
  borderRadius: 999,
  cursor: "pointer",
};

export const sportChipSelected = {
  background: "#e4ef16",
  color: "black",
  border: "1px solid #e4ef16",
  padding: "8px 14px",
  borderRadius: 999,
  fontWeight: "bold",
  cursor: "pointer",
};

export const card = {
  background: "#111",
  padding: 20,
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.05)",
  minWidth: "85vw",
  maxWidth: "85vw",
  scrollSnapAlign: "start",
  flexShrink: 0,
};

export const sportTag = {
  display: "inline-block",
  background: "rgba(228,239,22,0.12)",
  color: "#e4ef16",
  padding: "7px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: "bold",
  marginBottom: 10,
};

export const cardTitle = {
  fontSize: 26,
  marginTop: 0,
  marginBottom: 6,
};

export const distanceText = {
  fontSize: 16,
  fontWeight: "600",
  color: "#cfd3d6",
  marginBottom: 4,
};

export const elevationText = {
  fontSize: 14,
  fontWeight: "600",
  color: "#cfd3d6",
  marginBottom: 14,
};

export const creatorText = {
  fontSize: 14,
  opacity: 0.85,
};

export const profileLink = {
  color: "#e4ef16",
  textDecoration: "none",
  fontWeight: "bold",
};

export const inlineProfileLink = {
  color: "#e4ef16",
  textDecoration: "none",
};

export const chipLink = {
  background: "#1f1f1f",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 13,
  color: "white",
  textDecoration: "none",
};

export const meta = {
  display: "grid",
  gap: 8,
  marginBottom: 16,
  opacity: 0.95,
};

export const mapBtn = {
  background: "transparent",
  color: "white",
  border: "none",
  padding: 0,
  textAlign: "left",
  fontSize: 16,
  cursor: "pointer",
};

export const routeMapWrap = {
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 12,
  marginTop: 14,
  marginBottom: 12,
};

export const routeMapTitle = {
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 8,
  color: "#e4ef16",
};

export const routeSvg = {
  width: "100%",
  height: "auto",
  display: "block",
  borderRadius: 18,
};

export const routeMapMeta = {
  fontSize: 12,
  opacity: 0.7,
  marginTop: 8,
};

export const gpxActions = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  marginTop: 12,
  marginBottom: 12,
};

export const gpxLink = {
  display: "inline-block",
  color: "#e4ef16",
  textDecoration: "none",
  fontWeight: "bold",
};

export const communityBox = {
  marginTop: 18,
  padding: 16,
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 18,
};

export const communityTitle = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 8,
  color: "#f3f3f3",
};

export const communityText = {
  fontSize: 14,
  lineHeight: 1.5,
  color: "#d6d6d6",
  marginBottom: 14,
  whiteSpace: "pre-wrap",
};

export const likeRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 16,
};

export const likeBtn = {
  background: "#1d1d1d",
  color: "white",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: "10px 14px",
  borderRadius: 12,
};

export const likeCount = {
  fontSize: 14,
  opacity: 0.75,
};

export const likeUsers = {
  fontSize: 13,
  opacity: 0.6,
};

export const commentsWrap = {
  display: "grid",
  gap: 10,
};

export const commentList = {
  display: "grid",
  gap: 10,
};

export const commentItem = {
  background: "#151515",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 14,
  padding: 12,
};

export const commentHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 4,
};

export const commentName = {
  fontSize: 13,
  fontWeight: 700,
  color: "#e4ef16",
};

export const commentTextStyle = {
  fontSize: 14,
  lineHeight: 1.45,
  color: "#e3e3e3",
  whiteSpace: "pre-wrap",
};

export const communityMuted = {
  fontSize: 14,
  opacity: 0.6,
};

export const commentUserLabel = {
  fontSize: 13,
  opacity: 0.75,
};

export const commentForm = {
  display: "grid",
  gap: 10,
  marginTop: 6,
};

export const commentField = {
  width: "100%",
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: "12px 12px",
  borderRadius: 12,
  boxSizing: "border-box",
  minHeight: 90,
  resize: "vertical",
};

export const btnRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};

export const primaryBtn = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: "bold",
};

export const secondaryBtn = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

export const primaryBtnSmall = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: "bold",
};

export const secondaryBtnSmall = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
};

export const dangerBtnSmall = {
  background: "#5a1f1f",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
};

export const miniDeleteBtn = {
  background: "transparent",
  color: "#ff8d8d",
  border: "none",
  padding: 0,
  fontSize: 12,
};

export const fab = {
  position: "fixed",
  right: 18,
  bottom: 22,
  width: 62,
  height: 62,
  borderRadius: 999,
  border: "none",
  background: "#e4ef16",
  color: "black",
  fontSize: 34,
  fontWeight: "bold",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
};
  
