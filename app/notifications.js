
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

export async function markNotificationRead(notificationId) {
  if (!notificationId) return;

  await supabase
    .from("notifications")
    .update({
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId);
}

export async function markAllNotificationsRead(userId) {
  if (!userId) return;

  await supabase
    .from("notifications")
    .update({
      read_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .is("read_at", null);
}

export function subscribeToNotifications(userId, callback) {
  if (!userId) return null;

  return supabase
    .channel(`notifications:${userId}`)
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
    .subscribe();
}
