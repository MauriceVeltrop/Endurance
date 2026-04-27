"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getSportLabels } from "../lib/sports";
import DetailRouteMap from "./DetailRouteMap";
import {
  btnRow,
  card,
  commentField,
  commentForm,
  commentHeader,
  commentItem,
  commentList,
  commentName,
  commentsWrap,
  commentTextStyle,
  commentUserLabel,
  communityBox,
  communityMuted,
  communityText,
  communityTitle,
  dangerBtnSmall,
  gpxActions,
  gpxLink,
  inlineProfileLink,
  likeBtn,
  likeCount,
  likeRow,
  likeUsers,
  mapBtn,
  miniDeleteBtn,
  primaryBtnSmall,
  profileLink,
  secondaryBtnSmall,
} from "../lib/enduranceStyles";

function initials(nameOrEmail = "?") {
  const clean = String(nameOrEmail).trim();

  if (!clean) return "?";

  const parts = clean
    .replace(/@.*/, "")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function AutoFitTitle({ children }) {
  const wrapRef = useRef(null);
  const textRef = useRef(null);
  const [fontSize, setFontSize] = useState(32);

  const fit = () => {
    const wrap = wrapRef.current;
    const text = textRef.current;

    if (!wrap || !text) return;

    const maxWidth = Math.max(0, wrap.clientWidth - 18);
    if (!maxWidth) return;

    let size = 32;
    const minSize = 13;

    text.style.fontSize = `${size}px`;
    text.style.letterSpacing = "-0.045em";

    while (size > minSize && text.scrollWidth > maxWidth) {
      size -= 0.5;
      text.style.fontSize = `${size}px`;
    }

    setFontSize(size);
  };

  useLayoutEffect(() => {
    fit();
  }, [children]);

  useEffect(() => {
    fit();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => fit())
        : null;

    if (wrapRef.current && resizeObserver) {
      resizeObserver.observe(wrapRef.current);
    }

    window.addEventListener("resize", fit);

    return () => {
      window.removeEventListener("resize", fit);
      resizeObserver?.disconnect();
    };
  }, [children]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        paddingRight: 10,
        boxSizing: "border-box",
      }}
    >
      <h2
        ref={textRef}
        style={{
          margin: "0 0 12px",
          color: "white",
          fontSize,
          lineHeight: 1.05,
          letterSpacing: "-0.045em",
          textAlign: "left",
          whiteSpace: "nowrap",
          overflow: "visible",
          display: "inline-block",
          fontWeight: 950,
          maxWidth: "none",
          transformOrigin: "left center",
        }}
      >
        {children}
      </h2>
    </div>
  );
}


function AutoFitLocation({ children }) {
  const wrapRef = useRef(null);
  const textRef = useRef(null);
  const [fontSize, setFontSize] = useState(17);

  const fit = () => {
    const wrap = wrapRef.current;
    const text = textRef.current;

    if (!wrap || !text) return;

    let size = 17;
    const minSize = 11;

    text.style.fontSize = `${size}px`;

    const maxHeight = 42;

    while (size > minSize && text.scrollHeight > maxHeight) {
      size -= 0.5;
      text.style.fontSize = `${size}px`;
    }

    setFontSize(size);
  };

  useLayoutEffect(() => {
    fit();
  }, [children]);

  useEffect(() => {
    fit();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => fit())
        : null;

    if (wrapRef.current && resizeObserver) {
      resizeObserver.observe(wrapRef.current);
    }

    window.addEventListener("resize", fit);

    return () => {
      window.removeEventListener("resize", fit);
      resizeObserver?.disconnect();
    };
  }, [children]);

  return (
    <span
      ref={wrapRef}
      style={{
        minWidth: 0,
        flex: "1 1 auto",
        maxWidth: "100%",
        overflow: "hidden",
        textAlign: "left",
        lineHeight: 1.15,
      }}
    >
      <span
        ref={textRef}
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          whiteSpace: "normal",
          wordBreak: "normal",
          overflowWrap: "break-word",
          fontSize,
          fontWeight: 650,
          lineHeight: 1.15,
        }}
      >
        {children}
      </span>
    </span>
  );
}



