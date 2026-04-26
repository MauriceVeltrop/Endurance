"use client";

import { useRouter } from "next/navigation";

export default function ProfileMessageButton({ profileId, isTeamMember }) {
  const router = useRouter();

  // Alleen zichtbaar voor My Team leden
  if (!isTeamMember || !profileId) return null;

  return (
    <button
      onClick={() => router.push(`/messages/${profileId}`)}
      style={{
        marginTop: 10,
        width: "100%",
        padding: "12px 16px",
        borderRadius: 12,
        border: "none",
        background: "#e4ef16",
        color: "#000",
        fontWeight: 700,
        fontSize: 15,
        cursor: "pointer"
      }}
    >
      💬 Send Message
    </button>
  );
}
