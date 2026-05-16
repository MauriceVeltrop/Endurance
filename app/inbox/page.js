"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";

function displayName(person) {
  return person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.email || "Endurance user";
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function InboxPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [trainingInvites, setTrainingInvites] = useState([]);
  const [teamRequests, setTeamRequests] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  const counts = useMemo(() => {
    return {
      all: trainingInvites.length + teamRequests.length + messages.length,
      invites: trainingInvites.length,
      team: teamRequests.length,
      messages: messages.length,
    };
  }, [trainingInvites.length, teamRequests.length, messages.length]);

  useEffect(() => {
    loadInbox();
  }, []);

  async function loadInbox() {
    setLoading(true);
    setNotice("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      setProfile(profileRow);

      await Promise.all([
        loadTrainingInvites(user.id),
        loadTeamRequests(user.id),
        loadMessages(user.id),
      ]);
    } catch (error) {
      console.error("Inbox load error", error);
      setNotice(error?.message || "Could not load inbox.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTrainingInvites(userId) {
    const { data: inviteRows, error } = await supabase
      .from("training_invites")
      .select("id,session_id,inviter_id,invitee_id,created_at")
      .eq("invitee_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.warn("Training invites skipped", error);
      setTrainingInvites([]);
      return;
    }

    const rows = inviteRows || [];
    const sessionIds = rows.map((row) => row.session_id).filter(Boolean);
    const inviterIds = rows.map((row) => row.inviter_id).filter(Boolean);

    let sessionMap = {};
    let inviterMap = {};

    if (sessionIds.length) {
      const { data: sessions } = await supabase
        .from("training_sessions")
        .select("id,title,sports,starts_at,final_starts_at,flexible_date,planning_type,start_location")
        .in("id", sessionIds);

      sessionMap = Object.fromEntries((sessions || []).map((session) => [session.id, session]));
    }

    if (inviterIds.length) {
      const { data: inviters } = await supabase
        .from("profiles")
        .select("id,name,first_name,last_name,email,avatar_url,role")
        .in("id", inviterIds);

      inviterMap = Object.fromEntries((inviters || []).map((person) => [person.id, person]));
    }

    setTrainingInvites(
      rows.map((row) => ({
        ...row,
        training: sessionMap[row.session_id] || null,
        inviter: inviterMap[row.inviter_id] || null,
      }))
    );
  }

  async function loadTeamRequests(userId) {
    const { data: rows, error } = await supabase
      .from("training_partners")
      .select("id,requester_id,addressee_id,status,created_at")
      .eq("addressee_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.warn("Team requests skipped", error);
      setTeamRequests([]);
      return;
    }

    const requesterIds = (rows || []).map((row) => row.requester_id).filter(Boolean);
    let requesterMap = {};

    if (requesterIds.length) {
      const { data: requesters } = await supabase
        .from("profiles")
        .select("id,name,first_name,last_name,email,avatar_url,role,location")
        .in("id", requesterIds);

      requesterMap = Object.fromEntries((requesters || []).map((person) => [person.id, person]));
    }

    setTeamRequests(
      (rows || []).map((row) => ({
        ...row,
        requester: requesterMap[row.requester_id] || null,
      }))
    );
  }

  async function loadMessages(userId) {
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("id,thread_id,sender_id,receiver_id,message,created_at,read_at")
        .eq("receiver_id", userId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(25);

      const senderIds = (data || []).map((row) => row.sender_id).filter(Boolean);
      let senderMap = {};

      if (senderIds.length) {
        const { data: senders } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,email,avatar_url")
          .in("id", senderIds);

        senderMap = Object.fromEntries((senders || []).map((person) => [person.id, person]));
      }

      setMessages((data || []).map((message) => ({ ...message, sender: senderMap[message.sender_id] || null })));
    } catch (error) {
      console.warn("Messages skipped", error);
      setMessages([]);
    }
  }

  async function acceptTrainingInvite(invite) {
    if (!profile?.id) return;

    setBusyId(invite.id);
    setNotice("");

    try {
      const { data: existing } = await supabase
        .from("session_participants")
        .select("id")
        .eq("session_id", invite.session_id)
        .eq("user_id", profile.id)
        .maybeSingle();

      if (!existing?.id) {
        const { error: joinError } = await supabase
          .from("session_participants")
          .insert({
            session_id: invite.session_id,
            user_id: profile.id,
          });

        if (joinError) throw joinError;
      }

      const { error: deleteError } = await supabase
        .from("training_invites")
        .delete()
        .eq("id", invite.id)
        .eq("invitee_id", profile.id);

      if (deleteError) throw deleteError;

      setNotice("Training invite accepted.");
      await loadInbox();
    } catch (error) {
      console.error("Accept invite error", error);
      setNotice(error?.message || "Could not accept invite.");
    } finally {
      setBusyId("");
    }
  }

  async function declineTrainingInvite(invite) {
    if (!profile?.id) return;

    setBusyId(invite.id);
    setNotice("");

    try {
      const { error } = await supabase
        .from("training_invites")
        .delete()
        .eq("id", invite.id)
        .eq("invitee_id", profile.id);

      if (error) throw error;

      setNotice("Training invite declined.");
      await loadInbox();
    } catch (error) {
      console.error("Decline invite error", error);
      setNotice(error?.message || "Could not decline invite.");
    } finally {
      setBusyId("");
    }
  }

  async function respondTeamRequest(request, status) {
    if (!profile?.id) return;

    setBusyId(request.id);
    setNotice("");

    try {
      const { error } = await supabase
        .from("training_partners")
        .update({ status })
        .eq("id", request.id)
        .eq("addressee_id", profile.id);

      if (error) throw error;

      setNotice(status === "accepted" ? "Team Up request accepted." : "Team Up request rejected.");
      await loadInbox();
    } catch (error) {
      console.error("Team request error", error);
      setNotice(error?.message || "Could not update Team Up request.");
    } finally {
      setBusyId("");
    }
  }

  function visibleItems() {
    const items = [];

    if (activeTab === "all" || activeTab === "invites") {
      for (const invite of trainingInvites) {
        items.push({ type: "invite", id: `invite-${invite.id}`, invite, created_at: invite.created_at });
      }
    }

    if (activeTab === "all" || activeTab === "team") {
      for (const request of teamRequests) {
        items.push({ type: "team", id: `team-${request.id}`, request, created_at: request.created_at });
      }
    }

    if (activeTab === "all" || activeTab === "messages") {
      for (const message of messages) {
        items.push({ type: "message", id: `message-${message.id}`, message, created_at: message.created_at });
      }
    }

    return items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  const items = visibleItems();

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Inbox</div>
          <h1 style={styles.title}>Messages & actions</h1>
          <p style={styles.subtitle}>
            One place for training invites, Team Up requests and unread messages.
          </p>
        </header>

        <section style={styles.tabs}>
          {[
            ["all", "All", counts.all],
            ["invites", "Invites", counts.invites],
            ["team", "Team Up", counts.team],
            ["messages", "Messages", counts.messages],
          ].map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              style={activeTab === id ? styles.tabActive : styles.tab}
            >
              {label}
              {count > 0 ? <span style={styles.tabCount}>{count}</span> : null}
            </button>
          ))}
        </section>

        {notice ? <section style={styles.notice}>{notice}</section> : null}

        {loading ? (
          <section style={styles.card}>Loading inbox...</section>
        ) : items.length ? (
          <section style={styles.list}>
            {items.map((item) => {
              if (item.type === "invite") {
                const invite = item.invite;
                const training = invite.training;

                return (
                  <article key={item.id} style={styles.cardHot}>
                    <div style={styles.itemTop}>
                      <span style={styles.typeBadge}>Training invite</span>
                      <span style={styles.dateText}>{formatDate(invite.created_at)}</span>
                    </div>

                    <h2 style={styles.itemTitle}>{training?.title || "Invited training"}</h2>
                    <p style={styles.itemText}>
                      Invited by {displayName(invite.inviter)}
                      {training?.start_location ? ` · ${training.start_location}` : ""}
                    </p>

                    <div style={styles.actions}>
                      <button type="button" onClick={() => router.push(`/trainings/${invite.session_id}`)} style={styles.secondaryButton}>
                        Open
                      </button>
                      <button type="button" onClick={() => acceptTrainingInvite(invite)} disabled={busyId === invite.id} style={styles.primaryButton}>
                        Accept
                      </button>
                      <button type="button" onClick={() => declineTrainingInvite(invite)} disabled={busyId === invite.id} style={styles.dangerButton}>
                        Decline
                      </button>
                    </div>
                  </article>
                );
              }

              if (item.type === "team") {
                const request = item.request;

                return (
                  <article key={item.id} style={styles.card}>
                    <div style={styles.itemTop}>
                      <span style={styles.typeBadge}>Team Up</span>
                      <span style={styles.dateText}>{formatDate(request.created_at)}</span>
                    </div>

                    <h2 style={styles.itemTitle}>{displayName(request.requester)}</h2>
                    <p style={styles.itemText}>wants to Team Up with you.</p>

                    <div style={styles.actions}>
                      <button type="button" onClick={() => router.push(`/profile/${request.requester_id}`)} style={styles.secondaryButton}>
                        Profile
                      </button>
                      <button type="button" onClick={() => respondTeamRequest(request, "accepted")} disabled={busyId === request.id} style={styles.primaryButton}>
                        Accept
                      </button>
                      <button type="button" onClick={() => respondTeamRequest(request, "rejected")} disabled={busyId === request.id} style={styles.dangerButton}>
                        Reject
                      </button>
                    </div>
                  </article>
                );
              }

              const message = item.message;

              return (
                <article key={item.id} style={styles.card}>
                  <div style={styles.itemTop}>
                    <span style={styles.typeBadge}>Message</span>
                    <span style={styles.dateText}>{formatDate(message.created_at)}</span>
                  </div>

                  <h2 style={styles.itemTitle}>{displayName(message.sender)}</h2>
                  <p style={styles.itemText}>{message.message}</p>

                  <div style={styles.actions}>
                    <button
                      type="button"
                      onClick={() => router.push(message.thread_id ? `/messages/${message.thread_id}` : "/messages")}
                      style={styles.primaryButton}
                    >
                      Open message
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section style={styles.card}>
            <h2 style={styles.itemTitle}>Inbox is empty</h2>
            <p style={styles.itemText}>Training invites, Team Up requests and messages will appear here.</p>
          </section>
        )}
      </section>
    </main>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 16px 42px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
  },
  shell: {
    width: "100%",
    maxWidth: 960,
    margin: "0 auto",
    display: "grid",
    gap: 18,
  },
  header: {
    display: "grid",
    gap: 10,
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(42px, 12vw, 72px)",
    lineHeight: 0.92,
    letterSpacing: "-0.075em",
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
    maxWidth: 660,
  },
  tabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  tab: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    padding: "0 13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  tabActive: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.28)",
    background: "rgba(228,239,22,0.13)",
    color: "#e4ef16",
    padding: "0 13px",
    fontWeight: 950,
    cursor: "pointer",
  },
  tabCount: {
    marginLeft: 7,
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    display: "inline-grid",
    placeItems: "center",
    background: "#e4ef16",
    color: "#101406",
    fontSize: 11,
    fontWeight: 950,
  },
  notice: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  list: {
    display: "grid",
    gap: 12,
  },
  card: {
    borderRadius: 28,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 12,
  },
  cardHot: {
    borderRadius: 28,
    padding: 18,
    background: "linear-gradient(145deg, rgba(228,239,22,0.13), rgba(255,255,255,0.045))",
    border: "1px solid rgba(228,239,22,0.25)",
    display: "grid",
    gap: 12,
    boxShadow: "0 0 36px rgba(228,239,22,0.10)",
  },
  itemTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  typeBadge: {
    borderRadius: 999,
    padding: "7px 10px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.24)",
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
  },
  dateText: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 12,
    fontWeight: 800,
  },
  itemTitle: {
    margin: 0,
    fontSize: 24,
    letterSpacing: "-0.05em",
  },
  itemText: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.45,
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
  dangerButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,90,90,0.18)",
    background: "rgba(255,70,70,0.10)",
    color: "#ffb4b4",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
};
