"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../lib/notifications";

function fmtDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function initials(name = "?") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function InboxPage() {
  const [tab, setTab] = useState("activity");
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [invites, setInvites] = useState([]);
  const [teamRequests, setTeamRequests] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user;

    if (authError || !user) {
      setError("Please log in to view your inbox.");
      setLoading(false);
      return;
    }

    setMe(user);

    const [notificationsRes, invitesRes, teamRes] = await Promise.all([
      fetchNotifications({ limit: 40 }),
      supabase
        .from("training_invites")
        .select(`
          id,
          status,
          response_note,
          created_at,
          session_id,
          inviter:inviter_id (id, name, avatar_url),
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
          requester:requester_id (id, name, avatar_url)
        `)
        .eq("addressee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    if (notificationsRes.error) setError(notificationsRes.error.message);
    if (invitesRes.error) setError(invitesRes.error.message);
    if (teamRes.error) setError(teamRes.error.message);

    setNotifications(notificationsRes.data || []);
    setInvites(invitesRes.data || []);
    setTeamRequests(teamRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications]
  );

  const pendingInvites = useMemo(
    () => invites.filter((invite) => invite.status === "pending"),
    [invites]
  );

  async function acceptInvite(invite) {
    if (!me || !invite?.session_id) return;

    await supabase
      .from("training_invites")
      .update({ status: "accepted" })
      .eq("id", invite.id);

    await supabase
      .from("session_participants")
      .upsert(
        { session_id: invite.session_id, user_id: me.id },
        { onConflict: "session_id,user_id" }
      );

    await load();
  }

  async function declineInvite(invite) {
    await supabase
      .from("training_invites")
      .update({ status: "declined" })
      .eq("id", invite.id);

    await load();
  }

  async function acceptTeamRequest(request) {
    if (!me) return;

    await supabase
      .from("training_partners")
      .update({ status: "accepted" })
      .eq("id", request.id);

    await load();
  }

  async function declineTeamRequest(request) {
    await supabase
      .from("training_partners")
      .update({ status: "rejected" })
      .eq("id", request.id);

    await load();
  }

  async function openNotification(item) {
    if (!item.read_at) {
      await markNotificationRead(item.id);
    }
  }

  const tabs = [
    { id: "activity", label: "Activity", count: unreadCount },
    { id: "invites", label: "Invites", count: pendingInvites.length },
    { id: "messages", label: "Messages", count: teamRequests.length },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-black text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/10 to-lime-300/10 p-6 shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-lime-300">
            Inbox
          </p>
          <h1 className="mt-3 text-5xl font-black leading-none">
            Your activity.
          </h1>
          <p className="mt-4 text-lg font-semibold text-white/60">
            Invites, Team Up requests and important training updates in one place.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-2 rounded-full border border-white/10 bg-black/30 p-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`rounded-full px-3 py-3 text-sm font-black transition ${
                  tab === item.id
                    ? "bg-lime-300 text-black"
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
                {item.count ? (
                  <span className="ml-1 rounded-full bg-black/20 px-1.5">
                    {item.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        {error ? (
          <div className="rounded-3xl border border-lime-300/30 bg-lime-300/10 p-4 font-bold text-lime-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 text-white/60">
            Loading inbox…
          </div>
        ) : null}

        {!loading && tab === "activity" ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-300">
                  Activity
                </p>
                <h2 className="text-2xl font-black">Latest updates</h2>
              </div>
              {unreadCount ? (
                <button
                  onClick={async () => {
                    await markAllNotificationsRead();
                    await load();
                  }}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-white/70"
                >
                  Mark read
                </button>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              {notifications.length ? notifications.map((item) => {
                const href = item.action_url || (item.session_id ? `/trainings/${item.session_id}` : "/inbox");
                return (
                  <Link
                    key={item.id}
                    href={href}
                    onClick={() => openNotification(item)}
                    className={`flex gap-3 rounded-3xl border p-4 transition ${
                      item.read_at
                        ? "border-white/10 bg-black/20"
                        : "border-lime-300/30 bg-lime-300/10"
                    }`}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/10 font-black">
                      {item.actor?.avatar_url ? (
                        <img src={item.actor.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials(item.actor?.name)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-lg font-black">{item.title}</h3>
                        <span className="shrink-0 text-xs font-bold text-white/40">
                          {fmtDate(item.created_at)}
                        </span>
                      </div>
                      {item.body ? (
                        <p className="mt-1 line-clamp-2 text-sm font-semibold text-white/60">
                          {item.body}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                );
              }) : (
                <p className="rounded-3xl bg-black/20 p-5 font-semibold text-white/50">
                  No activity yet.
                </p>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "invites" ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-300">
              Training invites
            </p>
            <h2 className="mt-1 text-2xl font-black">Pending sessions</h2>

            <div className="mt-4 flex flex-col gap-3">
              {invites.length ? invites.map((invite) => (
                <article key={invite.id} className="rounded-3xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                        {invite.status}
                      </p>
                      <h3 className="mt-1 truncate text-2xl font-black">
                        {invite.session?.title || "Training session"}
                      </h3>
                      <p className="mt-2 text-sm font-semibold text-white/60">
                        Invited by {invite.inviter?.name || "teammate"}
                      </p>
                    </div>
                    {invite.inviter?.avatar_url ? (
                      <img src={invite.inviter.avatar_url} alt="" className="h-12 w-12 rounded-2xl object-cover" />
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-sm font-black">
                    {(invite.session?.sports || []).slice(0, 2).map((sport) => (
                      <span key={sport} className="rounded-full bg-lime-300/15 px-3 py-2 text-lime-200">
                        {sport}
                      </span>
                    ))}
                    {invite.session?.start_location ? (
                      <span className="rounded-full bg-white/10 px-3 py-2 text-white/70">
                        {invite.session.start_location}
                      </span>
                    ) : null}
                    {invite.session?.distance_km ? (
                      <span className="rounded-full bg-white/10 px-3 py-2 text-white/70">
                        {invite.session.distance_km} km
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link
                      href={`/trainings/${invite.session_id}`}
                      className="rounded-full border border-white/10 px-4 py-3 text-center font-black text-white"
                    >
                      Open
                    </Link>
                    {invite.status === "pending" ? (
                      <button
                        onClick={() => acceptInvite(invite)}
                        className="rounded-full bg-lime-300 px-4 py-3 font-black text-black"
                      >
                        Accept
                      </button>
                    ) : null}
                  </div>

                  {invite.status === "pending" ? (
                    <button
                      onClick={() => declineInvite(invite)}
                      className="mt-2 w-full rounded-full px-4 py-3 text-sm font-black text-white/50"
                    >
                      Decline
                    </button>
                  ) : null}
                </article>
              )) : (
                <p className="rounded-3xl bg-black/20 p-5 font-semibold text-white/50">
                  No training invites.
                </p>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "messages" ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-300">
              Messages
            </p>
            <h2 className="mt-1 text-2xl font-black">Team requests</h2>

            <div className="mt-4 flex flex-col gap-3">
              {teamRequests.length ? teamRequests.map((request) => (
                <article key={request.id} className="rounded-3xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-2xl bg-white/10">
                      {request.requester?.avatar_url ? (
                        <img src={request.requester.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-xl font-black">
                        {request.requester?.name || "Someone"}
                      </h3>
                      <p className="text-sm font-semibold text-white/50">
                        wants to team up
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => declineTeamRequest(request)}
                      className="rounded-full border border-white/10 px-4 py-3 font-black text-white/70"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => acceptTeamRequest(request)}
                      className="rounded-full bg-lime-300 px-4 py-3 font-black text-black"
                    >
                      Accept
                    </button>
                  </div>
                </article>
              )) : (
                <p className="rounded-3xl bg-black/20 p-5 font-semibold text-white/50">
                  No messages yet.
                </p>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
