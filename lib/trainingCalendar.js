"use client";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toIcsDate(value) {
  const date = new Date(value);
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

function escapeIcsText(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;")
    .replaceAll("\n", "\\n");
}

export function getTrainingStart(training) {
  return training?.final_starts_at || training?.starts_at || null;
}

export function getTrainingEnd(training) {
  const start = getTrainingStart(training);
  if (!start) return null;

  const startDate = new Date(start);
  const durationMin = Number(training?.estimated_duration_min || 90);
  return new Date(startDate.getTime() + durationMin * 60 * 1000).toISOString();
}

export function makeTrainingIcs(training) {
  const start = getTrainingStart(training);
  const end = getTrainingEnd(training);

  if (!start || !end) {
    throw new Error("This training has no fixed start time yet.");
  }

  const title = escapeIcsText(training?.title || "Endurance Training");
  const description = escapeIcsText(training?.description || "Created with Endurance.");
  const location = escapeIcsText(training?.start_location || "");
  const uid = `${training?.id || Date.now()}@endu-rance.nl`;
  const now = toIcsDate(new Date().toISOString());

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Endurance//Training Sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    location ? `LOCATION:${location}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export function downloadTrainingIcs(training) {
  const content = makeTrainingIcs(training);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = `${String(training?.title || "endurance-training")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "endurance-training"}.ics`;

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
