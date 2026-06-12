// components/trainings/TrainingCard.js
"use client";

import Link from "next/link";
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

function sportIcon(training) {
  const sport = String(firstSport(training) || "running");
  if (sport === "running") return "🏃";
  if (sport === "trail_running") return "△";
  if (sport.includes("cycling")) return "🚴";
  if (sport === "mountain_biking") return "🚵";
  if (sport === "walking") return "🚶";
  if (sport === "strength_training") return "🏋";
  if (sport === "hyrox") return "🏆";
  if (sport === "crossfit") return "✦";
  if (sport === "bootcamp") return "◈";
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
  const summary = distanceLine(training);
  const participantText = `${participants.length}${training.max_participants ? `/${training.max_participants}` : ""}`;

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
          <span className="endurance-training-card-v3-icon">{sportIcon(training)}</span>
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
          <span>◷ {formatDate(training)}{participants.length ? ` • ${participants.length}${training.max_participants ? ` / ${training.max_participants}` : ""} deelnemers` : ""}</span>
        </div>

        <div className="endurance-training-card-v3-actions">
          <Link href={href} className="endurance-training-card-v3-button">
            {flexible ? "Respond" : "Join"}
          </Link>
        </div>
      </div>
    </article>
  );
}
