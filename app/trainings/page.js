// app/trainings/page.js
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import TrainingCard from "../../components/trainings/TrainingCard";
import TrainingFeedTabs from "../../components/trainings/TrainingFeedTabs";
import TrainingFilters from "../../components/trainings/TrainingFilters";
import FlexibleSessionCard from "../../components/trainings/FlexibleSessionCard";

function matchesSearch(training, search) {
  if (!search) return true;
  const haystack = [
    training.title,
    training.description,
    training.start_location,
    Array.isArray(training.sports) ? training.sports.join(" ") : training.sports,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

export default function TrainingsPage() {
  const [trainings, setTrainings] = useState([]);
  const [participantsBySession, setParticipantsBySession] = useState({});
  const [activeTab, setActiveTab] = useState("upcoming");
  const [search, setSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    const { data: sessions } = await supabase
      .from("training_sessions")
      .select("*")
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(80);

    const sessionRows = sessions || [];
    setTrainings(sessionRows);

    const ids = sessionRows.map((session) => session.id);
    if (ids.length) {
      const { data: participants } = await supabase
        .from("session_participants")
        .select("id,session_id,user_id,profiles(id,name,first_name,last_name,avatar_url)")
        .in("session_id", ids);

      const grouped = {};
      (participants || []).forEach((participant) => {
        grouped[participant.session_id] ||= [];
        grouped[participant.session_id].push(participant);
      });
      setParticipantsBySession(grouped);
    }

    if (user) {
      const [{ count: notificationCount }, { count: inviteCount }] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
      ]);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const now = Date.now();

  const filtered = trainings
    .filter((training) => matchesSearch(training, search))
    .filter((training) => {
      if (activeTab === "flexible") return training.planning_type === "flexible";
      if (activeTab === "team") return training.visibility === "team" || training.visibility === "selected";
      if (activeTab === "nearby") return Boolean(training.start_location);
      return true;
    });

  const needsDecision = trainings.find((training) => training.planning_type === "flexible" && !training.final_starts_at);
  const startingSoon = trainings.filter((training) => {
    const value = training.final_starts_at || training.starts_at;
    if (!value) return false;
    const time = new Date(value).getTime();
    return time >= now && time <= now + 72 * 60 * 60 * 1000;
  }).length;

  const prepared = trainings.filter((training) => training.route_id || training.workout_id).length;
  const teamSessions = trainings.filter((training) => training.visibility === "team" || training.visibility === "selected").length;

  return (
    <main className="endurance-page">
      <AppHeader active="trainings" />

      <section className="endurance-shell training-hero endurance-card">
        <div>
          <p className="eyebrow">Training feed</p>
          <h1>
            Find your next
            <br />
            session<span>.</span>
          </h1>
          <p>
            Join verified sport sessions, respond to flexible planning and see what your team is training next.
          </p>
        </div>
        <Link href="/trainings/new" className="hero-create-button">
          + Create training
        </Link>
      </section>

      <section className="endurance-shell metric-grid">
        <div className="metric-card highlight">
          <span>⚡</span>
          <strong>{needsDecision ? 1 : 0}</strong>
          <div>
            <b>Need planning</b>
            <p>Flexible sessions waiting for availability or a final time.</p>
          </div>
        </div>
        <div className="metric-card">
          <span>⏱</span>
          <strong>{startingSoon}</strong>
          <div>
            <b>Starting soon</b>
            <p>Next 72 hours</p>
          </div>
        </div>
        <div className="metric-card">
          <span>🧭</span>
          <strong>{prepared}</strong>
          <div>
            <b>Prepared</b>
            <p>Route or workout attached</p>
          </div>
        </div>
        <div className="metric-card">
          <span>👥</span>
          <strong>{teamSessions}</strong>
          <div>
            <b>Team sessions</b>
            <p>Upcoming sessions with your team</p>
          </div>
        </div>
      </section>

      <section className="endurance-shell">
        <TrainingFilters value={search} onChange={setSearch} />
        <TrainingFeedTabs active={activeTab} onChange={setActiveTab} />
      </section>

      <section className="endurance-shell training-feed-stack">
        {loading && <div className="endurance-card notification-empty">Loading training feed...</div>}

        {!loading && needsDecision && activeTab !== "nearby" && (
          <FlexibleSessionCard
            training={needsDecision}
            participants={participantsBySession[needsDecision.id] || []}
          />
        )}

        {!loading &&
          filtered.map((training) => (
            <TrainingCard
              key={training.id}
              training={training}
              participants={participantsBySession[training.id] || []}
            />
          ))}

        {!loading && !filtered.length && (
          <div className="endurance-card notification-empty">
            <h2>No sessions found</h2>
            <p>Create a training or change your filters.</p>
            <Link href="/trainings/new" className="primary-action">Create training</Link>
          </div>
        )}
      </section>

      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
