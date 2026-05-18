import { supabase } from "./supabase";

export const DEFAULT_PRIVACY_SETTINGS = {
  profile_visibility: "team",
  avatar_visibility: "public",
  location_visibility: "team",
  age_visibility: "team",
  email_visibility: "private",
  availability_visibility: "team",
  default_training_visibility: "team",
  allow_team_requests: true,
  allow_training_invites: true,
};

export function mergePrivacySettings(settings) {
  return {
    ...DEFAULT_PRIVACY_SETTINGS,
    ...(settings || {}),
  };
}

export async function fetchPrivacySettings(userId) {
  if (!userId) return mergePrivacySettings(null);

  const { data, error } = await supabase
    .from("profile_privacy_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Privacy settings skipped:", error.message);
    return mergePrivacySettings(null);
  }

  return mergePrivacySettings(data);
}

export async function fetchPrivacySettingsMap(userIds = []) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("profile_privacy_settings")
    .select("*")
    .in("user_id", ids);

  if (error) {
    console.warn("Privacy settings map skipped:", error.message);
    return {};
  }

  return Object.fromEntries(
    (data || []).map((row) => [row.user_id, mergePrivacySettings(row)])
  );
}

export function canViewByVisibility({ visibility, viewerId, ownerId, isTeamPartner = false, isAdmin = false }) {
  if (!visibility) return false;
  if (isAdmin) return true;
  if (viewerId && ownerId && viewerId === ownerId) return true;
  if (visibility === "public") return true;
  if (visibility === "team") return Boolean(isTeamPartner);
  return false;
}

export function filterProfileByPrivacy({ profile, privacy, viewerId, isTeamPartner = false, isAdmin = false }) {
  if (!profile) return null;

  const settings = mergePrivacySettings(privacy);
  const ownerId = profile.id;

  const canSeeProfile = canViewByVisibility({
    visibility: settings.profile_visibility,
    viewerId,
    ownerId,
    isTeamPartner,
    isAdmin,
  });

  if (!canSeeProfile) {
    return {
      id: profile.id,
      name: "Private profile",
      first_name: null,
      last_name: null,
      email: null,
      avatar_url: null,
      location: null,
      birth_date: null,
      role: profile.role,
      blocked: profile.blocked,
      privacy_limited: true,
    };
  }

  const next = { ...profile, privacy_limited: false };

  if (!canViewByVisibility({ visibility: settings.avatar_visibility, viewerId, ownerId, isTeamPartner, isAdmin })) {
    next.avatar_url = null;
  }

  if (!canViewByVisibility({ visibility: settings.location_visibility, viewerId, ownerId, isTeamPartner, isAdmin })) {
    next.location = null;
  }

  if (!canViewByVisibility({ visibility: settings.age_visibility, viewerId, ownerId, isTeamPartner, isAdmin })) {
    next.birth_date = null;
  }

  if (!canViewByVisibility({ visibility: settings.email_visibility, viewerId, ownerId, isTeamPartner, isAdmin })) {
    next.email = null;
  }

  return next;
}

export function privacyAllowsTeamRequest(settings) {
  return mergePrivacySettings(settings).allow_team_requests !== false;
}

export function privacyAllowsTrainingInvite(settings) {
  return mergePrivacySettings(settings).allow_training_invites !== false;
}
