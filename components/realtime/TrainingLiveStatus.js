"use client";

import { useEffect, useState } from "react";

export default function TrainingLiveStatus({ participants = [], compact = false }) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), 900);
    return () => window.clearTimeout(timer);
  }, [participants.length]);

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-2 text-xs font-black text-lime-200 ${
        pulse ? "ring-2 ring-lime-300/40" : ""
      }`}
      title="Live training updates are enabled"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-300 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-lime-300" />
      </span>
      {compact ? "Live" : `${participants.length || 0} joined · live`}
    </div>
  );
}
