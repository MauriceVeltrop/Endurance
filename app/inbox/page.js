"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import { supabase } from "../../lib/supabase";
import {
  acceptTrainingInvite,
  declineTrainingInvite,
  fetchNotifications,
  fetchPendingTrainingInvites,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from "../../lib/notifications";

function formatTime(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function displayName(user) {
  return user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Someone";
}

export default function InboxPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [trainingInvites, setTrainingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications]
  );

  useEffect(() => {
    loadInbox();
  }, []);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = subscribeToNotifications(profile.id, () => {
      loadInbox({ silent: true });
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  async function loadInbox(options = {}) {
    if (!options.silent) setLoading(true);
    setMessage("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id,name,avatar_url,role")
        .eq("id", user.id)
        .maybeSingle();

      setProfile(profileRow || { id: user.id });

      const [notificationRows, inviteRows] = await Promise.all([
        fetchNotifications(user.id),
        fetchPendingTrainingInvites(user.id),
      ]);

      setNotifications((notificationRows || []).filter((item) => !item.read_at));
      setTrainingInvites(inviteRows);
    } finally {
      if (!options.silent) setLoading(false);
    }
  }

  async function openNotification(notification) {
    if (!notification?.id) return;

    if (!notification.read_at) {
      await markNotificationRead(notification.id);
    }

    if (notification.action_url) {
      router.push(notification.action_url);
      return;
    }

    if (notification.session_id) {
      router.push(`/trainings/${notification.session_id}`);
      return;
    }

    await loadInbox({ silent: true });
  }

  async function acceptInvite(invite) {
    if (!profile?.id) return;

    const { error } = await acceptTrainingInvite(invite, profile.id);

    if (error) {
      setMessage(error.message || "Could not accept invite.");
      return;
    }

    router.push(`/trainings/${invite.session_id}`);
  }

  async function declineInvite(invite) {
    if (!profile?.id) return;

    const { error } = await declineTrainingInvite(invite, profile.id);

    if (error) {
      setMessage(error.message || "Could not decline invite.");
      return;
    }

    await loadInbox({ silent: true });
  }

  async function respondToTeamRequest(notification, nextStatus) {
    if (!profile?.id || !notification?.id) return;

    setMessage("");

    const partnerRequestId = notification.metadata?.partner_request_id || notification.metadata?.request_id || null;

    let requestQuery = supabase
      .from("training_partners")
      .select("id, requester_id, addressee_id, status")
      .eq("addressee_id", profile.id)
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

    if (!request?.id) {
      await markNotificationRead(notification.id);
      setMessage("This Team Up request is no longer pending.");
      await loadInbox({ silent: true });
      return;
    }

    const { error: updateError } = await supabase
      .from("training_partners")
      .update({ status: nextStatus })
      .eq("id", request.id)
      .eq("addressee_id", profile.id);

    if (updateError) {
      setMessage(updateError.message || "Could not update Team Up request.");
      return;
    }

    if (nextStatus === "accepted") {
      await supabase.from("notifications").insert({
        user_id: request.requester_id,
        actor_id: profile.id,
        type: "team_request_accepted",
        title: "Team Up request accepted",
        body: "You are now training partners on Endurance.",
        action_url: "/team",
        metadata: { partner_request_id: request.id },
      });
    }

    const { error: deleteError } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notification.id)
      .eq("user_id", profile.id);

    if (deleteError) {
      await markNotificationRead(notification.id);
    }

    setNotifications((items) => items.filter((item) => item.id !== notification.id));
    setMessage(nextStatus === "accepted" ? "Team Up request accepted." : "Team Up request declined.");
  }

  async function openTeamFromNotification(notification) {
    if (notification?.id && !notification.read_at) {
      await markNotificationRead(notification.id);
    }
    router.push("/team");
  }

  async function markEverythingRead() {
    if (!profile?.id) return;

    await markAllNotificationsRead(profile.id);
    await loadInbox({ silent: true });
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <section style={styles.hero}>
          <div>
            <p style={styles.kicker}>Inbox</p>
            <h1 style={styles.title}>Activity & invites</h1>
            <p style={styles.subtitle}>
              Training invites, Team Up requests and realtime updates.
            </p>
          </div>

          <div style={styles.counter}>
            <strong>{trainingInvites.length + unreadCount}</strong>
            <span>Open</span>
          </div>
        </section>

        {message ? <section style={styles.message}>{message}</section> : null}

        {trainingInvites.length > 0 ? (
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <div>
                <p style={styles.kicker}>Training invites</p>
                <h2 style={styles.sectionTitle}>Pending invitations</h2>
              </div>
            </div>

            <div style={styles.feed}>
              {trainingInvites.map((invite) => (
                <article key={invite.id} style={styles.inviteCard}>
                  <div>
                    <strong style={styles.notificationTitle}>
                      {invite.session?.title || "Training session"}
                    </strong>
                    <p style={styles.notificationBody}>
                      Invited by {displayName(invite.inviter)}
                    </p>
                    <p style={styles.notificationBody}>
                      {invite.session?.start_location || "Location not set"}
                    </p>
                  </div>

                  <div style={styles.actions}>
                    <button type="button" onClick={() => router.push(`/trainings/${invite.session_id}`)} style={styles.secondaryButton}>
                      Open
                    </button>
                    <button type="button" onClick={() => declineInvite(invite)} style={styles.secondaryButton}>
                      Decline
                    </button>
                    <button type="button" onClick={() => acceptInvite(invite)} style={styles.primaryButton}>
                      Accept
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section style={styles.toolbar}>
          <button type="button" onClick={markEverythingRead} style={styles.secondaryButton}>
            Mark activity read
          </button>
        </section>

        {loading ? (
          <section style={styles.card}>Loading inbox...</section>
        ) : notifications.length === 0 && trainingInvites.length === 0 ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyIcon}>⚡</div>
            <strong style={styles.emptyTitle}>No activity yet</strong>
            <p style={styles.emptyText}>
              Training invites and updates will appear here.
            </p>
          </section>
        ) : (
          <section style={styles.feed}>
            {notifications.map((notification) => {
              const unread = !notification.read_at;

              const isTeamRequest = notification.type === "team_request";

              return (
                <article
                  key={notification.id}
                  style={{
                    ...styles.notificationCard,
                    ...(unread ? styles.notificationCardUnread : {}),
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    style={styles.notificationMainButton}
                  >
                    <div style={styles.notificationTop}>
                      <div>
                        <strong style={styles.notificationTitle}>
                          {notification.title}
                        </strong>
                        {notification.body ? (
                          <p style={styles.notificationBody}>{notification.body}</p>
                        ) : null}
                      </div>

                      {unread ? <span style={styles.unreadDot} /> : null}
                    </div>

                    <div style={styles.notificationMeta}>
                      <span>{notification.type}</span>
                      <span>{formatTime(notification.created_at)}</span>
                    </div>
                  </button>

                  {isTeamRequest ? (
                    <div style={styles.teamRequestActions}>
                      <button
                        type="button"
                        onClick={() => respondToTeamRequest(notification, "accepted")}
                        style={styles.primaryButton}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => respondToTeamRequest(notification, "rejected")}
                        style={styles.secondaryButton}
                      >
                        Decline
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}
      </section>
    
      <BottomNav />
</main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top, rgba(215,255,63,0.10), transparent 34%), #050505",
    color: "#fff",
    padding: 16,
  },
  shell: {
    maxWidth: 920,
    margin: "0 auto",
    display: "grid",
    gap: 14,
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "center",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(215,255,63,0.08))",
    borderRadius: 30,
    padding: 22,
  },
  kicker: {
    margin: 0,
    color: "#d7ff3f",
    textTransform: "uppercase",
    letterSpacing: "0.2em",
    fontWeight: 900,
    fontSize: 11,
  },
  title: {
    margin: "8px 0 0",
    fontWeight: 950,
    letterSpacing: "-0.06em",
    lineHeight: 0.95,
    fontSize: "clamp(36px, 9vw, 56px)",
  },
  subtitle: {
    margin: "12px 0 0",
    color: "rgba(255,255,255,0.60)",
    fontWeight: 700,
    lineHeight: 1.45,
  },
  counter: {
    minWidth: 92,
    borderRadius: 24,
    background: "rgba(215,255,63,0.12)",
    border: "1px solid rgba(215,255,63,0.22)",
    padding: 14,
    display: "grid",
    textAlign: "center",
  },
  section: {
    display: "grid",
    gap: 12,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    margin: "4px 0 0",
    fontSize: 24,
    fontWeight: 950,
    letterSpacing: "-0.04em",
  },
  toolbar: {
    display: "flex",
    justifyContent: "flex-end",
  },
  primaryButton: {
    border: 0,
    background: "#d7ff3f",
    color: "#050505",
    borderRadius: 999,
    padding: "12px 16px",
    fontWeight: 950,
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    borderRadius: 999,
    padding: "12px 16px",
    fontWeight: 900,
  },
  message: {
    border: "1px solid rgba(215,255,63,0.28)",
    background: "rgba(215,255,63,0.10)",
    color: "#eaff8f",
    borderRadius: 22,
    padding: 14,
    fontWeight: 850,
  },
  card: {
    borderRadius: 26,
    padding: 20,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  emptyCard: {
    borderRadius: 28,
    padding: 28,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: 34,
  },
  emptyTitle: {
    display: "block",
    marginTop: 12,
    fontSize: 20,
    fontWeight: 900,
  },
  emptyText: {
    color: "rgba(255,255,255,0.58)",
    lineHeight: 1.45,
  },
  feed: {
    display: "grid",
    gap: 12,
  },
  inviteCard: {
    borderRadius: 24,
    padding: 18,
    border: "1px solid rgba(215,255,63,0.24)",
    background: "rgba(215,255,63,0.08)",
    color: "#fff",
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 14,
  },
  teamRequestActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 16,
  },
  linkButton: {
    border: 0,
    background: "transparent",
    color: "#d7ff3f",
    borderRadius: 999,
    padding: "12px 8px",
    fontWeight: 950,
  },
  notificationCard: {
    width: "100%",
    textAlign: "left",
    borderRadius: 24,
    padding: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
  },
  notificationMainButton: {
    width: "100%",
    display: "block",
    padding: 0,
    margin: 0,
    border: 0,
    background: "transparent",
    color: "inherit",
    textAlign: "left",
  },
  notificationCardUnread: {
    border: "1px solid rgba(215,255,63,0.24)",
    background: "rgba(215,255,63,0.08)",
  },
  notificationTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  },
  notificationTitle: {
    fontWeight: 900,
    fontSize: 16,
  },
  notificationBody: {
    margin: "8px 0 0",
    color: "rgba(255,255,255,0.64)",
    lineHeight: 1.4,
  },
  unreadDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: "#d7ff3f",
    marginTop: 4,
    boxShadow: "0 0 16px rgba(215,255,63,0.55)",
  },
  notificationMeta: {
    marginTop: 14,
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    color: "rgba(255,255,255,0.42)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 800,
  },
};
