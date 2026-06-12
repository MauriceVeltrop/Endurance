// components/trainings/TrainingCard.js
"use client";

import Link from "next/link";
import TrainingParticipants from "./TrainingParticipants";
import { getTrainingHeroImage } from "../../lib/sportImages";

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

function sportLabel(training) {
  const sport = firstSport(training);
  if (!sport) return "Training";
  return String(sport).replaceAll("_", " ");
}

function sportIcon(training) {
  const sport = String(firstSport(training) || "running");
  if (sport === "running") return "🏃";
  if (sport === "trail_running") return "△";
  if (sport.includes("cycling")) return "🚴";
  if (sport === "mountain_biking") return "🚵";
  if (sport === "walking") return "🚶";
  if (sport === "strength_training") return "🏋";
  return "✦";
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

export default function TrainingCard({ training, participants = [] }) {
  if (!training) return null;

  const href = `/trainings/${training.id}`;
  const sportId = String(firstSport(training) || "running").trim();
  const heroImage = getTrainingHeroImage(training, sportId);
  const image = heroImage.src;
  const flexible = training.planning_type === "flexible";
  const limited =
    training.max_participants && participants.length >= Math.max(1, training.max_participants - 2);

  return (
    <article className="training-card visual-training-card compact-training-card endurance-list-card endurance-training-card training-card-portrait-left">
      <Link href={href} className="training-card-media visual-training-media compact-training-media endurance-list-card-media endurance-card-media-portrait" aria-label={training.title}>
        {image ? (
          <img
            src={image}
            alt=""
            style={{ objectPosition: heroImage.position || "center center" }}
          />
        ) : (
          <div className="training-card-fallback visual-route-fallback">ENDURANCE</div>
        )}
        
      </Link>

      <div className="training-card-body visual-training-body compact-training-body">
        <div className="visual-card-topline">
          <span className="visual-sport-icon">{sportIcon(training)}</span>
          <span className={limited ? "visual-status limited participant-count-pill" : "visual-status participant-count-pill"}>
            👥 {participants.length}{training.max_participants ? `/${training.max_participants}` : ""}
          </span>
        </div>

        <Link href={href} className="training-card-title visual-training-title">
          {training.title || "Training Session"}
        </Link>

        {distanceLine(training) ? (
          <div className="visual-distance-line">{distanceLine(training)}</div>
        ) : null}

        <div className="training-card-meta visual-training-meta compact-training-meta">
          {training.start_location && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(training.start_location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="training-location-link"
              onClick={(event) => event.stopPropagation()}
            >
              ⌖ {training.start_location}
            </a>
          )}
          <span>◷ {formatDate(training)}{participants.length ? ` • ${participants.length}${training.max_participants ? ` / ${training.max_participants}` : ""} deelnemers` : ""}</span>
        </div>

        <div className="visual-card-bottom compact-card-bottom">
          <TrainingParticipants participants={participants} maxParticipants={training.max_participants} />
          <Link href={href} className="primary-action visual-join-button compact-join-button compacter">
            {flexible ? "Respond" : "Join"}
          </Link>
        </div>
      </div>
    </article>
  );
}
