import Link from "next/link";
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
        fontWeight: 900,
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
        padding: "8px 11px",
        borderRadius: 999,
        background: accent
          ? "rgba(228,239,22,0.13)"
          : "rgba(255,255,255,0.075)",
        border: accent
          ? "1px solid rgba(228,239,22,0.26)"
          : "1px solid rgba(255,255,255,0.14)",
        color: "white",
        fontWeight: 850,
        lineHeight: 1,
        fontSize: 15,
        whiteSpace: "nowrap",
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
    <div style={{ display: "flex", alignItems: "center" }}>
      {visible.map((person, index) => {
        const profile = person.user_profile || person;
        const name = profile?.name || profile?.email || "Unknown";
        const src = profile?.avatar_url || null;
        const profileId = person.user_id || profile?.id;

        return (
          <Link
            key={person.id || profileId || index}
            href={`/profile/${profileId}`}
            style={{
              marginLeft: index === 0 ? 0 : -10,
              textDecoration: "none",
              position: "relative",
              zIndex: visible.length - index,
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
            fontWeight: 900,
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

  return (
    <div
      key={event.id}
      style={{
        ...card,
        padding: 0,
        overflow: "hidden",
        position: "relative",
        borderRadius: 26,
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 18px 55px rgba(0,0,0,0.38)",
        scrollSnapAlign: "center",
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

      <div style={{ position: "relative", padding: 18 }}>
        <section
          style={{
            display: "grid",
            gap: 16,
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.065), rgba(255,255,255,0.02))",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            padding: 16,
          }}
        >
          <div style={{ textAlign: "left" }}>
            <div
              style={{
                color: "#e4ef16",
                fontSize: 14,
                fontWeight: 850,
                marginBottom: 8,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sportLabels.join(" • ")}
            </div>

            <h2
              style={{
                margin: "0 0 12px",
                color: "white",
                fontSize: 30,
                lineHeight: 1.05,
                letterSpacing: "-0.045em",
                textAlign: "left",
              }}
            >
              {event.title}
            </h2>

            <button
              onClick={() => openMaps(event.location)}
              style={{
                ...mapBtn,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                maxWidth: "100%",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.13)",
                borderRadius: 999,
                padding: "8px 11px",
                color: "rgba(255,255,255,0.92)",
                cursor: "pointer",
                textDecoration: "none",
                marginBottom: 12,
              }}
            >
              <span>📍</span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {event.location || "Location not set"}
              </span>
              <span>↗</span>
            </button>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "flex-start",
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
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
              paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.09)",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                minWidth: 0,
              }}
            >
              <Avatar src={creatorAvatar} name={creatorName} size={46} ring />

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: "rgba(255,255,255,0.52)",
                    fontSize: 13,
                    fontWeight: 750,
                  }}
                >
                  Organized by
                </div>

                <Link
                  href={`/profile/${event.creator_id}`}
                  style={{
                    ...profileLink,
                    color: "#e4ef16",
                    fontWeight: 900,
                    fontSize: 17,
                    textDecoration: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "block",
                    maxWidth: 180,
                  }}
                >
                  {creatorName}
                </Link>
              </div>
            </div>

            <div
              style={{
                color: "rgba(255,255,255,0.9)",
                fontWeight: 800,
                fontSize: 15,
                textAlign: "right",
                lineHeight: 1.7,
              }}
            >
              <div>📅 {formatDate(event.date)}</div>
              <div>⏰ {formatTime(event.time)}</div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  color: "rgba(255,255,255,0.52)",
                  fontSize: 13,
                  fontWeight: 750,
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
                fontWeight: 850,
                fontSize: 15,
                whiteSpace: "nowrap",
              }}
            >
              👥 {event.participants.length}
            </div>
          </div>
        </section>

        {hasRouteMap && (
          <section style={{ marginTop: 16 }}>
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

        <div style={{ ...communityBox, marginTop: 16 }}>
          <div style={communityTitle}>Description</div>

          <div style={communityText}>
            {event.description?.trim()
              ? event.description
              : "No description added yet."}
          </div>

          <div style={likeRow}>
            <button onClick={() => toggleLike(event)} style={likeBtn}>
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
                }}
              >
                <AvatarStack people={event.likes || []} max={4} size={28} />

                <div>
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
            onClick={() => toggleParticipation(event)}
            style={primaryBtnSmall}
          >
            {event.joinedByMe ? "Leave Event" : "Join Event"}
          </button>

          <button onClick={() => downloadIcs(event)} style={secondaryBtnSmall}>
            Add to Calendar
          </button>

          {(event.isOwner || isModerator) && (
            <button onClick={() => openEdit(event)} style={secondaryBtnSmall}>
              Edit
            </button>
          )}

          {(event.isOwner || isModerator) && (
            <button onClick={() => deleteEvent(event.id)} style={dangerBtnSmall}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
