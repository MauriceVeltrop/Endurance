// components/trainings/TrainingCard.js
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getTrainingHeroImage } from "../../lib/sportImages";
import { supabase } from "../../lib/supabase";

let currentUserPromise = null;

function getCurrentUserId() {
  if (!currentUserPromise) {
    currentUserPromise = supabase.auth
      .getUser()
      .then(({ data }) => data?.user?.id || "")
      .catch(() => "");
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

export default function TrainingCard({ training, participants = [] }) {
  const [currentUserId, setCurrentUserId] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [hasLeft, setHasLeft] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentUserId().then((id) => {
      if (!cancelled) setCurrentUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isParticipant = useMemo(() => {
    if (!currentUserId || hasLeft) return false;
    return participants.some((participant) => String(participant?.user_id) === String(currentUserId));
  }, [participants, currentUserId, hasLeft]);

  if (!training) return null;

  const href = `/trainings/${training.id}`;
  const sportId = String(firstSport(training) || "running").trim();
  const heroImage = getTrainingHeroImage(training, sportId);
  const image = heroImage.src;
  const flexible = training.planning_type === "flexible";
  const summary = distanceLine(training);
  const displayedParticipantCount = Math.max(0, participants.length - (hasLeft ? 1 : 0));
  const participantText = `${displayedParticipantCount}${training.max_participants ? `/${training.max_participants}` : ""}`;
  const makerName = creatorName(training);
  const makerId = creatorId(training);

  async function leaveTraining() {
    if (!currentUserId || leaving) return;

    try {
      setLeaving(true);
      const { error } = await supabase
        .from("session_participants")
        .delete()
        .eq("session_id", training.id)
        .eq("user_id", currentUserId);

      if (error) throw error;
      setHasLeft(true);
    } catch (error) {
      console.error("Could not leave training", error);
      window.alert("Leaving the training failed. Please try again.");
    } finally {
      setLeaving(false);
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
              disabled={leaving}
            >
              {leaving ? "Leaving..." : "Leave"}
            </button>
          ) : (
            <Link href={href} className="endurance-training-card-v3-button">
              {flexible ? "Respond" : "Join"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
