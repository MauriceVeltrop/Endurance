'use client';

import React from 'react';

const LIME = '#e6ff00';

function normalizeSport(sport) {
  const raw = String(sport || '').trim().toLowerCase();

  if (!raw) return null;
  if (raw.includes('trail')) return 'Trail Running';
  if (raw.includes('road') && raw.includes('cycling')) return 'Road Cycling';
  if (raw.includes('gravel')) return 'Gravel Cycling';
  if (raw.includes('mountain') || raw.includes('mtb')) return 'Mountain Biking';
  if (raw.includes('cycling') || raw === 'bike' || raw === 'biking') return 'Road Cycling';
  if (raw.includes('running') || raw === 'run') return 'Running';
  if (raw.includes('walking') || raw === 'walk') return 'Walking';
  if (raw.includes('swimming') || raw === 'swim') return 'Swimming';
  if (raw.includes('padel')) return 'Padel';
  if (raw.includes('kayak')) return 'Kayak';

  return sport
    .toString()
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanSports(sports = []) {
  const list = Array.isArray(sports) ? sports : [sports];

  return [...new Set(list.map(normalizeSport).filter(Boolean))];
}

function getSportBackground(sports = []) {
  const clean = cleanSports(sports).join(' ').toLowerCase();

  if (clean.includes('trail')) return '/images/trailrunner-bg.svg';
  if (clean.includes('running')) return '/images/runner-bg.svg';
  if (clean.includes('gravel') || clean.includes('mountain')) return '/images/gravel-mtb-bg.svg';
  if (clean.includes('cycling')) return '/images/roadcycling-bg.svg';

  return null;
}

function formatDate(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return date;
  }
}

function formatTime(time) {
  if (!time) return '';
  return String(time).slice(0, 5);
}

function formatDistance(event) {
  const value = event?.route_distance_km ?? event?.distance;
  if (value === undefined || value === null || value === '') return null;

  const n = Number(value);
  if (Number.isNaN(n)) return String(value);

  return `${n.toFixed(n % 1 === 0 ? 0 : 2)} km`;
}

