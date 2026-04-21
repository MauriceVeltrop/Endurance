"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function TeamRequestsPanel({ userId }) {
  const [requests, setRequests] = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);

  useEffect(() => {
    if (!userId) return;
    loadRequests();
  }, [userId]);

  const loadRequests = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("training_partners")
      .select("*")
      .eq("addressee_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("team requests load error", error);
      setLoading(false);
      return;
    }

    const rows = data || [];
    setRequests(rows);

    const requesterIds = [...new Set(rows.map((row) => row.requester_id))];

    if (requesterIds.length === 0) {
      setProfilesMap({});
      setLoading(false);
      return;
    }

    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, name, avatar_url")
      .in("id", requesterIds);

    if (profilesError) {
      console.error("requester profiles load error", profilesError);
      setLoading(false);
      return;
    }

    const nextMap = {};
    (profileRows || []).forEach((profile) => {
      nextMap[profile.id] = profile;
    });

    setProfilesMap(nextMap);
    setLoading(false);
  };

  const acceptRequest = async (requestId) => {
    setWorkingId(requestId);

    const { error } = await supabase
      .from("training_partners")
      .update({
        status: "accepted",
        responded_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    setWorkingId(null);

    if (error) {
      alert(`Accepting request failed: ${error.message}`);
      return;
    }

    await loadRequests();
  };

  const rejectRequest = async (requestId) => {
    setWorkingId(requestId);

    const { error } = await supabase
      .from("training_partners")
      .update({
        status: "rejected",
        responded_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    setWorkingId(null);

    if (error) {
      alert(`Rejecting request failed: ${error.message}`);
      return;
    }

    await loadRequests();
  };

  if (!userId) return null;

  if (loading) {
    return (
      <section style={wrap}>
        <div style={titleRow}>
          <div style={title}>Team Requests</div>
        </div>
        <div style={muted}>Loading...</div>
      </section>
    );
  }

  if (!requests.length) {
    return null;
  }

  return (
    <section style={wrap}>
      <div style={titleRow}>
        <div style={title}>Team Requests</div>
        <div style={badge}>{requests.length}</div>
      </div>

      <div style={list}>
        {requests.map((request) => {
          const requester = profilesMap[request.requester_id];

          return (
            <div key={request.id} style={card}>
              <div style={userRow}>
                {requester?.avatar_url ? (
                  <img
                    src={requester.avatar_url}
                    alt={requester?.name || "User"}
                    style={avatar}
                  />
                ) : (
                  <div style={avatarPlaceholder}>
                    {(requester?.name || "?").charAt(0).toUpperCase()}
                  </div>
                )}

                <div style={{ flex: 1 }}>
                  <div style={nameRow}>
                    <Link
                      href={`/profile/${request.requester_id}`}
                      style={nameLink}
                    >
                      {requester?.name || "Unknown user"}
                    </Link>
                  </div>
                  <div style={sub}>wants to team up with you</div>
                </div>
              </div>

              <div style={actions}>
                <button
                  onClick={() => acceptRequest(request.id)}
                  style={acceptBtn}
                  disabled={workingId === request.id}
                >
                  {workingId === request.id ? "Saving..." : "Accept"}
                </button>

                <button
                  onClick={() => rejectRequest(request.id)}
                  style={rejectBtn}
                  disabled={workingId === request.id}
                >
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const wrap = {
  marginBottom: 18,
  padding: 16,
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 18,
};

const titleRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
};

const title = {
  fontSize: 18,
  fontWeight: 700,
};

const badge = {
  minWidth: 28,
  height: 28,
  padding: "0 8px",
  borderRadius: 999,
  background: "#e4ef16",
  color: "black",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
  fontSize: 13,
};

const list = {
  display: "grid",
  gap: 12,
};

const card = {
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 16,
  padding: 14,
};

const userRow = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const avatar = {
  width: 48,
  height: 48,
  borderRadius: "50%",
  objectFit: "cover",
  objectPosition: "center",
};

const avatarPlaceholder = {
  width: 48,
  height: 48,
  borderRadius: "50%",
  background: "#1f1f1f",
  color: "#e4ef16",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
};

const nameRow = {
  fontWeight: 700,
  fontSize: 15,
};

const nameLink = {
  color: "white",
  textDecoration: "none",
};

const sub = {
  opacity: 0.7,
  fontSize: 13,
  marginTop: 2,
};

const actions = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 12,
};

const acceptBtn = {
  background: "linear-gradient(135deg,#2563eb,#06b6d4)",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: "bold",
};

const rejectBtn = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 12,
};

const muted = {
  opacity: 0.7,
  fontSize: 14,
};
