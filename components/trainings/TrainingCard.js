// components/trainings/TrainingCard.js
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getTrainingHeroImage } from "../../lib/sportImages";
import { createNotification, NOTIFICATION_TYPES, trainingUrl } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";

let currentUserPromise = null;

function getCurrentUser() {
  if (!currentUserPromise) {
    currentUserPromise = supabase.auth
      .getUser()
      .then(({ data }) => data?.user || null)
      .catch(() => null);
  }
  return currentUserPromise;
}

function formatDate(training) {
  const value = training?.final_starts_at || training?.starts_at;
  if (value) {
    return new Intl.DateTimeFormat("nl-NL", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  if (training?.flexible_date) {
    const windowText =
      training?.flexible_start_time && training?.flexible_end_time
        ? ` · ${training.flexible_start_time.slice(0, 5)}–${training.flexible_end_time.slice(0, 5)}`
        : "";
    return `${training.flexible_date}${windowText}`;
  }

  return "Time to be decided";
}

function firstSport(training) {
  return Array.isArray(training?.sports) ? training.sports[0] : training?.sports;
}

function distanceLine(training) {
  const parts = [];

  if (training?.distance_km) {
    parts.push(`${Number(training.distance_km).toFixed(Number(training.distance_km) >= 10 ? 0 : 1)} km`);
  }

  if (training?.pace_min || training?.pace_max) {
    parts.push([training.pace_min, training.pace_max].filter(Boolean).join("–") + " /km");
  } else if (training?.speed_min || training?.speed_max) {
    const speed = [training.speed_min, training.speed_max].filter(Boolean).join("–");
    if (speed) parts.push(`${speed} km/h`);
  } else if (training?.intensity_label) {
    parts.push(training.intensity_label);
  }

  return parts.join(" • ");
}

function creatorName(training) {
  const creator = training?.creator || training?.profiles || training?.profile || {};
  const name =
    creator.name ||
    [creator.first_name, creator.last_name].filter(Boolean).join(" ") ||
    training?.creator_name ||
    "Endurance athlete";

  return name;
}

function creatorId(training) {
  return training?.creator?.id || training?.profiles?.id || training?.creator_id || null;
}

function currentUserName(user) {
  const metadata = user?.user_metadata || {};
  return (
    metadata.name ||
    [metadata.first_name, metadata.last_name].filter(Boolean).join(" ") ||
    user?.email ||
    "Someone"
  );
}

export default function TrainingCard({ training, participants = [] }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [participationBusy, setParticipationBusy] = useState(false);
  const [joinedLocally, setJoinedLocally] = useState(false);
  const [hasLeft, setHasLeft] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((user) => {
      if (!cancelled) setCurrentUser(user);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentUserId = currentUser?.id || "";

  const isParticipant = useMemo(() => {
    if (!currentUserId || hasLeft) return false;
    return (
      joinedLocally ||
      participants.some((participant) => String(participant?.user_id) === String(currentUserId))
    );
  }, [participants, currentUserId, joinedLocally, hasLeft]);

  if (!training) return null;

  const href = `/trainings/${training.id}`;
  const sportId = String(firstSport(training) || "running").trim();
  const heroImage = getTrainingHeroImage(training, sportId);
  const image = heroImage.src;
  const flexible = training.planning_type === "flexible";
  const summary = distanceLine(training);
  const originalParticipant = participants.some(
    (participant) => String(participant?.user_id) === String(currentUserId)
  );
  const displayedParticipantCount = Math.max(
    0,
    participants.length + (joinedLocally && !originalParticipant ? 1 : 0) - (hasLeft && originalParticipant ? 1 : 0)
  );
  const participantText = `${displayedParticipantCount}${training.max_participants ? `/${training.max_participants}` : ""}`;
  const makerName = creatorName(training);
  const makerId = creatorId(training);
  const isFull = Boolean(
    training.max_participants && displayedParticipantCount >= Number(training.max_participants)
  );

  async function joinTraining() {
    if (!currentUserId || participationBusy || flexible || isParticipant) return;

    if (isFull) {
      window.alert("This training is full.");
      return;
    }

    try {
      setParticipationBusy(true);

      const { error } = await supabase
        .from("session_participants")
        .upsert(
          {
            session_id: training.id,
            user_id: currentUserId,
          },
          {
            onConflict: "session_id,user_id",
            ignoreDuplicates: true,
          }
        );

      if (error) throw error;

      setHasLeft(false);
      setJoinedLocally(true);

      if (training.creator_id && training.creator_id !== currentUserId) {
        await createNotification({
          userId: training.creator_id,
          actorId: currentUserId,
          type: NOTIFICATION_TYPES.TRAINING_JOINED,
          sessionId: training.id,
          title: "Someone joined your training",
          body: `${currentUserName(currentUser)} joined ${training.title}.`,
          actionUrl: trainingUrl(training.id),
          metadata: { source: "training_feed_join" },
        });
      }
    } catch (error) {
      console.error("Could not join training", error);
      window.alert(error?.message || "Joining the training failed. Please try again.");
    } finally {
      setParticipationBusy(false);
    }
  }

  async function leaveTraining() {
    if (!currentUserId || participationBusy) return;

    try {
      setParticipationBusy(true);
      const { error } = await supabase
        .from("session_participants")
        .delete()
        .eq("session_id", training.id)
        .eq("user_id", currentUserId);

      if (error) throw error;

      setJoinedLocally(false);
      setHasLeft(true);

      if (training.creator_id && training.creator_id !== currentUserId) {
        await createNotification({
          userId: training.creator_id,
          actorId: currentUserId,
          type: NOTIFICATION_TYPES.TRAINING_LEFT,
          sessionId: training.id,
          title: "Someone left your training",
          body: `${currentUserName(currentUser)} left ${training.title}.`,
          actionUrl: trainingUrl(training.id),
          metadata: { source: "training_feed_leave" },
        });
      }
    } catch (error) {
      console.error("Could not leave training", error);
      window.alert("Leaving the training failed. Please try again.");
    } finally {
      setParticipationBusy(false);
    }
  }

  return (
    <article className="endurance-training-card-v3">
      <Link href={href} className="endurance-training-card-v3-photo" aria-label={training.title || "Open training"}>
        {image ? (
          <img
            src={image}
            alt=""
            style={{ objectPosition: heroImage.position || "center center" }}
          />
        ) : (
          <div className="endurance-training-card-v3-fallback">ENDURANCE</div>
        )}
      </Link>

      <div className="endurance-training-card-v3-content">
        <div className="endurance-training-card-v3-top">
          {makerId ? (
            <Link
              href={`/profile/${makerId}`}
              className="card-creator-link"
              onClick={(event) => event.stopPropagation()}
            >
              {makerName}
            </Link>
          ) : (
            <span className="card-creator-link">{makerName}</span>
          )}
          <span className="endurance-training-card-v3-count">👥 {participantText}</span>
        </div>

        <Link href={href} className="endurance-training-card-v3-title">
          {training.title || "Training Session"}
        </Link>

        {summary ? (
          <div className="endurance-training-card-v3-badge">{summary}</div>
        ) : null}

        <div className="endurance-training-card-v3-meta">
          {training.start_location && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(training.start_location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="endurance-training-card-v3-location"
              onClick={(event) => event.stopPropagation()}
            >
              ⌖ {training.start_location}
            </a>
          )}
          <span>◷ {formatDate(training)}{displayedParticipantCount ? ` • ${displayedParticipantCount}${training.max_participants ? ` / ${training.max_participants}` : ""} deelnemers` : ""}</span>
        </div>

        <div className="endurance-training-card-v3-actions">
          {isParticipant ? (
            <button
              type="button"
              className="endurance-training-card-v3-button"
              style={{
                background: "rgba(120,15,15,0.25)",
                color: "#ff8d8d",
                border: "1px solid rgba(255,90,90,0.50)",
                boxShadow: "none",
              }}
              onClick={leaveTraining}
              disabled={participationBusy}
            >
              {participationBusy ? "Leaving..." : "Leave"}
            </button>
          ) : flexible ? (
            <Link href={href} className="endurance-training-card-v3-button">
              Respond
            </Link>
          ) : (
            <button
              type="button"
              className="endurance-training-card-v3-button"
              onClick={joinTraining}
              disabled={participationBusy || isFull || !currentUserId}
            >
              {participationBusy ? "Joining..." : isFull ? "Full" : "Join"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
