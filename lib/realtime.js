import { supabase } from "./supabase";

export function subscribeToTrainingRealtime(sessionId, onChange) {
  if (!sessionId || typeof onChange !== "function") return null;

  const safeRefresh = () => {
    window.clearTimeout(subscribeToTrainingRealtime._timer);
    subscribeToTrainingRealtime._timer = window.setTimeout(() => {
      onChange();
    }, 250);
  };

  const channel = supabase
    .channel(`training-live-${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "training_sessions",
        filter: `id=eq.${sessionId}`,
      },
      safeRefresh
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "session_participants",
        filter: `session_id=eq.${sessionId}`,
      },
      safeRefresh
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "training_time_responses",
        filter: `session_id=eq.${sessionId}`,
      },
      safeRefresh
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "training_time_options",
        filter: `session_id=eq.${sessionId}`,
      },
      safeRefresh
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "training_invites",
        filter: `session_id=eq.${sessionId}`,
      },
      safeRefresh
    )
    .subscribe();

  return channel;
}

export function subscribeToInboxRealtime(userId, onChange) {
  if (!userId || typeof onChange !== "function") return null;

  const safeRefresh = () => {
    window.clearTimeout(subscribeToInboxRealtime._timer);
    subscribeToInboxRealtime._timer = window.setTimeout(() => {
      onChange();
    }, 250);
  };

  const channel = supabase
    .channel(`inbox-live-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "training_invites",
        filter: `invitee_id=eq.${userId}`,
      },
      safeRefresh
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "training_partners",
        filter: `addressee_id=eq.${userId}`,
      },
      safeRefresh
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      safeRefresh
    )
    .subscribe();

  return channel;
}

export function removeRealtimeChannel(channel) {
  if (!channel) return;
  try {
    supabase.removeChannel(channel);
  } catch (error) {
    console.warn("Realtime cleanup skipped:", error?.message || error);
  }
}
