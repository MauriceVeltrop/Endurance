// components/trainings/TrainingCard.js
"use client";

import Link from "next/link";
import TrainingParticipants from "./TrainingParticipants";
import TrainingStats from "./TrainingStats";

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

function sportLabel(training) {
  const sport = Array.isArray(training?.sports) ? training.sports[0] : training?.sports;
  if (!sport) return "Training";
  return String(sport).replaceAll("_", " ");
}

export default function TrainingCard({ training, participants = [] }) {
  if (!training) return null;

  const href = `/trainings/${training.id}`;
  const image = training.teaser_photo_url;
  const flexible = training.planning_type === "flexible";

  return (
    <article className="training-card">
      <Link href={href} className="training-card-media" aria-label={training.title}>
        {image ? <img src={image} alt="" /> : <div className="training-card-fallback">ENDURANCE</div>}
      </Link>

      <div className="training-card-body">
        <div className="training-card-badges">
          <span className="sport-badge">{sportLabel(training)}</span>
          {flexible && <span className="status-badge">Flexible</span>}
          {training.visibility && <span className="status-badge">{training.visibility}</span>}
        </div>

        <Link href={href} className="training-card-title">
          {training.title || "Training Session"}
        </Link>

        <div className="training-card-meta">
          <span>🕒 {formatDate(training)}</span>
          {training.start_location && <span>📍 {training.start_location}</span>}
          {training.route_id && <span>◇ Route attached</span>}
          {training.workout_id && <span>✦ Workout attached</span>}
        </div>

        <TrainingParticipants participants={participants} maxParticipants={training.max_participants} />
        <TrainingStats training={training} />

        <div className="training-card-actions">
          <Link href={href} className="secondary-action">Open</Link>
          {flexible && <Link href={href} className="primary-action">Respond</Link>}
        </div>
      </div>
    </article>
  );
}
