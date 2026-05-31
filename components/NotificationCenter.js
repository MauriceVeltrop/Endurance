// components/NotificationCenter.js
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function timeAgo(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} u`;
  return `${Math.round(hours / 24)} d`;
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    if (!user) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    setCurrentUser(user);
    setMessage("");

    const [{ data: notificationRows }, { data: inviteRows }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id,type,title,body,action_url,read_at,created_at,actor_id,session_id,metadata")
        .eq("user_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("training_invites")
        .select("id,status,response_note,created_at,session_id,inviter_id,training_sessions(id,title,start_location,starts_at,flexible_date,flexible_start_time,flexible_end_time)")
        .eq("invitee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    setNotifications(notificationRows || []);
    setInvites(inviteRows || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function markRead(notification) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notification.id);
    await load();
  }

  async function respondInvite(invite, status) {
    await supabase.from("training_invites").update({ status }).eq("id", invite.id);

    if (status === "accepted") {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (user) {
        await supabase.from("session_participants").upsert(
          {
            session_id: invite.session_id,
            user_id: user.id,
          },
          { onConflict: "session_id,user_id" }
        );
      }
    }

    await load();
  }

  async function respondTeamRequest(notification, nextStatus) {
    if (!notification?.id || !currentUser?.id) return;

    setMessage("");

    const partnerRequestId = notification.metadata?.partner_request_id || notification.metadata?.request_id || null;

    let requestQuery = supabase
      .from("training_partners")
      .select("id, requester_id, addressee_id, status")
      .eq("addressee_id", currentUser.id)
      .eq("status", "pending")
      .limit(1);

    if (partnerRequestId) {
      requestQuery = requestQuery.eq("id", partnerRequestId);
    } else if (notification.actor_id) {
      requestQuery = requestQuery.eq("requester_id", notification.actor_id);
    }

    const { data: request, error: requestError } = await requestQuery.maybeSingle();

    if (requestError) {
      setMessage(requestError.message || "Could not find Team Up request.");
      return;
    }

    if (request?.id) {
      const { error: updateError } = await supabase
        .from("training_partners")
        .update({ status: nextStatus })
        .eq("id", request.id)
        .eq("addressee_id", currentUser.id);

      if (updateError) {
        setMessage(updateError.message || "Could not update Team Up request.");
        return;
      }

      if (nextStatus === "accepted") {
        await supabase.from("notifications").insert({
          user_id: request.requester_id,
          actor_id: currentUser.id,
          type: "team_request_accepted",
          title: "Team Up request accepted",
          body: "You are now training partners on Endurance.",
          action_url: "/team",
          metadata: { partner_request_id: request.id },
        });
      }
    }

    const { error: deleteError } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notification.id)
      .eq("user_id", currentUser.id);

    if (deleteError) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notification.id)
        .eq("user_id", currentUser.id);
    }

    setNotifications((items) => items.filter((item) => item.id !== notification.id));
    setMessage(nextStatus === "accepted" ? "Team Up request accepted." : "Team Up request declined.");
  }

  if (loading) {
    return <div className="endurance-card notification-empty">Loading activity...</div>;
  }

  return (
    <div className="notification-stack">
      {message && <div className="status-message">{message}</div>}
      {invites.filter((invite) => invite.status === "pending").map((invite) => (
        <article key={invite.id} className="notification-card invite">
          <div className="notification-icon">✉</div>
          <div className="notification-content">
            <p className="eyebrow">Training invite</p>
            <h3>{invite.training_sessions?.title || "Training invitation"}</h3>
            <p>
              {invite.training_sessions?.start_location || "Open details"} · {timeAgo(invite.created_at)}
            </p>
            <div className="notification-actions">
              <button type="button" onClick={() => respondInvite(invite, "accepted")} className="primary-action">
                Accept
              </button>
              <button type="button" onClick={() => respondInvite(invite, "declined")} className="secondary-action">
                Decline
              </button>
              <Link href={`/trainings/${invite.session_id}`} className="secondary-action">Open</Link>
            </div>
          </div>
        </article>
      ))}

      {notifications.map((notification) => (
        <article key={notification.id} className={`notification-card ${notification.read_at ? "" : "unread"}`}>
          <div className="notification-icon">⌁</div>
          <div className="notification-content">
            <p className="eyebrow">{notification.type?.replaceAll("_", " ") || "Activity"}</p>
            <h3>{notification.title}</h3>
            {notification.body && <p>{notification.body}</p>}
            {notification.type === "team_request" ? (
              <div className="notification-actions">
                <button type="button" onClick={() => respondTeamRequest(notification, "accepted")} className="primary-action">
                  Accept
                </button>
                <button type="button" onClick={() => respondTeamRequest(notification, "rejected")} className="secondary-action">
                  Decline
                </button>
                <span>{timeAgo(notification.created_at)}</span>
              </div>
            ) : (
              <div className="notification-actions">
                {notification.action_url && <Link href={notification.action_url} className="primary-action">Open</Link>}
                {!notification.read_at && (
                  <button type="button" onClick={() => markRead(notification)} className="secondary-action">
                    Mark read
                  </button>
                )}
                <span>{timeAgo(notification.created_at)}</span>
              </div>
            )}
          </div>
        </article>
      ))}

      {!invites.filter((invite) => invite.status === "pending").length && !notifications.length && (
        <div className="endurance-card notification-empty">
          <h2>No activity yet</h2>
          <p>Your training invites, team requests and messages will appear here.</p>
        </div>
      )}
    </div>
  );
}
