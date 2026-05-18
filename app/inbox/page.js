"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../lib/notifications";
import { subscribeToInboxRealtime, removeRealtimeChannel } from "../../lib/realtime";

function displayName(person) {
  return person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.email || "Endurance user";
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function initials(person) {
  return displayName(person)
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getTrainingTime(session) {
  const value = session?.final_starts_at || session?.starts_at;
  if (value) return formatDate(value);

  if (session?.flexible_date) {
    return `${formatDate(session.flexible_date).split(",")[0]} · flexible`;
  }

  return "Time to be planned";
}

export default function InboxPage() {
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("activity");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [trainingInvites, setTrainingInvites] = useState([]);
  const [teamRequests, setTeamRequests] = useState([]);
  const [messageThreads, setMessageThreads] = useState([]);

  useEffect(() => {
    let activeChannel = null;
    let mounted = true;

    async function start() {
      const user = await loadInbox();
      if (mounted && user?.id) {
        activeChannel = subscribeToInboxRealtime(user.id, () => {
          loadInbox({ silent: true });
        });
      }
    }

    start();

    return () => {
      mounted = false;
      removeRealtimeChannel(activeChannel);
    };
  }, []);

  async function loadInbox(options = {}) {
    if (!options.silent) setLoading(true);
    setNotice("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        window.location.href = "/login";
        return null;
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,first_name,last_name")
        .eq("id", user.id)
        .maybeSingle();

      setProfile(profileRow || { id: user.id, email: user.email });

      const [activityRes, invitesRes, teamRes, messagesRes] = await Promise.all([
        fetchNotifications({ limit: 40 }),
        supabase
          .from("training_invites")
          .select(`
            id,
            status,
            response_note,
            created_at,
            session_id,
            inviter:inviter_id (id, name, first_name, last_name, avatar_url, email),
            session:session_id (
              id,
              title,
              sports,
              planning_type,
              starts_at,
              final_starts_at,
              flexible_date,
              start_location,
              distance_km
            )
          `)
          .eq("invitee_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("training_partners")
          .select(`
            id,
            status,
            created_at,
            requester:requester_id (id, name, first_name, last_name, avatar_url, email)
          `)
          .eq("addressee_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        supabase
          .from("messages")
          .select("id,sender_id,receiver_id,message,created_at,read_at")
          .or(`receiver_id.eq.${user.id},sender_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (activityRes.error) console.warn(activityRes.error.message);
      if (invitesRes.error) console.warn(invitesRes.error.message);
      if (teamRes.error) console.warn(teamRes.error.message);
      if (messagesRes.error) console.warn(messagesRes.error.message);

      setNotifications(activityRes.data || []);
      setTrainingInvites(invitesRes.data || []);
      setTeamRequests(teamRes.data || []);
      setMessageThreads(messagesRes.data || []);

      return user;
    } catch (error) {
      console.error(error);
      setNotice(error.message || "Could not load inbox.");
      return null;
    } finally {
      if (!options.silent) setLoading(false);
    }
  }

  const pendingInvites = useMemo(
    () => trainingInvites.filter((invite) => invite.status === "pending"),
    [trainingInvites]
  );

  const unreadActivity = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications]
  );

  async function acceptInvite(invite) {
    if (!profile?.id || !invite?.session_id) return;

    await supabase
      .from("training_invites")
      .update({ status: "accepted" })
      .eq("id", invite.id);

    await supabase
      .from("session_participants")
      .upsert(
        { session_id: invite.session_id, user_id: profile.id },
        { onConflict: "session_id,user_id" }
      );

    await loadInbox({ silent: true });
  }

  async function declineInvite(invite) {
    await supabase
      .from("training_invites")
      .update({ status: "declined" })
      .eq("id", invite.id);

    await loadInbox({ silent: true });
  }

  async function acceptTeamRequest(request) {
    await supabase
      .from("training_partners")
      .update({ status: "accepted" })
      .eq("id", request.id);

    await loadInbox({ silent: true });
  }

  async function declineTeamRequest(request) {
    await supabase
      .from("training_partners")
      .update({ status: "rejected" })
      .eq("id", request.id);

    await loadInbox({ silent: true });
  }

  const tabs = [
    { id: "activity", label: "Activity", count: unreadActivity },
    { id: "invites", label: "Invites", count: pendingInvites.length },
    { id: "messages", label: "Messages", count: teamRequests.length },
  ];

  return (
    <main style={styles.page}>
      <AppHeader profile={profile} />

      <section style={styles.hero}>
        <div>
          <p style={styles.kicker}>Inbox</p>
          <h1 style={styles.title}>Your activity.</h1>
          <p style={styles.subtitle}>
            Invites, Team Up requests, messages and training updates in one place.
          </p>
        </div>

        <div style={styles.tabs}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                ...styles.tab,
                ...(tab === item.id ? styles.tabActive : null),
              }}
            >
              {item.label}
              {item.count ? <span style={styles.count}>{item.count}</span> : null}
            </button>
          ))}
        </div>
      </section>

      {notice ? <div style={styles.notice}>{notice}</div> : null}

      {loading ? (
        <section style={styles.card}>Loading inbox…</section>
      ) : null}

      {!loading && tab === "activity" ? (
        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <p style={styles.kicker}>Activity</p>
              <h2 style={styles.sectionTitle}>Latest updates</h2>
            </div>
            {unreadActivity ? (
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={async () => {
                  await markAllNotificationsRead();
                  await loadInbox({ silent: true });
                }}
              >
                Mark read
              </button>
            ) : null}
          </div>

          <div style={styles.list}>
            {notifications.length ? (
              notifications.map((item) => {
                const href = item.action_url || (item.session_id ? `/trainings/${item.session_id}` : "/inbox");
                return (
                  <Link
                    href={href}
                    key={item.id}
                    onClick={() => markNotificationRead(item.id)}
                    style={{
                      ...styles.row,
                      ...(item.read_at ? null : styles.unreadRow),
                    }}
                  >
                    <div style={styles.avatar}>
                      {item.actor?.avatar_url ? (
                        <img src={item.actor.avatar_url} alt="" style={styles.avatarImg} />
                      ) : (
                        initials(item.actor)
                      )}
                    </div>
                    <div style={styles.rowBody}>
                      <div style={styles.rowTop}>
                        <strong style={styles.rowTitle}>{item.title}</strong>
                        <span style={styles.date}>{formatDate(item.created_at)}</span>
                      </div>
                      {item.body ? <p style={styles.rowText}>{item.body}</p> : null}
                    </div>
                  </Link>
                );
              })
            ) : (
              <p style={styles.empty}>No activity yet.</p>
            )}
          </div>
        </section>
      ) : null}

      {!loading && tab === "invites" ? (
        <section style={styles.card}>
          <p style={styles.kicker}>Training invites</p>
          <h2 style={styles.sectionTitle}>Pending sessions</h2>

          <div style={styles.list}>
            {trainingInvites.length ? (
              trainingInvites.map((invite) => (
                <article key={invite.id} style={styles.inviteCard}>
                  <div style={styles.rowTop}>
                    <div>
                      <span style={styles.status}>{invite.status}</span>
                      <h3 style={styles.inviteTitle}>{invite.session?.title || "Training session"}</h3>
                      <p style={styles.rowText}>Invited by {displayName(invite.inviter)}</p>
                    </div>
                    <div style={styles.avatar}>
                      {invite.inviter?.avatar_url ? (
                        <img src={invite.inviter.avatar_url} alt="" style={styles.avatarImg} />
                      ) : (
                        initials(invite.inviter)
                      )}
                    </div>
                  </div>

                  <div style={styles.chips}>
                    {(invite.session?.sports || []).slice(0, 3).map((sport) => (
                      <span key={sport} style={styles.chip}>{sport}</span>
                    ))}
                    <span style={styles.chip}>{getTrainingTime(invite.session)}</span>
                    {invite.session?.start_location ? (
                      <span style={styles.chip}>{invite.session.start_location}</span>
                    ) : null}
                  </div>

                  <div style={styles.actions}>
                    <Link href={`/trainings/${invite.session_id}`} style={styles.secondaryButton}>
                      Open
                    </Link>
                    {invite.status === "pending" ? (
                      <>
                        <button type="button" style={styles.secondaryButton} onClick={() => declineInvite(invite)}>
                          Decline
                        </button>
                        <button type="button" style={styles.primaryButton} onClick={() => acceptInvite(invite)}>
                          Accept
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <p style={styles.empty}>No training invites.</p>
            )}
          </div>
        </section>
      ) : null}

      {!loading && tab === "messages" ? (
        <section style={styles.card}>
          <p style={styles.kicker}>Messages</p>
          <h2 style={styles.sectionTitle}>Team requests & messages</h2>

          <div style={styles.list}>
            {teamRequests.map((request) => (
              <article key={request.id} style={styles.inviteCard}>
                <div style={styles.rowTop}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={styles.avatar}>
                      {request.requester?.avatar_url ? (
                        <img src={request.requester.avatar_url} alt="" style={styles.avatarImg} />
                      ) : (
                        initials(request.requester)
                      )}
                    </div>
                    <div>
                      <h3 style={styles.inviteTitle}>{displayName(request.requester)}</h3>
                      <p style={styles.rowText}>wants to team up</p>
                    </div>
                  </div>
                </div>
                <div style={styles.actions}>
                  <button type="button" style={styles.secondaryButton} onClick={() => declineTeamRequest(request)}>
                    Decline
                  </button>
                  <button type="button" style={styles.primaryButton} onClick={() => acceptTeamRequest(request)}>
                    Accept
                  </button>
                </div>
              </article>
            ))}

            {messageThreads.length ? (
              messageThreads.map((message) => (
                <div key={message.id} style={styles.row}>
                  <div style={styles.rowBody}>
                    <div style={styles.rowTop}>
                      <strong style={styles.rowTitle}>Message</strong>
                      <span style={styles.date}>{formatDate(message.created_at)}</span>
                    </div>
                    <p style={styles.rowText}>{message.message}</p>
                  </div>
                </div>
              ))
            ) : null}

            {!teamRequests.length && !messageThreads.length ? (
              <p style={styles.empty}>No messages yet.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    overflowX: "hidden",
    background: "radial-gradient(circle at top, rgba(190,255,0,0.10), transparent 34%), #050505",
    color: "#fff",
    padding: "18px",
    paddingBottom: "80px",
    boxSizing: "border-box",
  },
  hero: {
    maxWidth: 820,
    margin: "18px auto",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(190,255,0,0.08))",
    borderRadius: 32,
    padding: 22,
    boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
  },
  kicker: {
    margin: 0,
    color: "#d7ff3f",
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: "0.22em",
    fontWeight: 900,
  },
  title: {
    margin: "8px 0 0",
    fontSize: 44,
    lineHeight: 0.95,
    fontWeight: 950,
    letterSpacing: "-0.06em",
  },
  subtitle: {
    margin: "14px 0 0",
    color: "rgba(255,255,255,0.62)",
    fontSize: 16,
    lineHeight: 1.45,
    fontWeight: 650,
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 6,
    marginTop: 20,
    padding: 4,
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 999,
    background: "rgba(0,0,0,0.28)",
  },
  tab: {
    border: 0,
    borderRadius: 999,
    padding: "11px 8px",
    background: "transparent",
    color: "rgba(255,255,255,0.62)",
    fontWeight: 900,
    fontSize: 13,
  },
  tabActive: {
    background: "#d7ff3f",
    color: "#050505",
  },
  count: {
    marginLeft: 6,
    padding: "2px 6px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.18)",
  },
  card: {
    maxWidth: 820,
    margin: "14px auto",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.055)",
    borderRadius: 30,
    padding: 18,
  },
  notice: {
    maxWidth: 820,
    margin: "14px auto",
    border: "1px solid rgba(215,255,63,0.30)",
    background: "rgba(215,255,63,0.10)",
    color: "#eaff8f",
    borderRadius: 22,
    padding: 14,
    fontWeight: 800,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  sectionTitle: {
    margin: "5px 0 0",
    fontSize: 25,
    fontWeight: 950,
    letterSpacing: "-0.04em",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 14,
  },
  row: {
    display: "flex",
    gap: 12,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 24,
    background: "rgba(0,0,0,0.24)",
    color: "#fff",
    textDecoration: "none",
    minWidth: 0,
  },
  unreadRow: {
    border: "1px solid rgba(215,255,63,0.30)",
    background: "rgba(215,255,63,0.10)",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
    background: "rgba(255,255,255,0.10)",
    color: "#d7ff3f",
    fontWeight: 950,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  rowBody: {
    minWidth: 0,
    flex: 1,
  },
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  rowTitle: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 16,
  },
  rowText: {
    margin: "4px 0 0",
    color: "rgba(255,255,255,0.60)",
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 650,
  },
  date: {
    color: "rgba(255,255,255,0.36)",
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  empty: {
    margin: 0,
    padding: 16,
    borderRadius: 22,
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.50)",
    fontWeight: 750,
  },
  inviteCard: {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.26)",
    borderRadius: 26,
    padding: 15,
  },
  status: {
    color: "#d7ff3f",
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    fontSize: 10,
    fontWeight: 950,
  },
  inviteTitle: {
    margin: "4px 0 0",
    fontSize: 22,
    lineHeight: 1,
    fontWeight: 950,
    letterSpacing: "-0.04em",
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 13,
  },
  chip: {
    borderRadius: 999,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.74)",
    fontSize: 12,
    fontWeight: 850,
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 14,
  },
  primaryButton: {
    border: 0,
    borderRadius: 999,
    background: "#d7ff3f",
    color: "#050505",
    padding: "11px 15px",
    fontWeight: 950,
    textDecoration: "none",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 999,
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    padding: "11px 15px",
    fontWeight: 900,
    textDecoration: "none",
    cursor: "pointer",
  },
};
