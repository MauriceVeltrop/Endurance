import { supabase } from "./supabase";

export const AUTH_TIMEOUT_MS = 6500;

export function withTimeout(promise, label = "Request", timeoutMs = AUTH_TIMEOUT_MS) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out. Check Supabase URL, anon key, network and RLS policies.`
        )
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function getCurrentUser() {
  const { data, error } = await withTimeout(
    supabase.auth.getUser(),
    "Checking auth session"
  );

  if (error) throw error;
  return data?.user || null;
}

export async function getProfile(
  userId,
  columns = "id,name,email,avatar_url,role,onboarding_completed,blocked"
) {
  if (!userId) return null;

  const { data, error } = await withTimeout(
    supabase.from("profiles").select(columns).eq("id", userId).maybeSingle(),
    "Loading profile"
  );

  if (error) throw error;
  return data || null;
}

export function getNextAuthPath(profile) {
  if (profile?.blocked) return "/login?blocked=1";
  if (!profile?.onboarding_completed) return "/onboarding";
  return "/trainings";
}
