import { supabase } from "./supabase";

function uniqueChannelName(prefix, id) {
  return `${prefix}-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createDebouncedRefresh(onChange) {
  let timer = null;

  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      onChange();
    }, 250);
  };
}

export function subscribeToTrainingRealtime(sessionId, onChange) {
  if (!sessionId || typeof onChange !== "function") return null;

  const safeRefresh = createDebouncedRefresh(onChange);

  // Important:
  // Do NOT reuse a channel topic here. The training detail page and PlanningPoll
  // can both subscribe to the same training. Supabase can throw:
  // "cannot add postgres_changes callbacks ... after subscribe()"
  // when callbacks are added to an already subscribed channel with the same topic.
  const channel = supabase.channel(uniqueChannelName("training-live", sessionId));

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "training_sessions",
      filter: `id=eq.${sessionId}`,
    },
    safeRefresh
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "session_participants",
      filter: `session_id=eq.${sessionId}`,
    },
    safeRefresh
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "training_time_responses",
      filter: `session_id=eq.${sessionId}`,
    },
    safeRefresh
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "training_time_options",
      filter: `session_id=eq.${sessionId}`,
    },
    safeRefresh
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "training_invites",
      filter: `session_id=eq.${sessionId}`,
    },
    safeRefresh
  );

  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR") {
      console.warn("Training realtime channel error.");
    }
  });

  return channel;
}

export function subscribeToInboxRealtime(userId, onChange) {
  if (!userId || typeof onChange !== "function") return null;

  const safeRefresh = createDebouncedRefresh(onChange);
  const channel = supabase.channel(uniqueChannelName("inbox-live", userId));

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "training_invites",
      filter: `invitee_id=eq.${userId}`,
    },
    safeRefresh
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "training_partners",
      filter: `addressee_id=eq.${userId}`,
    },
    safeRefresh
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "notifications",
      filter: `user_id=eq.${userId}`,
    },
    safeRefresh
  );

  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR") {
      console.warn("Inbox realtime channel error.");
    }
  });

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
