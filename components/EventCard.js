import Link from "next/link";
import { getSportLabels } from "../lib/sports";
import DetailRouteMap from "./DetailRouteMap";
import {
  btnRow,
  card,
  cardTitle,
  chipLink,
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
  creatorText,
  dangerBtnSmall,
  distanceText,
  elevationText,
  gpxActions,
  gpxLink,
  inlineProfileLink,
  likeBtn,
  likeCount,
  likeRow,
  likeUsers,
  mapBtn,
  meta,
  miniDeleteBtn,
  primaryBtnSmall,
  profileLink,
  secondaryBtnSmall,
  sportTag,
} from "../lib/enduranceStyles";

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

  return (
    <div key={event.id} style={card}>
      <div style={sportTag}>{sportLabels.join(" • ")}</div>

      <h2 style={cardTitle}>{event.title}</h2>

      {event.distance ? (
        <div style={distanceText}>
          {Number(event.distance).toFixed(2)} km
        </div>
      ) : null}

      {event.elevation_gain_m !== null &&
        event.elevation_gain_m !== undefined &&
        Number(event.elevation_gain_m) > 0 && (
          <div style={elevationText}>
            ⛰ {Math.round(Number(event.elevation_gain_m))} m+
          </div>
        )}

      <div style={meta}>
        <div>📅 {formatDate(event.date)}</div>
        <div>⏰ {formatTime(event.time)}</div>

        <div style={creatorText}>
          👤 Created by{" "}
          <Link href={`/profile/${event.creator_id}`} style={profileLink}>
            {event.creator_profile?.name ||
              event.creator_profile?.email ||
              "Unknown"}
          </Link>
        </div>

        <button onClick={() => openMaps(event.location)} style={mapBtn}>
          📍 {event.location}
        </button>

        <div style={{ opacity: 0.75 }}>
          Participants: {event.participants.length}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {event.participants.map((participant) => (
            <Link
              key={participant.id}
              href={`/profile/${participant.user_id}`}
              style={chipLink}
            >
              {participant.user_profile?.name || "Unknown"}
            </Link>
          ))}
        </div>
      </div>

      {event.gpx_file_url && (
        <DetailRouteMap
          event={event}
          gpxUrl={event.gpx_file_url}
          height={240}
          showElevation={true}
        />
      )}

      {event.gpx_file_url && (
        <div style={gpxActions}>
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

      <div style={communityBox}>
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
            <div style={likeUsers}>
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

      <div style={btnRow}>
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
  );
          }
