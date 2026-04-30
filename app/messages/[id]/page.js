"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ENDURANCE_YELLOW = "#eaff00";
const DARK_BG = "#050505";
const PANEL = "#101113";
const PANEL_2 = "#1b1c20";
const TEXT = "#f5f5f5";
const MUTED = "#a7a7a7";

function pad(n) {
  return String(n).padStart(2, "0");
}

function timeLabel(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function dateChip(value) {
  const d = new Date(value);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function initials(name = "?") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

const demoMe = {
  id: "me",
  name: "Maurice Veltrop",
  role: "moderator",
  avatar: "/avatar.png",
};

const demoOther = {
  id: "other",
  name: "Maurice Veltrop",
  role: "moderator",
  avatar: "/avatar.png",
};

const initialMessages = [
  {
    id: "1",
    sender_id: "other",
    sender_name: "Maurice Veltrop",
    body: "Test",
    created_at: "2026-04-27T11:44:00",
  },
  {
    id: "2",
    sender_id: "me",
    sender_name: "Maurice Veltrop",
    body: "Heey... Hoe issie?",
    created_at: "2026-04-27T11:49:00",
  },
  {
    id: "3",
    sender_id: "me",
    sender_name: "Maurice Veltrop",
    body: "Lekker weer",
    created_at: "2026-04-27T11:50:00",
  },
  {
    id: "4",
    sender_id: "other",
    sender_name: "Maurice Veltrop",
    body: "Ja, vandaag ook!",
    created_at: "2026-04-28T15:24:00",
  },
  {
    id: "5",
    sender_id: "other",
    sender_name: "Maurice Veltrop",
    body: "Hoi",
    created_at: "2026-04-28T21:11:00",
  },
  {
    id: "6",
    sender_id: "me",
    sender_name: "Maurice Veltrop",
    body: "Hallo",
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "7",
    sender_id: "other",
    sender_name: "Maurice Veltrop",
    body: "Test",
    created_at: new Date(Date.now() - 23.95 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "8",
    sender_id: "other",
    sender_name: "Maurice Veltrop",
    body: "Test 2",
    created_at: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
  },
];

export default function MessageThreadPage() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  const contact = demoOther;
  const currentUser = demoMe;

  const canSend = input.trim().length > 0 || !!selectedFile;

  const grouped = useMemo(() => {
    const rows = [];
    let lastDate = null;

    messages
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .forEach((m) => {
        if (!lastDate || !sameDay(lastDate, m.created_at)) {
          rows.push({ type: "date", id: `date-${m.created_at}`, label: dateChip(m.created_at) });
          lastDate = m.created_at;
        }
        rows.push({ type: "message", ...m });
      });

    return rows;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  function sendMessage() {
    if (!canSend) return;

    const text = input.trim();
    const attachmentText = selectedFile ? `📎 ${selectedFile.name}` : "";
    const body = [text, attachmentText].filter(Boolean).join("\n");

    setMessages((prev) => [
      ...prev,
      {
        id: crypto?.randomUUID?.() || String(Date.now()),
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        body,
        created_at: new Date().toISOString(),
        pending: false,
      },
    ]);

    setInput("");
    setSelectedFile(null);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <button style={styles.iconBtn} onClick={() => history.back()} aria-label="Back">
          ‹
        </button>

        <div style={styles.avatarWrap}>
          <img
            src={contact.avatar}
            alt=""
            style={styles.avatar}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <span style={styles.avatarFallback}>{initials(contact.name)}</span>
        </div>

        <div style={styles.headerText}>
          <div style={styles.name}>{contact.name}</div>
          <div style={styles.status}>
            <span style={styles.dot} />
            online <span style={styles.bullet}>•</span> {contact.role}
          </div>
        </div>

        <button
          style={styles.menuBtn}
          aria-label="Menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋮
        </button>

        {menuOpen && (
          <div style={styles.menu}>
            <button style={styles.menuItem}>View profile</button>
            <button style={styles.menuItem}>Mute chat</button>
            <button style={styles.menuItem}>Clear chat</button>
          </div>
        )}
      </header>

      <section style={styles.chat}>
        <div style={styles.bgDots} />

        {grouped.map((item) => {
          if (item.type === "date") {
            return (
              <div key={item.id} style={styles.dateRow}>
                <span style={styles.datePill}>{item.label}</span>
              </div>
            );
          }

          const mine = item.sender_id === currentUser.id;

          return (
            <div
              key={item.id}
              style={{
                ...styles.messageRow,
                justifyContent: mine ? "flex-end" : "flex-start",
              }}
            >
              {!mine && (
                <div style={styles.smallAvatarWrap}>
                  <img
                    src={contact.avatar}
                    alt=""
                    style={styles.smallAvatar}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <span style={styles.smallAvatarFallback}>{initials(contact.name)}</span>
                </div>
              )}

              <div
                style={{
                  ...styles.bubble,
                  ...(mine ? styles.bubbleMine : styles.bubbleOther),
                }}
              >
                {!mine && <div style={styles.senderName}>{item.sender_name}</div>}
                <div style={styles.messageText}>{item.body}</div>
                <div
                  style={{
                    ...styles.time,
                    color: mine ? "rgba(0,0,0,.55)" : "#aeb0b5",
                  }}
                >
                  {timeLabel(item.created_at)} {mine && <span style={styles.checks}>✓✓</span>}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </section>

      <footer style={styles.composerWrap}>
        {selectedFile && (
          <div style={styles.filePreview}>
            <span style={styles.fileName}>📎 {selectedFile.name}</span>
            <button style={styles.fileRemove} onClick={() => setSelectedFile(null)}>
              ×
            </button>
          </div>
        )}

        <div style={styles.composer}>
          <button
            style={styles.plusBtn}
            aria-label="Add attachment"
            onClick={() => fileRef.current?.click()}
          >
            +
          </button>

          <input
            ref={fileRef}
            type="file"
            style={{ display: "none" }}
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          />

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message"
            style={styles.input}
          />

          <button
            style={{
              ...styles.sendBtn,
              opacity: canSend ? 1 : 0.55,
            }}
            disabled={!canSend}
            onClick={sendMessage}
            aria-label="Send message"
          >
            ➤
          </button>
        </div>
      </footer>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100dvh",
    width: "100%",
    background: DARK_BG,
    color: TEXT,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  header: {
    height: 78,
    minHeight: 78,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "rgba(5,5,5,.96)",
    borderBottom: "1px solid rgba(255,255,255,.08)",
    position: "sticky",
    top: 0,
    zIndex: 20,
    boxSizing: "border-box",
  },

  iconBtn: {
    width: 34,
    height: 44,
    border: "none",
    background: "transparent",
    color: ENDURANCE_YELLOW,
    fontSize: 42,
    lineHeight: "32px",
    fontWeight: 800,
    cursor: "pointer",
    padding: 0,
  },

  avatarWrap: {
    width: 56,
    height: 56,
    minWidth: 56,
    borderRadius: "50%",
    border: `3px solid ${ENDURANCE_YELLOW}`,
    overflow: "hidden",
    position: "relative",
    background: PANEL_2,
  },

  avatar: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    position: "relative",
    zIndex: 2,
  },

  avatarFallback: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    color: ENDURANCE_YELLOW,
    fontWeight: 900,
    fontSize: 16,
  },

  headerText: {
    minWidth: 0,
    flex: 1,
  },

  name: {
    fontSize: 22,
    lineHeight: "25px",
    fontWeight: 900,
    color: "#fff",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  status: {
    marginTop: 2,
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: ENDURANCE_YELLOW,
    fontSize: 15,
    lineHeight: "18px",
    fontWeight: 800,
  },

  dot: {
    width: 11,
    height: 11,
    borderRadius: "50%",
    background: ENDURANCE_YELLOW,
    display: "inline-block",
  },

  bullet: {
    color: ENDURANCE_YELLOW,
    opacity: 0.9,
  },

  menuBtn: {
    width: 36,
    height: 46,
    border: "none",
    background: "transparent",
    color: ENDURANCE_YELLOW,
    fontSize: 34,
    lineHeight: "34px",
    fontWeight: 900,
    cursor: "pointer",
  },

  menu: {
    position: "absolute",
    right: 10,
    top: 66,
    width: 170,
    borderRadius: 14,
    overflow: "hidden",
    background: "#1f2024",
    boxShadow: "0 16px 40px rgba(0,0,0,.45)",
    border: "1px solid rgba(255,255,255,.08)",
    zIndex: 40,
  },

  menuItem: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: TEXT,
    textAlign: "left",
    padding: "13px 15px",
    fontSize: 14,
  },

  chat: {
    position: "relative",
    flex: 1,
    overflowY: "auto",
    padding: "22px 12px 118px",
    boxSizing: "border-box",
    background:
      "radial-gradient(circle at 20% 10%, rgba(234,255,0,.035), transparent 26%), radial-gradient(circle at 80% 0%, rgba(234,255,0,.025), transparent 22%), #020202",
  },

  bgDots: {
    pointerEvents: "none",
    position: "fixed",
    inset: 0,
    opacity: 0.16,
    backgroundImage:
      "radial-gradient(rgba(255,255,255,.28) 1px, transparent 1px)",
    backgroundSize: "28px 28px",
    zIndex: 0,
  },

  dateRow: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "center",
    margin: "12px 0 18px",
  },

  datePill: {
    background: "#26272b",
    color: "#d2d2d2",
    borderRadius: 999,
    padding: "8px 15px",
    fontSize: 14,
    fontWeight: 900,
    boxShadow: "0 3px 10px rgba(0,0,0,.28)",
  },

  messageRow: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    margin: "7px 0",
  },

  smallAvatarWrap: {
    width: 34,
    height: 34,
    minWidth: 34,
    borderRadius: "50%",
    overflow: "hidden",
    position: "relative",
    background: PANEL_2,
    marginBottom: 1,
  },

  smallAvatar: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    position: "relative",
    zIndex: 2,
  },

  smallAvatarFallback: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    color: ENDURANCE_YELLOW,
    fontSize: 10,
    fontWeight: 900,
  },

  bubble: {
    maxWidth: "76%",
    minWidth: 78,
    padding: "11px 12px 7px",
    borderRadius: 18,
    boxShadow: "0 4px 12px rgba(0,0,0,.28)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    boxSizing: "border-box",
  },

  bubbleMine: {
    background: ENDURANCE_YELLOW,
    color: "#111",
    borderBottomRightRadius: 5,
  },

  bubbleOther: {
    background: "linear-gradient(180deg, #202126, #17181c)",
    color: "#f4f4f4",
    border: "1px solid rgba(255,255,255,.055)",
    borderBottomLeftRadius: 5,
  },

  senderName: {
    color: ENDURANCE_YELLOW,
    fontSize: 13,
    lineHeight: "16px",
    fontWeight: 900,
    marginBottom: 5,
  },

  messageText: {
    fontSize: 22,
    lineHeight: "27px",
    letterSpacing: "-.2px",
  },

  time: {
    marginTop: 2,
    textAlign: "right",
    fontSize: 12,
    lineHeight: "14px",
    fontWeight: 900,
  },

  checks: {
    marginLeft: 4,
    fontSize: 13,
    fontWeight: 900,
  },

  composerWrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    padding: "7px 8px calc(8px + env(safe-area-inset-bottom))",
    background:
      "linear-gradient(180deg, rgba(2,2,2,0), rgba(2,2,2,.92) 18%, rgba(2,2,2,.98))",
    boxSizing: "border-box",
  },

  filePreview: {
    margin: "0 0 6px 48px",
    maxWidth: "calc(100% - 60px)",
    minHeight: 34,
    borderRadius: 16,
    background: "#202126",
    border: "1px solid rgba(255,255,255,.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 8px 6px 12px",
    boxSizing: "border-box",
  },

  fileName: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "#eee",
    fontSize: 13,
    fontWeight: 700,
  },

  fileRemove: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "none",
    background: "rgba(255,255,255,.12)",
    color: "#fff",
    fontSize: 18,
    lineHeight: "20px",
  },

  composer: {
    display: "flex",
    alignItems: "flex-end",
    gap: 7,
    width: "100%",
    boxSizing: "border-box",
  },

  plusBtn: {
    width: 40,
    height: 40,
    minWidth: 40,
    borderRadius: "50%",
    border: "none",
    background: "#202126",
    color: ENDURANCE_YELLOW,
    fontSize: 30,
    lineHeight: "35px",
    fontWeight: 500,
    display: "grid",
    placeItems: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,.35)",
  },

  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    resize: "none",
    border: "none",
    outline: "none",
    borderRadius: 22,
    background: "#202126",
    color: "#fff",
    fontSize: 17,
    lineHeight: "22px",
    padding: "9px 14px",
    boxSizing: "border-box",
    fontFamily: "inherit",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)",
  },

  sendBtn: {
    width: 40,
    height: 40,
    minWidth: 40,
    borderRadius: "50%",
    border: "none",
    background: ENDURANCE_YELLOW,
    color: "#111",
    fontSize: 20,
    lineHeight: "20px",
    fontWeight: 900,
    display: "grid",
    placeItems: "center",
    transform: "rotate(-35deg)",
    boxShadow: "0 2px 10px rgba(234,255,0,.22)",
  },
};
