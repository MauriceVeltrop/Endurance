"use client";

export function sportsOverlap(trainingSports = [], preferredSportIds = []) {
  if (!preferredSportIds?.length) return false;
  const sports = Array.isArray(trainingSports) ? trainingSports : [];
  return sports.some((sportId) => preferredSportIds.includes(sportId));
}

export function canUserSeeTraining({
  training,
  userId,
  role,
  preferredSportIds = [],
  acceptedPartnerIds = [],
  selectedVisibilitySessionIds = [],
  groupIds = [],
}) {
  if (!training || !userId) return false;
  if (["admin", "moderator"].includes(role)) return true;
  if (training.creator_id === userId) return true;

  const visibility = training.visibility || "team";

  if (visibility === "public") {
    return !preferredSportIds.length || sportsOverlap(training.sports, preferredSportIds);
  }

  if (visibility === "private") {
    return false;
  }

  if (visibility === "team") {
    return acceptedPartnerIds.includes(training.creator_id);
  }

  if (visibility === "selected") {
    return selectedVisibilitySessionIds.includes(training.id);
  }

  if (visibility === "group") {
    return Boolean(training.group_id && groupIds.includes(training.group_id));
  }

  return false;
}