function openMaps(location) {
  if (!location) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function EventCard({
  event,
  currentUser,
  onLike,
  onJoin,
  onOpen,
  onComment,
  comments = [],
  likesCount = 0,
  participantsCount = 0,
}) {
  const sports = cleanSports(event?.sports || []);
  const sportBackground = getSportBackground(event?.sports || []);
  const distance = formatDistance(event);
  const elevation = event?.elevation_gain_m;
  const organizerName =
    event?.creator?.name ||
    event?.profile?.name ||
    event?.organizer_name ||
    event?.creator_name ||
    'Endurance';
  const organizerAvatar =
    event?.creator?.avatar_url ||
    event?.profile?.avatar_url ||
    event?.organizer_avatar_url ||
    null;

  const [commentText, setCommentText] = React.useState('');

  const submitComment = () => {
    const text = commentText.trim();
    if (!text || !onComment) return;
    onComment(event, text);
    setCommentText('');
  };

  return (
    <article
      onClick={onOpen ? () => onOpen(event) : undefined}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 30,
        padding: 22,
        minHeight: 430,
        background:
          'radial-gradient(circle at 82% 30%, rgba(230,255,0,0.22), transparent 38%), linear-gradient(180deg, rgba(22,22,22,0.98), rgba(4,4,4,0.98))',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 24px 70px rgba(0,0,0,0.70)',
        color: '#fff',
        cursor: onOpen ? 'pointer' : 'default',
        isolation: 'isolate',
      }}
    >
      {sportBackground && (
        <img
          src={sportBackground}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: '-34px',
            top: 30,
            width: '118%',
            maxWidth: 560,
            height: 'auto',
            opacity: 0.48,
            zIndex: 0,
            pointerEvents: 'none',
            filter: 'drop-shadow(0 0 42px rgba(230,255,0,0.50))',
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background:
            'linear-gradient(90deg, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.62) 48%, rgba(0,0,0,0.38) 100%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 2 }}>
        <div
          style={{
            color: LIME,
            fontWeight: 900,
            fontSize: 16,
            lineHeight: 1.25,
            marginBottom: 14,
            textShadow: '0 0 20px rgba(230,255,0,0.35)',
            wordBreak: 'normal',
            overflowWrap: 'break-word',
          }}
        >
          {sports.length ? sports.join(' • ') : 'Endurance'}
        </div>

        <h2
          style={{
            margin: '0 0 18px 0',
            fontSize: 'clamp(30px, 8vw, 46px)',
            lineHeight: 0.98,
            fontWeight: 950,
            letterSpacing: '-1.6px',
            maxWidth: 470,
            textWrap: 'balance',
          }}
        >
          {event?.title || 'Untitled Event'}
        </h2>

        {event?.location && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openMaps(event.location);
            }}
            style={{
              width: '100%',
              maxWidth: 470,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              textAlign: 'left',
              color: '#fff',
              padding: '14px 16px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(255,255,255,0.10)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
              fontSize: 18,
              fontWeight: 800,
              lineHeight: 1.15,
              marginBottom: 18,
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              whiteSpace: 'normal',
              overflowWrap: 'break-word',
            }}
          >
            <span aria-hidden="true">📍</span>
            <span style={{ flex: 1 }}>{event.location}</span>
            <span aria-hidden="true">↗</span>
          </button>
        )}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          {distance && (
            <div
              style={{
                padding: '12px 18px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.12)',
                fontSize: 22,
                fontWeight: 950,
                lineHeight: 1.05,
              }}
            >
              {distance}
            </div>
          )}

          {!!elevation && Number(elevation) > 0 && (
            <div
              style={{
                padding: '12px 18px',
                borderRadius: 999,
                background: 'rgba(230,255,0,0.12)',
                border: '1px solid rgba(230,255,0,0.22)',
                color: LIME,
                fontSize: 18,
                fontWeight: 900,
                lineHeight: 1.05,
              }}
            >
              ↗ {elevation} m
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: 14,
            maxWidth: 470,
            background: 'linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0.12))',
            borderRadius: 22,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: '50%',
              overflow: 'hidden',
              background: LIME,
              border: `3px solid ${LIME}`,
              flex: '0 0 auto',
            }}
          >
            {organizerAvatar ? (
              <img
                src={organizerAvatar}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#000',
                  fontWeight: 950,
                  fontSize: 24,
                }}
              >
                {organizerName.slice(0, 1)}
              </div>
            )}
          </div>

          <div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 800 }}>
              Organized by
            </div>
            <div style={{ color: LIME, fontSize: 22, fontWeight: 950, lineHeight: 1.05 }}>
              {organizerName}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 18,
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: 22,
            fontWeight: 900,
            marginBottom: 22,
          }}
        >
          {event?.date && <span>📅 {formatDate(event.date)}</span>}
          {event?.time && <span>⏰ {formatTime(event.time)}</span>}
        </div>

        <section
          style={{
            maxWidth: 470,
            borderRadius: 24,
            background: 'rgba(0,0,0,0.48)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: 18,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 21, fontWeight: 950, marginBottom: 8 }}>Participants</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 18 }}>
            {participantsCount > 0 ? `${participantsCount} participant${participantsCount === 1 ? '' : 's'}` : 'No participants yet'}
          </div>
        </section>

        <section
          style={{
            maxWidth: 470,
            borderRadius: 24,
            background: 'rgba(0,0,0,0.48)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: 18,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 21, fontWeight: 950, marginBottom: 8 }}>Description</div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 18, margin: 0, lineHeight: 1.35 }}>
            {event?.description || 'No description added yet.'}
          </p>
        </section>

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
            maxWidth: 470,
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLike?.(event);
            }}
            style={{
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.11)',
              color: '#fff',
              borderRadius: 18,
              padding: '12px 18px',
              fontSize: 18,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            🤍 Like
          </button>

          <span style={{ color: 'rgba(255,255,255,0.70)', fontSize: 18, fontWeight: 800 }}>
            {likesCount} likes
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onJoin?.(event);
            }}
            style={{
              marginLeft: 'auto',
              border: 0,
              background: LIME,
              color: '#000',
              borderRadius: 18,
              padding: '12px 18px',
              fontSize: 18,
              fontWeight: 950,
              cursor: 'pointer',
            }}
          >
            Join Event
          </button>
        </div>

        {onComment && (
          <section
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 470,
              marginTop: 18,
              borderRadius: 24,
              background: 'rgba(0,0,0,0.48)',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: 18,
            }}
          >
            <div style={{ fontSize: 21, fontWeight: 950, marginBottom: 10 }}>Comments</div>

            {comments?.length ? (
              <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                {comments.slice(0, 3).map((comment) => (
                  <div key={comment.id} style={{ color: 'rgba(255,255,255,0.76)', lineHeight: 1.35 }}>
                    {comment.text}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 12 }}>
                No comments yet.
              </div>
            )}

            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={`Commenting as ${currentUser?.name || 'Endurance'}...`}
              rows={3}
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                padding: 14,
                fontSize: 16,
                outline: 'none',
                marginBottom: 10,
              }}
            />

            <button
              type="button"
              onClick={submitComment}
              style={{
                width: '100%',
                border: 0,
                background: LIME,
                color: '#000',
                borderRadius: 16,
                padding: 13,
                fontSize: 17,
                fontWeight: 950,
                cursor: 'pointer',
              }}
            >
              Post Comment
            </button>
          </section>
        )}
      </div>
    </article>
  );
}
