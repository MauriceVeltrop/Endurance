import { supabase } from "./supabase";

export async function fetchNotifications(userId, limit = 50) {
  if (!userId) return [];

  const { data, error } = await supabase
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
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("Notifications fetch failed", error);
    return [];
  }

  return data || [];
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
    console.warn("Training invites fetch failed", error);
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

export async function markAllNotificationsRead(userId) {
  if (!userId) return { error: null };

  return supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
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
