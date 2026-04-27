"use client";

import { useRouter } from "next/navigation";

export default function ProfileMessageButton({
  profileId,
  isTeamMember,
  currentUserRole,
}) {
  const router = useRouter();
  const canMessage = isTeamMember || currentUserRole === "moderator";
  if (!canMessage || !profileId) return null;

  return (
    <button
      type="button"
      onClick={() => router.push(`/messages/${profileId}`)}
      style={{
        marginTop: 12,
        width: "100%",
        padding: "12px 16px",
        borderRadius: 14,
        border: "none",
        background: "#e4ef16",
        color: "#000",
        fontWeight: 900,
        fontSize: 16,
        cursor: "pointer",
      }}
    >
      💬 Chat
    </button>
  );
}
