import { supabase } from "./supabase";

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
  actorId = null,
  type,
  title,
  body = "",
  entityType = null,
  entityId = null,
  sessionId = null,
  actionUrl = null,
  metadata = {},
}) {
  if (!userId || !type || !title) {
    return { data: null, error: null };
  }

  const normalizedEntityType = entityType || (sessionId ? "training_session" : null);
  const normalizedEntityId = entityId || sessionId || null;

  const { data, error } = await supabase.rpc("create_notification", {
    p_user_id: userId,
    p_actor_id: actorId,
    p_type: type,
    p_title: title,
    p_body: body || "",
    p_entity_type: normalizedEntityType,
    p_entity_id: normalizedEntityId,
    p_metadata: {
      ...(metadata || {}),
      ...(actionUrl ? { action_url: actionUrl } : {}),
    },
  });

  if (error) {
    console.warn("Notification skipped:", error.message);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function createNotificationsForUsers(userIds = [], notification) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const results = [];

  for (const userId of uniqueIds) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await createNotification({ ...notification, userId }));
  }

  return results;
}

export async function fetchNotifications(arg, maybeLimit = 50) {
  let userId = null;
  let limit = maybeLimit;
  let returnObject = false;

  if (typeof arg === "string") {
    userId = arg;
  } else if (arg && typeof arg === "object") {
    userId = arg.userId || null;
    limit = arg.limit || 50;
    returnObject = true;
  }

  let query = supabase
    .from("notifications")
    .select(`
      *,
      actor:actor_id (
        id,
        name,
        first_name,
        last_name,
        avatar_url
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("Notifications fetch failed:", error.message);
    return returnObject ? { data: [], error } : [];
  }

  return returnObject ? { data: data || [], error: null } : data || [];
}

export async function fetchPendingTrainingInvites(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("training_invites")
    .select(`
      id,
      session_id,
      inviter_id,
      invitee_id,
      status,
      response_note,
      created_at,
      session:session_id (
        id,
        title,
        sports,
        planning_type,
        starts_at,
        final_starts_at,
        flexible_date,
        flexible_start_time,
        flexible_end_time,
        start_location,
        distance_km
      ),
      inviter:inviter_id (
        id,
        name,
        first_name,
        last_name,
        avatar_url
      )
    `)
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Training invites fetch failed:", error.message);
    return [];
  }

  return data || [];
}

export async function acceptTrainingInvite(invite, userId) {
  if (!invite?.id || !invite?.session_id || !userId) return { error: null };

  const { error: updateError } = await supabase
    .from("training_invites")
    .update({ status: "accepted" })
    .eq("id", invite.id)
    .eq("invitee_id", userId);

  if (updateError) return { error: updateError };

  const { error: participantError } = await supabase
    .from("session_participants")
    .upsert(
      {
        session_id: invite.session_id,
        user_id: userId,
      },
      { onConflict: "session_id,user_id" }
    );

  return { error: participantError };
}

export async function declineTrainingInvite(invite, userId) {
  if (!invite?.id || !userId) return { error: null };

  return supabase
    .from("training_invites")
    .update({ status: "declined" })
    .eq("id", invite.id)
    .eq("invitee_id", userId);
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) return { error: null };

  return supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
}

export async function markAllNotificationsRead(userId = null) {
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  return query;
}

export function subscribeToNotifications(userId, callback) {
  if (!userId || typeof callback !== "function") return null;

  return supabase
    .channel(`notifications-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      callback
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "training_invites",
        filter: `invitee_id=eq.${userId}`,
      },
      callback
    )
    .subscribe();
}