function normalizeSportId(sport) {
  return String(sport || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

function getEventSportBackground(event) {
  const sports = Array.isArray(event.sports)
    ? event.sports.map(normalizeSportId)
    : [];

  if (sports.includes("trail-running")) {
    return {
      image: "/images/trailrunner-bg.png",
      position: "right center",
      accent: "rgba(228,239,22,0.22)",
    };
  }

  if (
    sports.includes("crossfit") ||
    sports.includes("cross-fit") ||
    sports.includes("strength-training") ||
    sports.includes("strength") ||
    sports.includes("functional-fitness")
  ) {
    return {
      image: "/images/strength-bg.png",
      position: "right center",
      accent: "rgba(228,239,22,0.22)",
    };
  }

  if (
    sports.includes("mountain-biking") ||
    sports.includes("mtb") ||
    sports.includes("gravel-cycling") ||
    sports.includes("gravel-bike")
  ) {
    return {
      image: "/images/gravel-mtb-bg.png",
      position: "right center",
      accent: "rgba(228,239,22,0.20)",
    };
  }

  if (sports.includes("road-cycling") || sports.includes("cycling")) {
    return {
      image: "/images/roadcycling-bg.png",
      position: "right center",
      accent: "rgba(228,239,22,0.20)",
    };
  }

  if (sports.includes("walking")) {
    return {
      image: "/images/walking-bg.png",
      position: "right center",
      accent: "rgba(228,239,22,0.22)",
    };
  }

  if (sports.includes("running")) {
    return {
      image: "/images/runner-bg.png",
      position: "right center",
      accent: "rgba(228,239,22,0.22)",
    };
  }

  return null;
}

function Avatar({ src, name, size = 42, ring = false }) {
  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flex: "0 0 auto",
        display: "grid",
        placeItems: "center",
        background:
          "linear-gradient(135deg, rgba(228,239,22,0.95), rgba(255,255,255,0.15))",
        color: "#050505",
        fontWeight: 950,
        fontSize: Math.max(12, size * 0.32),
        border: ring
          ? "2px solid rgba(228,239,22,0.95)"
          : "1px solid rgba(255,255,255,0.25)",
        boxShadow: ring ? "0 0 18px rgba(228,239,22,0.22)" : "none",
      }}
    >
      {src ? (
        <img
          src={src}
          alt={name || "avatar"}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

function StatBadge({ icon, value, accent = false }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "9px 11px",
        borderRadius: 18,
        background: accent
          ? "rgba(228,239,22,0.13)"
          : "rgba(255,255,255,0.075)",
        border: accent
          ? "1px solid rgba(228,239,22,0.28)"
          : "1px solid rgba(255,255,255,0.14)",
        color: "white",
        fontWeight: 900,
        lineHeight: 1,
        fontSize: 15,
        whiteSpace: "nowrap",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <span style={{ color: accent ? "#e4ef16" : "rgba(255,255,255,0.8)" }}>
        {icon}
      </span>
      <span>{value}</span>
    </div>
  );
}

function AvatarStack({ people = [], max = 5, size = 34 }) {
  const visible = people.slice(0, max);
  const remaining = Math.max(0, people.length - visible.length);

  if (!people.length) {
    return (
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
        No participants yet
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      {visible.map((person, index) => {
        const userProfile = person.user_profile || person;
        const name = userProfile?.name || userProfile?.email || "Unknown";
        const src = userProfile?.avatar_url || null;
        const profileId = person.user_id || userProfile?.id;

        return (
          <Link
            key={person.id || profileId || index}
            href={`/profile/${profileId}`}
            style={{
              marginLeft: index === 0 ? 0 : -10,
              textDecoration: "none",
              position: "relative",
              zIndex: visible.length - index,
              flex: "0 0 auto",
            }}
          >
            <Avatar src={src} name={name} size={size} ring={index === 0} />
          </Link>
        );
      })}

      {remaining > 0 && (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            marginLeft: -10,
            background: "#242424",
            border: "1px solid rgba(255,255,255,0.35)",
            display: "grid",
            placeItems: "center",
            color: "white",
            fontSize: 13,
            fontWeight: 950,
            flex: "0 0 auto",
          }}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}

export default function EventCard({
  event,
  user,
  profile,
  isModerator,
  commentText,
  setCommentText,
  formatDate,
  formatTime,
  openMaps,
  toggleLike,
  toggleParticipation,
  postComment,
  deleteComment,
  downloadIcs,
  openEdit,
  deleteEvent,
  removeGpxFromEvent,
}) {
  const sportLabels = getSportLabels(event.sports || []);

  const hasRoutePoints =
    Array.isArray(event.route_points) && event.route_points.length > 1;

  const hasRouteMap = !!event.gpx_file_url || hasRoutePoints;

  const creatorName =
    event.creator_profile?.name || event.creator_profile?.email || "Unknown";

  const creatorAvatar = event.creator_profile?.avatar_url || null;
  const sportBackground = getEventSportBackground(event);

  return (
    <div
      key={event.id}
      style={{
        ...card,
        padding: 0,
        overflow: "hidden",
        position: "relative",
        borderRadius: 28,
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 18px 55px rgba(0,0,0,0.38)",
        scrollSnapAlign: "center",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 10% 0%, rgba(228,239,22,0.13), transparent 33%), radial-gradient(circle at 100% 10%, rgba(255,255,255,0.07), transparent 28%)",
        }}
      />

      <div style={{ position: "relative", padding: 18, boxSizing: "border-box" }}>
        <section
          style={{
            display: "grid",
            gap: 16,
            background:
              sportBackground
                ? "linear-gradient(135deg, rgba(10,10,10,0.82), rgba(10,10,10,0.44))"
                : "linear-gradient(135deg, rgba(255,255,255,0.065), rgba(255,255,255,0.02))",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            padding: "16px 18px 16px 16px",
            overflow: "hidden",
            minWidth: 0,
            maxWidth: "100%",
            boxSizing: "border-box",
            position: "relative",
            isolation: "isolate",
          }}
        >
          {sportBackground && (
            <>
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 0,
                  opacity: 1,
                  backgroundImage: `url('${sportBackground.image}')`,
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "cover",
                  backgroundPosition: sportBackground.position,
                  filter: "saturate(1.12) contrast(1.08)",
                  transform: "scale(1.01)",
                }}
              />

              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 0,
                  background:
                    `linear-gradient(90deg, rgba(5,5,5,0.98) 0%, rgba(5,5,5,0.90) 40%, rgba(5,5,5,0.58) 70%, rgba(5,5,5,0.25) 100%), radial-gradient(circle at 82% 30%, ${sportBackground.accent}, transparent 38%)`,
                }}
              />
            </>
          )}

          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "grid",
              gap: 16,
              minWidth: 0,
            }}
          >
          <div style={{ textAlign: "left", minWidth: 0, maxWidth: "100%" }}>
            <div
              style={{
                color: "#e4ef16",
                fontSize: 14,
                fontWeight: 900,
                marginBottom: 8,
                whiteSpace: "normal",
                wordBreak: "normal",
                overflowWrap: "break-word",
                lineHeight: 1.18,
                maxWidth: "100%",
              }}
            >
              {sportLabels.join(" • ")}
            </div>

            <AutoFitTitle>{event.title}</AutoFitTitle>

            <button
              type="button"
              onClick={() => openMaps(event.location)}
              style={{
                ...mapBtn,
                display: "inline-flex",
                alignItems: "flex-start",
                gap: 8,
                width: "calc(100% - 10px)",
                maxWidth: "calc(100% - 10px)",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.13)",
                borderRadius: 999,
                padding: "8px 11px",
                color: "rgba(255,255,255,0.92)",
                cursor: "pointer",
                textDecoration: "none",
                marginBottom: 12,
                minHeight: 48,
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <span style={{ flex: "0 0 auto", lineHeight: "22px" }}>📍</span>
              <AutoFitLocation>
                {event.location || "Location not set"}
              </AutoFitLocation>
              <span style={{ flex: "0 0 auto", lineHeight: "22px" }}>↗</span>
            </button>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "flex-start",
                maxWidth: "100%",
              }}
            >
              {event.distance ? (
                <StatBadge
                  icon="↝"
                  value={`${Number(event.distance).toFixed(2)} km`}
                />
              ) : null}

              {event.elevation_gain_m !== null &&
                event.elevation_gain_m !== undefined &&
                Number(event.elevation_gain_m) > 0 && (
                  <StatBadge
                    icon="▲"
                    value={`${Math.round(Number(event.elevation_gain_m))} m+`}
                    accent
                  />
                )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: 12,
              alignItems: "center",
              paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.09)",
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <Avatar src={creatorAvatar} name={creatorName} size={46} ring />

              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <div
                  style={{
                    color: "rgba(255,255,255,0.52)",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  Organized by
                </div>

                <Link
                  href={`/profile/${event.creator_id}`}
                  style={{
                    ...profileLink,
                    color: "#e4ef16",
                    fontWeight: 950,
                    fontSize: 17,
                    textDecoration: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "block",
                    maxWidth: "100%",
                  }}
                >
                  {creatorName}
                </Link>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                color: "rgba(255,255,255,0.9)",
                fontWeight: 850,
                fontSize: 15,
                lineHeight: 1.4,
              }}
            >
              <span>📅 {formatDate(event.date)}</span>
              <span>⏰ {formatTime(event.time)}</span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div
                style={{
                  color: "rgba(255,255,255,0.52)",
                  fontSize: 13,
                  fontWeight: 800,
                  marginBottom: 7,
                }}
              >
                Participants
              </div>

              <AvatarStack people={event.participants || []} />
            </div>

            <div
              style={{
                color: "rgba(255,255,255,0.82)",
                fontWeight: 900,
                fontSize: 15,
                whiteSpace: "nowrap",
              }}
            >
              👥 {event.participants.length}
            </div>
          </div>
          </div>
        </section>

        {hasRouteMap && (
          <section
            style={{
              marginTop: 16,
              overflow: "hidden",
              borderRadius: 22,
            }}
          >
            <DetailRouteMap
              gpxUrl={event.gpx_file_url}
              points={event.route_points}
            />
          </section>
        )}

        {event.gpx_file_url && (
          <div style={{ ...gpxActions, marginTop: 12 }}>
            <a
              href={event.gpx_file_url}
              target="_blank"
              rel="noreferrer"
              style={gpxLink}
            >
              Download GPX
            </a>

            {event.canRemoveGpx && (
              <button
                type="button"
                onClick={() => removeGpxFromEvent(event)}
                style={dangerBtnSmall}
              >
                Remove GPX
              </button>
            )}
          </div>
        )}

        <div style={{ ...communityBox, marginTop: 16, overflow: "hidden" }}>
          <div style={communityTitle}>Description</div>

          <div style={communityText}>
            {event.description?.trim()
              ? event.description
              : "No description added yet."}
          </div>

          <div style={likeRow}>
            <button type="button" onClick={() => toggleLike(event)} style={likeBtn}>
              {event.likedByMe ? "❤️ Liked" : "🤍 Like"}
            </button>

            <div style={likeCount}>
              {event.likes.length} like{event.likes.length === 1 ? "" : "s"}
            </div>

            {!!event.likes.length && (
              <div
                style={{
                  ...likeUsers,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  minWidth: 0,
                }}
              >
                <AvatarStack people={event.likes || []} max={4} size={28} />

                <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  {event.likes.map((like, index) => (
                    <span key={like.id}>
                      <Link
                        href={`/profile/${like.user_id}`}
                        style={inlineProfileLink}
                      >
                        {like.user_profile?.name || "Unknown"}
                      </Link>
                      {index < event.likes.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={commentsWrap}>
            <div style={communityTitle}>Comments</div>

            {event.comments.length ? (
              <div style={commentList}>
                {event.comments.map((comment) => (
                  <div key={comment.id} style={commentItem}>
                    <div style={commentHeader}>
                      <div style={commentName}>
                        <Link
                          href={`/profile/${comment.user_id}`}
                          style={inlineProfileLink}
                        >
                          {comment.user_profile?.name || "Unknown"}
                        </Link>
                      </div>

                      {(comment.user_id === user?.id || isModerator) && (
                        <button
                          type="button"
                          onClick={() => deleteComment(comment.id)}
                          style={miniDeleteBtn}
                        >
                          Delete
                        </button>
                      )}
                    </div>

                    <div style={commentTextStyle}>{comment.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={communityMuted}>No comments yet.</div>
            )}

            <div style={commentForm}>
              <div style={commentUserLabel}>
                Commenting as <strong>{profile?.name || user?.email}</strong>
              </div>

              <textarea
                value={commentText[event.id] || ""}
                onChange={(e) =>
                  setCommentText((prev) => ({
                    ...prev,
                    [event.id]: e.target.value,
                  }))
                }
                placeholder="Write a comment..."
                style={commentField}
              />

              <button
                type="button"
                onClick={() => postComment(event.id)}
                style={primaryBtnSmall}
              >
                Post Comment
              </button>
            </div>
          </div>
        </div>

        <div style={{ ...btnRow, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => toggleParticipation(event)}
            style={primaryBtnSmall}
          >
            {event.joinedByMe ? "Leave Event" : "Join Event"}
          </button>

          <button
            type="button"
            onClick={() => downloadIcs(event)}
            style={secondaryBtnSmall}
          >
            Add to Calendar
          </button>

          {(event.isOwner || isModerator) && (
            <button
              type="button"
              onClick={() => openEdit(event)}
              style={secondaryBtnSmall}
            >
              Edit
            </button>
          )}

          {(event.isOwner || isModerator) && (
            <button
              type="button"
              onClick={() => deleteEvent(event.id)}
              style={dangerBtnSmall}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
