
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";
import {
  fetchNotifications,
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

export default function InboxPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications]
  );

  useEffect(() => {
    loadInbox();
  }, []);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = subscribeToNotifications(profile.id, async () => {
      const fresh = await fetchNotifications(profile.id);
      setNotifications(fresh);
    });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [profile?.id]);

  async function loadInbox() {
    setLoading(true);

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

      setProfile(profileRow || null);

      const rows = await fetchNotifications(user.id);
      setNotifications(rows);
    } finally {
      setLoading(false);
    }
  }

  async function openNotification(notification) {
    if (!notification?.id) return;

    if (!notification.read_at) {
      await markNotificationRead(notification.id);

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: new Date().toISOString() }
            : item
        )
      );
    }

    if (
      notification.entity_type === "training_session" &&
      notification.entity_id
    ) {
      router.push(`/trainings/${notification.entity_id}`);
      return;
    }

    if (notification.entity_type === "training_partner") {
      router.push("/team");
      return;
    }
  }

  async function markEverythingRead() {
    if (!profile?.id) return;

    await markAllNotificationsRead(profile.id);

    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        read_at: item.read_at || new Date().toISOString(),
      }))
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <section style={styles.hero}>
          <div>
            <p style={styles.kicker}>Inbox</p>
            <h1 style={styles.title}>Activity & notifications</h1>
            <p style={styles.subtitle}>
              Training invites, Team Up requests and realtime activity.
            </p>
          </div>

          <div style={styles.counter}>
            <strong>{unreadCount}</strong>
            <span>Unread</span>
          </div>
        </section>

        <section style={styles.toolbar}>
          <button
            type="button"
            onClick={markEverythingRead}
            style={styles.secondaryButton}
          >
            Mark all read
          </button>
        </section>

        {loading ? (
          <section style={styles.card}>Loading activity...</section>
        ) : notifications.length === 0 ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyIcon}>⚡</div>
            <strong style={styles.emptyTitle}>No activity yet</strong>
            <p style={styles.emptyText}>
              Training invites, Team Up requests and updates will appear here.
            </p>
          </section>
        ) : (
          <section style={styles.feed}>
            {notifications.map((notification) => {
              const unread = !notification.read_at;

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  style={{
                    ...styles.notificationCard,
                    ...(unread ? styles.notificationCardUnread : {}),
                  }}
                >
                  <div style={styles.notificationTop}>
                    <div>
                      <strong style={styles.notificationTitle}>
                        {notification.title}
                      </strong>

                      {notification.body ? (
                        <p style={styles.notificationBody}>
                          {notification.body}
                        </p>
                      ) : null}
                    </div>

                    {unread ? <span style={styles.unreadDot} /> : null}
                  </div>

                  <div style={styles.notificationMeta}>
                    <span>{notification.type}</span>
                    <span>{formatTime(notification.created_at)}</span>
                  </div>
                </button>
              );
            })}
          </section>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(215,255,63,0.10), transparent 34%), #050505",
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
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(215,255,63,0.08))",
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
  toolbar: {
    display: "flex",
    justifyContent: "flex-end",
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    borderRadius: 999,
    padding: "12px 16px",
    fontWeight: 900,
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
  notificationCard: {
    width: "100%",
    textAlign: "left",
    borderRadius: 24,
    padding: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
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
