import { supabase } from "@/lib/supabase";

export const NOTIFICATION_TYPES = {
  TRAINING_INVITE: "training_invite",
  TRAINING_JOINED: "training_joined",
  TRAINING_LEFT: "training_left",
  FINAL_TIME_SET: "final_time_set",
  AVAILABILITY_RESPONSE: "availability_response",
  TEAM_REQUEST: "team_request",
  TEAM_REQUEST_ACCEPTED: "team_request_accepted",
  ROUTE_ATTACHED: "route_attached",
  WORKOUT_ATTACHED: "workout_attached",
  MESSAGE: "message",
  SYSTEM: "system",
};

export function trainingUrl(sessionId) {
  return sessionId ? `/trainings/${sessionId}` : "/trainings";
}

export async function createNotification({
  userId,
  actorId,
  type,
  sessionId = null,
  title,
  body = "",
  actionUrl = null,
  metadata = {},
}) {
  if (!userId || !type || !title) return { data: null, error: null };

  const payload = {
    p_user_id: userId,
    p_actor_id: actorId || null,
    p_type: type,
    p_session_id: sessionId,
    p_title: title,
    p_body: body || "",
    p_action_url: actionUrl,
    p_metadata: metadata || {},
  };

  const { data, error } = await supabase.rpc("create_notification", payload);

  // Notifications should never break core training flows.
  if (error) {
    console.warn("Notification skipped:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function createNotificationsForUsers(users = [], notification) {
  const uniqueUsers = [...new Set(users)].filter(Boolean);
  const results = [];

  for (const userId of uniqueUsers) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await createNotification({ ...notification, userId }));
  }

  return results;
}

export async function fetchNotifications({ limit = 30 } = {}) {
  const { data, error } = await supabase
    .from("notifications")
    .select(`
      id,
      type,
      title,
      body,
      action_url,
      read_at,
      created_at,
      session_id,
      metadata,
      actor:actor_id (
        id,
        name,
        avatar_url
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  return { data: data || [], error };
}

export async function markNotificationRead(id) {
  if (!id) return { error: null };
  return supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markAllNotificationsRead() {
  return supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
}
